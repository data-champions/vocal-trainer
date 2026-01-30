"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { encodeWav } from "../../lib/audio";
import {
  DEFAULT_NOTATION_MODE,
  DEFAULT_VOCAL_RANGE,
  GAP_SECONDS,
  PITCH_CHART_HEIGHT,
  VOCAL_RANGES,
  type VocalRangeKey
} from "../../lib/constants";
import {
  MIDI_A0,
  MIDI_C8,
  NOTE_NAMES,
  formatNoteByNotation,
  frequencyToNearestNoteName,
  midiFrequency
} from "../../lib/notes";
import { getPitchAdvice } from "../../lib/pitch";
import { renderPianoMelody, type PianoNoteEvent } from "../../lib/piano";
import { usePitchDetection } from "../../lib/hooks/usePitchDetection";
import { useEventListener, useLatestRef, useRafLoop } from "../../lib/hooks/common";
import type { PatternScore, PlaybackSegment } from "../../lib/types";
import { PlaybackControls } from "../components/PlaybackControls";
import { PitchChart } from "../components/PitchChart";
import { PitchStatus } from "../components/PitchStatus";
import ScoreViewer from "../compositore/components/ScoreViewer";

const DURATION_BEATS: Record<string, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25,
  w: 4,
  h: 2,
  q: 1,
  "8": 0.5,
  "16": 0.25
};

const NATURAL_TO_SEMITONE: Record<string, number> = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11
};

const EMPTY_NOTE_LABEL = "\u2014";

export type ReplayItem = {
  key: string;
  title: string;
  score: PatternScore | null;
  message?: string;
  meta?: string;
};

type PreparedNote = {
  midi: number;
  durationBeats: number;
  start: number;
};

type PlaybackSegmentWithIndex = PlaybackSegment & {
  noteIndex: number;
};

const parsePitchToMidi = (pitch: string | undefined) => {
  if (!pitch) {
    return null;
  }
  const match = pitch
    .trim()
    .toLowerCase()
    .match(/^([a-g])([#b]?)(?:\/)?(-?\d+)$/);
  if (!match) {
    return null;
  }
  const letter = match[1];
  const accidental = match[2];
  const octave = Number(match[3]);
  if (!Number.isFinite(octave)) {
    return null;
  }
  const semitone = NATURAL_TO_SEMITONE[letter];
  if (semitone === undefined) {
    return null;
  }
  const offset = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  return (octave + 1) * 12 + semitone + offset;
};

const parseDurationBeats = (duration: string | undefined) => {
  const key = (duration ?? "").toLowerCase();
  return DURATION_BEATS[key] ?? 1;
};

const parseStart = (value: number | undefined, fallback: number) => {
  const start = typeof value === "number" ? value : Number(value);
  return Number.isFinite(start) ? start : fallback;
};

const midiToToneNote = (midi: number) => {
  const index = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[index]}${octave}`;
};

const normalizeTempo = (tempo: number | undefined) => {
  if (!tempo || !Number.isFinite(tempo) || tempo <= 0) {
    return 120;
  }
  return tempo;
};

export default function ExerciseReplay({
  item
}: {
  item: ReplayItem;
}) {
  const notationMode = DEFAULT_NOTATION_MODE;
  const { status } = useSession();
  const [vocalRange, setVocalRange] =
    useState<VocalRangeKey>(DEFAULT_VOCAL_RANGE);
  const [transpose, setTranspose] = useState(0);
  const [playMode, setPlayMode] = useState<"single" | "loop">("single");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [noiseThreshold, setNoiseThreshold] = useState(30);
  const [showPlot, setShowPlot] = useState(false);
  const [currentTargetFrequency, setCurrentTargetFrequency] =
    useState<number | null>(null);
  const [currentTargetNote, setCurrentTargetNote] = useState("");
  const [currentTargetNoteIndex, setCurrentTargetNoteIndex] = useState<
    number | null
  >(null);

  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const playbackScheduleRef = useRef<PlaybackSegmentWithIndex[] | null>(null);
  const lastScheduleNoteRef = useRef<string | null>(null);
  const lastScheduleIndexRef = useRef<number | null>(null);
  const currentTargetFrequencyRef = useRef<number | null>(null);
  const currentTargetNoteRef = useRef<string>("");
  const currentTargetNoteIndexRef = useRef<number | null>(null);

  useEffect(() => {
    setTranspose(0);
  }, [item.key]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }
    let isActive = true;
    fetch("/api/users/vocal-range")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Load failed");
        }
        const data = (await response.json().catch(() => ({}))) as {
          vocalRange?: VocalRangeKey;
        };
        if (isActive && data.vocalRange) {
          setVocalRange(data.vocalRange);
        }
      })
      .catch(() => {});
    return () => {
      isActive = false;
    };
  }, [status]);

  const tempo = useMemo(
    () => normalizeTempo(item.score?.metadata?.tempo),
    [item.score?.metadata?.tempo]
  );

  // Keep the staff visually fixed even when playback is transposed.
  const displayScore = item.score;

  const preparedNotes = useMemo<PreparedNote[]>(() => {
    const notes = item.score?.notes;
    if (!Array.isArray(notes)) {
      return [];
    }
    return notes
      .map((note, index) => {
        const midi = parsePitchToMidi(note?.pitch);
        if (midi == null) {
          return null;
        }
        return {
          midi,
          durationBeats: parseDurationBeats(note?.duration),
          start: parseStart(note?.start, index)
        };
      })
      .filter((note): note is PreparedNote => Boolean(note))
      .sort((a, b) => a.start - b.start);
  }, [item.score]);

  const midiBounds = useMemo(() => {
    if (preparedNotes.length === 0) {
      return null;
    }
    const midis = preparedNotes.map((note) => note.midi);
    return { min: Math.min(...midis), max: Math.max(...midis) };
  }, [preparedNotes]);

  const sequenceData = useMemo(() => {
    if (preparedNotes.length === 0) {
      return {
        events: [] as PianoNoteEvent[],
        schedule: [] as PlaybackSegmentWithIndex[],
        sequenceNotes: [] as string[]
      };
    }
    const secondsPerBeat = 60 / tempo;
    let cursor = 0;
    const events: PianoNoteEvent[] = [];
    const schedule: PlaybackSegmentWithIndex[] = [];
    const sequenceNotes: string[] = [];

    preparedNotes.forEach((note, index) => {
      const midi = note.midi + transpose;
      if (midi < MIDI_A0 || midi > MIDI_C8) {
        return;
      }
      const durationSeconds = note.durationBeats * secondsPerBeat;
      if (durationSeconds <= 0) {
        return;
      }
      const noteName = midiToToneNote(midi);
      events.push({ note: noteName, durationSeconds });
      schedule.push({
        note: noteName,
        start: cursor,
        end: cursor + durationSeconds,
        noteIndex: index
      });
      sequenceNotes.push(noteName);
      cursor += durationSeconds + GAP_SECONDS;
    });

    return { events, schedule, sequenceNotes };
  }, [preparedNotes, tempo, transpose]);

  const baseNote = sequenceData.sequenceNotes[0] ?? "";
  const selectedNoteRef = useLatestRef(baseNote);

  const baseNoteLabel = useMemo(() => {
    if (!baseNote) {
      return "";
    }
    return formatNoteByNotation(baseNote, notationMode);
  }, [baseNote, notationMode]);

  const sequenceDescription = useMemo(() => {
    if (sequenceData.sequenceNotes.length === 0) {
      return "";
    }
    return sequenceData.sequenceNotes
      .map((note) => formatNoteByNotation(note, notationMode))
      .join(", ");
  }, [notationMode, sequenceData.sequenceNotes]);

  const canStepDown = midiBounds
    ? midiBounds.min + transpose - 1 >= MIDI_A0
    : false;
  const canStepUp = midiBounds
    ? midiBounds.max + transpose + 1 <= MIDI_C8
    : false;

  const handleHalfStep = (direction: 1 | -1) => {
    if (direction === -1 && !canStepDown) {
      return;
    }
    if (direction === 1 && !canStepUp) {
      return;
    }
    setTranspose((prev) => prev + direction);
  };

  const pausePlayback = useCallback(() => {
    const audioElement = audioElementRef.current;
    if (audioElement && !audioElement.paused) {
      audioElement.pause();
    }
  }, []);

  useEventListener(
    "keydown",
    (event) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName ?? "";
      const isEditable =
        target?.isContentEditable ||
        tagName === "INPUT" ||
        tagName === "SELECT" ||
        tagName === "TEXTAREA";
      if (isEditable) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        handleHalfStep(1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        handleHalfStep(-1);
      } else if (event.code === "Space" || event.key === " ") {
        event.preventDefault();
        pausePlayback();
      }
    },
    typeof window !== "undefined" ? window : null
  );

  useEffect(() => {
    let cancelled = false;

    if (sequenceData.events.length === 0) {
      playbackScheduleRef.current = null;
      lastScheduleNoteRef.current = null;
      lastScheduleIndexRef.current = null;
      setCurrentTargetNote("");
      setCurrentTargetFrequency(null);
      setCurrentTargetNoteIndex(null);
      setAudioUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
      return () => {
        cancelled = true;
      };
    }

    playbackScheduleRef.current = sequenceData.schedule;
    lastScheduleNoteRef.current = null;
    lastScheduleIndexRef.current = null;

    renderPianoMelody(sequenceData.events, GAP_SECONDS)
      .then((rendering) => {
        if (cancelled) {
          return;
        }
        if (!rendering || rendering.samples.length === 0) {
          setAudioUrl((prev) => {
            if (prev) {
              URL.revokeObjectURL(prev);
            }
            return null;
          });
          return;
        }
        const wavBuffer = encodeWav(rendering.samples, rendering.sampleRate, 1);
        const blob = new Blob([wavBuffer], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        setAudioUrl((prev) => {
          if (prev) {
            URL.revokeObjectURL(prev);
          }
          return url;
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error("Errore nella riproduzione del pianoforte", error);
        setAudioUrl((prev) => {
          if (prev) {
            URL.revokeObjectURL(prev);
          }
          return null;
        });
      });

    return () => {
      cancelled = true;
    };
  }, [sequenceData]);

  useEffect(() => {
    const audioEl = audioElementRef.current;
    if (!audioEl) {
      setIsAudioPlaying(false);
      return;
    }
    const handlePlay = () => setIsAudioPlaying(true);
    const handlePause = () => setIsAudioPlaying(false);
    const handleEnded = () => setIsAudioPlaying(false);
    audioEl.addEventListener("play", handlePlay);
    audioEl.addEventListener("pause", handlePause);
    audioEl.addEventListener("ended", handleEnded);
    setIsAudioPlaying(!audioEl.paused);
    return () => {
      audioEl.removeEventListener("play", handlePlay);
      audioEl.removeEventListener("pause", handlePause);
      audioEl.removeEventListener("ended", handleEnded);
    };
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  useEffect(() => {
    currentTargetFrequencyRef.current = currentTargetFrequency;
  }, [currentTargetFrequency]);

  useEffect(() => {
    currentTargetNoteRef.current = currentTargetNote;
  }, [currentTargetNote]);

  useEffect(() => {
    currentTargetNoteIndexRef.current = currentTargetNoteIndex;
  }, [currentTargetNoteIndex]);

  useRafLoop(() => {
    const audioEl = audioElementRef.current;
    const schedule = playbackScheduleRef.current;
    const applyTarget = (note: string | null) => {
      const frequency = note ? midiFrequency(note) : null;
      if (currentTargetFrequencyRef.current !== frequency) {
        setCurrentTargetFrequency(frequency);
      }
      const nextNote = note ?? "";
      if (currentTargetNoteRef.current !== nextNote) {
        setCurrentTargetNote(nextNote);
      }
    };
    const applyActiveIndex = (noteIndex: number | null) => {
      if (currentTargetNoteIndexRef.current !== noteIndex) {
        setCurrentTargetNoteIndex(noteIndex);
      }
    };
    if (!audioEl || !schedule || schedule.length === 0) {
      lastScheduleNoteRef.current = null;
      lastScheduleIndexRef.current = null;
      applyTarget(selectedNoteRef.current || null);
      applyActiveIndex(null);
    } else {
      const time = audioEl.currentTime;
      const segment = schedule.find(
        (entry) => time >= entry.start && time <= entry.end
      );
      if (segment) {
        lastScheduleNoteRef.current = segment.note;
        lastScheduleIndexRef.current = segment.noteIndex;
        applyTarget(segment.note);
        applyActiveIndex(segment.noteIndex);
      } else {
        const fallbackNote =
          lastScheduleNoteRef.current ?? selectedNoteRef.current ?? null;
        applyTarget(fallbackNote);
        applyActiveIndex(null);
      }
    }
  }, true);

  const selectedRange = VOCAL_RANGES[vocalRange];
  const selectedRangeFrequencies = useMemo(() => {
    return {
      min: midiFrequency(selectedRange.min),
      max: midiFrequency(selectedRange.max)
    };
  }, [selectedRange.max, selectedRange.min]);

  const {
    voiceFrequency,
    voiceDetected,
    pitchOutOfRange,
    pitchSamples,
    targetHistory,
    pitchStatus
  } = usePitchDetection({
    noiseThreshold,
    selectedRangeFrequencies,
    getTargetFrequency: () => currentTargetFrequencyRef.current,
    audioElementRef
  });

  const sequenceFrequencyBounds = useMemo(() => {
    if (sequenceData.sequenceNotes.length === 0) {
      return {
        min: selectedRangeFrequencies.min,
        max: selectedRangeFrequencies.max
      };
    }
    const frequencies = sequenceData.sequenceNotes.map((note) =>
      midiFrequency(note)
    );
    return {
      min: Math.min(...frequencies),
      max: Math.max(...frequencies)
    };
  }, [sequenceData.sequenceNotes, selectedRangeFrequencies.max, selectedRangeFrequencies.min]);

  const chartFrequencyBounds = useMemo(() => {
    const startFrequency = baseNote
      ? midiFrequency(baseNote)
      : sequenceFrequencyBounds.min;
    const peakFrequency = Math.max(sequenceFrequencyBounds.max, startFrequency);
    if (
      !Number.isFinite(startFrequency) ||
      !Number.isFinite(peakFrequency) ||
      startFrequency <= 0
    ) {
      return { min: 30, max: 2000 };
    }
    const effectiveStart = startFrequency;
    let effectiveEnd = peakFrequency;
    if (effectiveEnd - effectiveStart < 1) {
      effectiveEnd = effectiveStart + 1;
    }
    const span = effectiveEnd - effectiveStart;
    const toleranceBound = 50;
    const lowerBound = effectiveStart - span / 2 - toleranceBound;
    const upperBound = effectiveEnd + span / 2 + toleranceBound;

    return { min: lowerBound, max: upperBound };
  }, [baseNote, sequenceFrequencyBounds.max, sequenceFrequencyBounds.min]);

  const voicePitchHistory = useMemo(() => {
    return pitchSamples.map((sample) => sample.pitch);
  }, [pitchSamples]);

  const currentTargetNoteLabel = useMemo(() => {
    if (!currentTargetNote) {
      return EMPTY_NOTE_LABEL;
    }
    return formatNoteByNotation(currentTargetNote, notationMode);
  }, [currentTargetNote, notationMode]);

  const currentVoiceNoteLabel = useMemo(() => {
    const noteName = frequencyToNearestNoteName(voiceFrequency);
    if (!noteName) {
      return EMPTY_NOTE_LABEL;
    }
    return formatNoteByNotation(noteName, notationMode);
  }, [notationMode, voiceFrequency]);

  const pitchComparisonLabel = useMemo(() => {
    if (!audioUrl || !currentTargetFrequency || pitchStatus !== "ready") {
      return null;
    }
    if (!voiceFrequency || voiceFrequency <= 0 || currentTargetFrequency <= 0) {
      return null;
    }
    return getPitchAdvice(currentTargetFrequency, voiceFrequency);
  }, [audioUrl, currentTargetFrequency, pitchStatus, voiceFrequency]);

  const isPitchReady = pitchStatus === "ready";
  const activeNoteIndex = isAudioPlaying ? currentTargetNoteIndex : null;

  return (
    <div>
      <h2>{item.title}</h2>
      {item.meta ? (
        <p style={{ margin: "4px 0 0", opacity: 0.8 }}>{item.meta}</p>
      ) : null}
      {item.message ? (
        <p style={{ margin: "8px 0 0", fontStyle: "italic" }}>
          {item.message}
        </p>
      ) : null}
      <ScoreViewer score={displayScore} activeNoteIndex={activeNoteIndex} />

      <PlaybackControls
        isPitchReady={isPitchReady}
        noiseThreshold={noiseThreshold}
        onNoiseThresholdChange={setNoiseThreshold}
        selectedNoteLabel={baseNoteLabel}
        canStepDown={canStepDown}
        canStepUp={canStepUp}
        onHalfStep={handleHalfStep}
        isAudioPlaying={isAudioPlaying}
        playMode={playMode}
        onToggleLoop={() =>
          setPlayMode((prev) => (prev === "loop" ? "single" : "loop"))
        }
        audioElementRef={audioElementRef}
        audioUrl={audioUrl}
        sequenceDescription={sequenceDescription}
        hasAudio={Boolean(audioUrl)}
      />

      <PitchStatus
        isPitchReady={isPitchReady}
        currentTargetNoteLabel={currentTargetNoteLabel}
        currentVoiceNoteLabel={currentVoiceNoteLabel}
        pitchComparisonLabel={pitchComparisonLabel}
        isAudioPlaying={isAudioPlaying}
        showPlot={showPlot}
        onTogglePlot={() => setShowPlot((prev) => !prev)}
        pitchOutOfRange={pitchOutOfRange}
        voiceDetected={voiceDetected}
      />

      <PitchChart
        showPlot={showPlot}
        height={PITCH_CHART_HEIGHT}
        voicePitchHistory={voicePitchHistory}
        targetHistory={targetHistory}
        chartFrequencyBounds={chartFrequencyBounds}
      />
    </div>
  );
}
