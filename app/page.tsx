"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { PitchDetector } from "pitchy";

const SAMPLE_RATE = 44_100;
const GAP_SECONDS = 0.05;
const PITCH_CHART_HEIGHT = 180;
const PIANO_SAMPLE_BASE_URL = "https://tonejs.github.io/audio/salamander/";
const PIANO_SAMPLE_MAP = {
  A0: "A0.mp3",
  C1: "C1.mp3",
  "D#1": "Ds1.mp3",
  "F#1": "Fs1.mp3",
  A1: "A1.mp3",
  C2: "C2.mp3",
  "D#2": "Ds2.mp3",
  "F#2": "Fs2.mp3",
  A2: "A2.mp3",
  C3: "C3.mp3",
  "D#3": "Ds3.mp3",
  "F#3": "Fs3.mp3",
  A3: "A3.mp3",
  C4: "C4.mp3",
  "D#4": "Ds4.mp3",
  "F#4": "Fs4.mp3",
  A4: "A4.mp3",
  C5: "C5.mp3",
  "D#5": "Ds5.mp3",
  "F#5": "Fs5.mp3",
  A5: "A5.mp3",
  C6: "C6.mp3",
  "D#6": "Ds6.mp3",
  "F#6": "Fs6.mp3",
  A6: "A6.mp3",
  C7: "C7.mp3",
  "D#7": "Ds7.mp3",
  "F#7": "Fs7.mp3",
  A7: "A7.mp3",
  C8: "C8.mp3"
} as const;

const PIANO_RELEASE_SECONDS = 2.5;
const PITCH_ADVICE_TOLERANCE_HZ = 18;
const PITCH_LOG_INTERVAL_MS = 10;

// Whole steps (2) and half steps (1) for a major scale: T-T-ST-T-T-T-ST
const MAJOR_SCALE_INTERVALS = [2, 2, 1, 2, 2, 2, 1];
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const MIDI_A0 = 21;
const MIDI_C8 = 108;

const PIANO_KEYS = [
  "C8",
  "B7", "A#7", "A7", "G#7", "G7", "F#7", "F7", "E7", "D#7", "D7", "C#7", "C7",
  "B6", "A#6", "A6", "G#6", "G6", "F#6", "F6", "E6", "D#6", "D6", "C#6", "C6",
  "B5", "A#5", "A5", "G#5", "G5", "F#5", "F5", "E5", "D#5", "D5", "C#5", "C5",
  "B4", "A#4", "A4", "G#4", "G4", "F#4", "F4", "E4", "D#4", "D4", "C#4", "C4",
  "B3", "A#3", "A3", "G#3", "G3", "F#3", "F3", "E3", "D#3", "D3", "C#3", "C3",
  "B2", "A#2", "A2", "G#2", "G2", "F#2", "F2", "E2", "D#2", "D2", "C#2", "C2",
  "B1", "A#1", "A1", "G#1", "G1", "F#1", "F1", "E1", "D#1", "D1", "C#1", "C1",
  "B0", "A#0", "A0"
];

const ASCENDING_KEYS = [...PIANO_KEYS].reverse();

const NOTE_TO_ITALIAN: Record<string, string> = {
  C: "Do",
  "C#": "Do#",
  D: "Re",
  "D#": "Re#",
  E: "Mi",
  F: "Fa",
  "F#": "Fa#",
  G: "Sol",
  "G#": "Sol#",
  A: "La",
  "A#": "La#",
  B: "Si"
};

type ToneModule = typeof import("tone");

type PianoRendering = {
  samples: Float32Array;
  sampleRate: number;
};

let toneModulePromise: Promise<ToneModule> | null = null;
let pianoPreloadPromise: Promise<void> | null = null;
let pianoSamplesReady = false;

function loadToneModule(): Promise<ToneModule> {
  if (!toneModulePromise) {
    toneModulePromise = import("tone");
  }
  return toneModulePromise;
}


function preloadPianoSamples(): Promise<void> {
  if (pianoSamplesReady) {
    return Promise.resolve();
  }
  if (!pianoPreloadPromise) {
    pianoPreloadPromise = (async () => {
      const Tone = await loadToneModule();
      const sampler = new Tone.Sampler({
        urls: PIANO_SAMPLE_MAP,
        release: PIANO_RELEASE_SECONDS,
        baseUrl: PIANO_SAMPLE_BASE_URL
      });
      await sampler.loaded;
      sampler.dispose();
      pianoSamplesReady = true;
    })().catch((error) => {
      console.error("Errore nel pre-caricamento del pianoforte", error);
      pianoPreloadPromise = null;
      throw error;
    });
  }
  return pianoPreloadPromise.then(() => {
    pianoSamplesReady = true;
  });
}

function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) {
    return new Float32Array(0);
  }
  if (channels.length === 1) {
    return channels[0];
  }
  const length = channels[0].length;
  const mono = new Float32Array(length);
  channels.forEach((channel) => {
    for (let i = 0; i < length; i += 1) {
      mono[i] += channel[i] / channels.length;
    }
  });
  return mono;
}

async function renderPianoSequence(
  notes: string[],
  durationSeconds: number,
  gapSeconds = GAP_SECONDS
): Promise<PianoRendering | null> {
  if (notes.length === 0) {
    return null;
  }

  await preloadPianoSamples();
  const Tone = await loadToneModule();
  const sustainSynthRelease = 0.6;
  const releaseTail = Math.max(PIANO_RELEASE_SECONDS, sustainSynthRelease) + 0.5;
  const sequenceSpan = notes.length * (durationSeconds + gapSeconds) - gapSeconds;
  const offlineDuration = Math.max(sequenceSpan + releaseTail, durationSeconds + releaseTail);
  const toneBuffer = await Tone.Offline(async () => {
    const masterGain = new Tone.Gain(0.85).toDestination();
    const sampler = new Tone.Sampler({
      urls: PIANO_SAMPLE_MAP,
      release: PIANO_RELEASE_SECONDS,
      baseUrl: PIANO_SAMPLE_BASE_URL
    }).connect(masterGain);
    const sustainLayer = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 0, sustain: 1, release: sustainSynthRelease }
    }).connect(new Tone.Gain(0.35).connect(masterGain));
    await Tone.loaded();

    let cursor = 0;
    notes.forEach((note) => {
      sampler.triggerAttackRelease(note, durationSeconds, cursor, 0.9);
      // Subtle sustained layer keeps the pitch audible for the full duration.
      sustainLayer.triggerAttackRelease(note, durationSeconds, cursor, 0.5);
      cursor += durationSeconds + gapSeconds;
    });
  }, offlineDuration);

  const channelData = toneBuffer.toArray();
  const channels = Array.isArray(channelData) ? channelData : [channelData];
  if (channels.length === 0) {
    return null;
  }

  const samples = mixToMono(channels);
  return { samples, sampleRate: toneBuffer.sampleRate };
}

type VocalRangeKey =
  | "soprano"
  | "mezzo-soprano"
  | "contralto"
  | "countertenor"
  | "tenor"
  | "baritone"
  | "bass";

const VOCAL_RANGES: Record<VocalRangeKey, { label: string; min: string; max: string }> = {
  soprano: { label: "Soprano", min: "C4", max: "A5" },
  "mezzo-soprano": { label: "Mezzo-soprano", min: "A3", max: "F#5" },
  contralto: { label: "Contralto", min: "F3", max: "D5" },
  countertenor: { label: "Countertenore", min: "G3", max: "E5" },
  tenor: { label: "Tenore", min: "C3", max: "A4" },
  baritone: { label: "Baritono", min: "A2", max: "F4" },
  bass: { label: "Basso", min: "F2", max: "E4" }
};

const noteIndex = (note: string): number => ASCENDING_KEYS.indexOf(note);

type Feedback =
  | { type: "success" | "info" | "warning"; message: string }
  | null;

type PitchSample = {
  pitch: number | null;
  clarity: number;
};

function removeDigits(note: string): string {
  return note.replace(/\d/g, "");
}

function extractOctave(note: string): string {
  const match = note.match(/\d+/);
  return match ? match[0] : "";
}

function toItalianLabel(note: string): string {
  const base = removeDigits(note);
  return `${NOTE_TO_ITALIAN[base] ?? base}${extractOctave(note)}`;
}

function formatNoteByNotation(note: string, mode: "italian" | "english"): string {
  return mode === "italian" ? toItalianLabel(note) : note;
}


function buildAscendingNotes(startNote: string, count: number): string[] {
  if (count <= 0) {
    return [];
  }
  const startIdx = ASCENDING_KEYS.indexOf(startNote);
  if (startIdx === -1) {
    return [];
  }
  const ascending: string[] = [ASCENDING_KEYS[startIdx]];
  let currentIdx = startIdx;
  for (let i = 0; i < count - 1; i += 1) {
    const interval = MAJOR_SCALE_INTERVALS[i % MAJOR_SCALE_INTERVALS.length];
    currentIdx += interval;
    if (currentIdx >= ASCENDING_KEYS.length) {
      break;
    }
    ascending.push(ASCENDING_KEYS[currentIdx]);
  }
  return ascending;
}

function buildSequence(startNote: string, count: number): string[] {
  const ascending = buildAscendingNotes(startNote, count);
  if (ascending.length === 0) {
    return [startNote];
  }

  const descending = ascending.slice(0, -1).reverse();
  return [...ascending, ...descending];
}

function midiFrequency(note: string): number {
  const octave = Number(note.slice(-1));
  const name = note.slice(0, -1);
  const midiNum = NOTE_NAMES.indexOf(name as (typeof NOTE_NAMES)[number]) + 12 * (octave + 1);
  return 440 * 2 ** ((midiNum - 69) / 12);
}

function frequencyToNearestNoteName(frequency: number | null): string | null {
  if (!frequency || !Number.isFinite(frequency) || frequency <= 0) {
    return null;
  }
  const midiValue = Math.round(69 + 12 * Math.log2(frequency / 440));
  const clampedMidi = Math.min(Math.max(midiValue, MIDI_A0), MIDI_C8);
  const noteName = NOTE_NAMES[((clampedMidi % 12) + 12) % 12];
  const octave = Math.floor(clampedMidi / 12) - 1;
  return `${noteName}${octave}`;
}

function getPitchAdvice(targetHz: number | null, voiceHz: number | null): string | null {
  if (
    targetHz === null ||
    voiceHz === null ||
    !Number.isFinite(targetHz) ||
    !Number.isFinite(voiceHz) ||
    targetHz <= 0 ||
    voiceHz <= 0
  ) {
    return null;
  }
  const delta = targetHz - voiceHz;
  if (Math.abs(delta) <= PITCH_ADVICE_TOLERANCE_HZ) {
    return "✅";
  }
  return delta > 0 ? "⬆️" : "⬇️";
}

function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE, numChannels = 1): ArrayBuffer {
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += bytesPerSample;
  }

  return buffer;
}

export default function HomePage(): JSX.Element {
  const [notationMode, setNotationMode] = useState<"italian" | "english">("italian");
  const [vocalRange, setVocalRange] = useState<VocalRangeKey>("tenor");
  const [selectedNote, setSelectedNote] = useState("");
  const [duration, setDuration] = useState(1);
  const [noteCount, setNoteCount] = useState(3);
  const [playMode, setPlayMode] = useState<"single" | "loop">("single");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sequenceDescription, setSequenceDescription] = useState("");
  const [feedback, setFeedback] = useState<Feedback>({ type: "info", message: "Seleziona una nota per iniziare." });
  const [isRendering, setIsRendering] = useState(false);
  const [voiceFrequency, setVoiceFrequency] = useState<number | null>(null);
  const [currentTargetFrequency, setCurrentTargetFrequency] = useState<number | null>(null);
  const [currentTargetNote, setCurrentTargetNote] = useState("");
  const [pitchSamples, setPitchSamples] = useState<PitchSample[]>([]);
  const [targetHistory, setTargetHistory] = useState<(number | null)[]>([]);
  const [pitchStatus, setPitchStatus] = useState<"idle" | "starting" | "ready" | "error">("idle");
  const [pitchError, setPitchError] = useState<string | null>(null);
  const [pitchOutOfRange, setPitchOutOfRange] = useState(false);
  const [isPianoReady, setIsPianoReady] = useState(pianoSamplesReady);
  const [noiseThreshold, setNoiseThreshold] = useState(30);
  const [showPlot, setShowPlot] = useState(true);
  const [voiceDetected, setVoiceDetected] = useState(true);
  const pitchChartContainerRef = useRef<HTMLDivElement | null>(null);
  const pitchChartRef = useRef<uPlot | null>(null);
  const generationIdRef = useRef(0);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const playbackScheduleRef = useRef<{ note: string; start: number; end: number }[] | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pitchDetectorRef = useRef<PitchDetector<Float32Array> | null>(null);
  const pitchRafRef = useRef<number | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserBufferRef = useRef<Float32Array | null>(null);
  const lastSplLogRef = useRef(0);
  const silenceAccumRef = useRef(0);
  const outOfRangeAccumRef = useRef(0);
  const lastPitchTimestampRef = useRef<number | null>(null);
  const voiceFrequencyRef = useRef<number | null>(null);
  const noiseThresholdRef = useRef(noiseThreshold);
  const targetFrequencyRef = useRef<number | null>(null);
  const currentTargetNoteRef = useRef<string>("");
  const selectedNoteRef = useRef<string>("");
  const lastScheduleNoteRef = useRef<string | null>(null);
  const selectedRange = VOCAL_RANGES[vocalRange];
  const rangeBounds = useMemo(() => {
    const startIdx = noteIndex(selectedRange.min);
    const endIdx = noteIndex(selectedRange.max);
    return { startIdx, endIdx };
  }, [selectedRange.min, selectedRange.max]);
  const rangeNotesAsc = useMemo(() => {
    if (rangeBounds.startIdx === -1 || rangeBounds.endIdx === -1) {
      return ASCENDING_KEYS;
    }
    return ASCENDING_KEYS.slice(rangeBounds.startIdx, rangeBounds.endIdx + 1);
  }, [rangeBounds.startIdx, rangeBounds.endIdx]);
  const allowedNoteSet = useMemo(() => new Set(rangeNotesAsc), [rangeNotesAsc]);
  const availableNotes = useMemo(
    () => PIANO_KEYS.filter((note) => allowedNoteSet.has(note)),
    [allowedNoteSet]
  );
  const currentNoteIndex = useMemo(() => (selectedNote ? noteIndex(selectedNote) : -1), [selectedNote]);
  const canStepDown =
    currentNoteIndex !== -1 && rangeBounds.startIdx !== -1 && currentNoteIndex > rangeBounds.startIdx;
  const canStepUp =
    currentNoteIndex !== -1 && rangeBounds.endIdx !== -1 && currentNoteIndex < rangeBounds.endIdx;
  const generateAudioForNote = useCallback(
    async (note: string): Promise<boolean> => {
      if (!note) {
        return false;
      }
      const generatedSequence = buildSequence(note, noteCount);
      if (generatedSequence.length === 0) {
        setFeedback({ type: "warning", message: "La sequenza generata è vuota." });
        return false;
      }

      const requestId = generationIdRef.current + 1;
      generationIdRef.current = requestId;
      setIsRendering(true);
      setFeedback({
        type: "info",
        message: isPianoReady ? "Sto preparando un vero pianoforte..." : "Carico i campioni del pianoforte..."
      });

      try {
        const rendering = await renderPianoSequence(generatedSequence, duration, GAP_SECONDS);
        if (!rendering || rendering.samples.length === 0) {
          if (generationIdRef.current === requestId) {
            setFeedback({ type: "warning", message: "Nessun audio generato; riprova con una durata maggiore." });
          }
          return false;
        }

        const wavBuffer = encodeWav(rendering.samples, rendering.sampleRate, 1);
        const blob = new Blob([wavBuffer], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        if (generationIdRef.current !== requestId) {
          URL.revokeObjectURL(url);
          return false;
        }
        setAudioUrl((prev) => {
          if (prev) {
            URL.revokeObjectURL(prev);
          }
          return url;
        });

        const display = generatedSequence.map((sequenceNote) => formatNoteByNotation(sequenceNote, notationMode)).join(", ");
        setSequenceDescription(display);
        setFeedback({
          type: "success",
          message:
            playMode === "loop"
              ? "Pianoforte pronto in modalità ripetizione infinita. Premi play sul lettore."
              : "Pianoforte pronto. Premi play sul lettore."
        });
        const segments = generatedSequence.map((sequenceNote, idx) => {
          const start = idx * (duration + GAP_SECONDS);
          return { note: sequenceNote, start, end: start + duration };
        });
        playbackScheduleRef.current = segments;
        lastScheduleNoteRef.current = null;
        setCurrentTargetFrequency(null);
        setCurrentTargetNote("");
        return true;
      } catch (error) {
        console.error("Errore nella generazione del pianoforte", error);
        if (generationIdRef.current === requestId) {
          setFeedback({ type: "warning", message: "Errore nella generazione del suono di pianoforte." });
        }
        return false;
      } finally {
        if (generationIdRef.current === requestId) {
          setIsRendering(false);
        }
      }
    },
    [noteCount, duration, notationMode, playMode, isPianoReady]
  );

  const handleHalfStep = useCallback(
    (direction: 1 | -1) => {
      if (!selectedNote) {
        return;
      }
      const idx = noteIndex(selectedNote);
      if (idx === -1) {
        return;
      }
      const nextIdx = idx + direction;
      if (
        nextIdx < 0 ||
        nextIdx >= ASCENDING_KEYS.length ||
        (rangeBounds.startIdx !== -1 && nextIdx < rangeBounds.startIdx) ||
        (rangeBounds.endIdx !== -1 && nextIdx > rangeBounds.endIdx)
      ) {
        return;
      }
      const nextNote = ASCENDING_KEYS[nextIdx];
      setSelectedNote(nextNote);
      if (audioUrl) {
        void generateAudioForNote(nextNote);
      }
    },
    [selectedNote, rangeBounds.startIdx, rangeBounds.endIdx, audioUrl, generateAudioForNote]
  );

  useEffect(() => {
    let cancelled = false;
    preloadPianoSamples()
      .then(() => {
        if (!cancelled) {
          setIsPianoReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsPianoReady(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    voiceFrequencyRef.current = voiceFrequency;
  }, [voiceFrequency]);

  useEffect(() => {
    targetFrequencyRef.current = currentTargetFrequency;
  }, [currentTargetFrequency]);

  useEffect(() => {
    currentTargetNoteRef.current = currentTargetNote;
  }, [currentTargetNote]);

  useEffect(() => {
    noiseThresholdRef.current = noiseThreshold;
  }, [noiseThreshold]);

  useEffect(() => {
    selectedNoteRef.current = selectedNote;
  }, [selectedNote]);

  useEffect(() => {
    if (!selectedNote) {
      return;
    }
    if (!allowedNoteSet.has(selectedNote)) {
      const currentIdx = noteIndex(selectedNote);
      let fallbackIdx = -1;
      if (rangeBounds.startIdx !== -1 && currentIdx !== -1 && currentIdx < rangeBounds.startIdx) {
        fallbackIdx = rangeBounds.startIdx;
      } else if (rangeBounds.endIdx !== -1 && currentIdx !== -1 && currentIdx > rangeBounds.endIdx) {
        fallbackIdx = rangeBounds.endIdx;
      } else if (rangeBounds.startIdx !== -1) {
        fallbackIdx = rangeBounds.startIdx;
      }
      const fallbackNote =
        fallbackIdx !== -1 ? ASCENDING_KEYS[fallbackIdx] : availableNotes[0] ?? "";
      setSelectedNote(fallbackNote);
      if (fallbackNote && audioUrl) {
        void generateAudioForNote(fallbackNote);
      }
    }
  }, [
    allowedNoteSet,
    selectedNote,
    availableNotes,
    rangeBounds.startIdx,
    rangeBounds.endIdx,
    audioUrl,
    generateAudioForNote
  ]);

  useEffect(() => {
    if (!selectedNote) {
      return;
    }
    void generateAudioForNote(selectedNote);
  }, [selectedNote, noteCount, duration, generateAudioForNote]);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  useEffect(() => {
    const audioElement = audioElementRef.current;
    if (!audioElement) {
      setIsPlaying(false);
      return;
    }
    const handlePlayEvent = () => setIsPlaying(true);
    const handlePauseEvent = () => setIsPlaying(false);

    audioElement.addEventListener("play", handlePlayEvent);
    audioElement.addEventListener("pause", handlePauseEvent);
    audioElement.addEventListener("ended", handlePauseEvent);

    return () => {
      audioElement.removeEventListener("play", handlePlayEvent);
      audioElement.removeEventListener("pause", handlePauseEvent);
      audioElement.removeEventListener("ended", handlePauseEvent);
    };
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      if (pitchRafRef.current) {
        cancelAnimationFrame(pitchRafRef.current);
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => undefined);
        audioContextRef.current = null;
      }
      pitchDetectorRef.current = null;
      analyserRef.current = null;
      analyserBufferRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pitchChartRef.current) {
        pitchChartRef.current.destroy();
        pitchChartRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!showPlot && pitchChartRef.current) {
      pitchChartRef.current.destroy();
      pitchChartRef.current = null;
    }
  }, [showPlot]);

  const maxNotes = useMemo(() => {
    if (!selectedNote) {
      return 20;
    }
    const ascending = buildAscendingNotes(selectedNote, PIANO_KEYS.length);
    return ascending.length > 0 ? ascending.length : 1;
  }, [selectedNote]);

  useEffect(() => {
    const maxSelectable = Math.min(maxNotes, 16);
    if (noteCount > maxSelectable) {
      setNoteCount(maxSelectable);
    }
  }, [maxNotes, noteCount]);

  useEffect(() => {
    let rafId: number;
    const updateTarget = () => {
      const audioEl = audioElementRef.current;
      const schedule = playbackScheduleRef.current;
      const applyTarget = (note: string | null) => {
        const frequency = note ? midiFrequency(note) : null;
        if (targetFrequencyRef.current !== frequency) {
          setCurrentTargetFrequency(frequency);
        }
        const nextNote = note ?? "";
        if (currentTargetNoteRef.current !== nextNote) {
          setCurrentTargetNote(nextNote);
        }
      };
      if (!audioEl || !schedule || schedule.length === 0) {
        lastScheduleNoteRef.current = null;
        applyTarget(selectedNoteRef.current || null);
      } else {
        const time = audioEl.currentTime;
        const segment = schedule.find((entry) => time >= entry.start && time <= entry.end);
        if (segment) {
          lastScheduleNoteRef.current = segment.note;
          applyTarget(segment.note);
        } else {
          const fallbackNote = lastScheduleNoteRef.current ?? selectedNoteRef.current ?? null;
          applyTarget(fallbackNote);
        }
      }
      rafId = requestAnimationFrame(updateTarget);
    };
    rafId = requestAnimationFrame(updateTarget);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const sequence = useMemo(() => {
    if (!selectedNote) {
      return [];
    }
    return buildSequence(selectedNote, noteCount);
  }, [selectedNote, noteCount]);

  const sequenceDisplay = useMemo(() => {
    if (sequence.length === 0) {
      return "";
    }
    return sequence.map((note) => formatNoteByNotation(note, notationMode)).join(", ");
  }, [sequence, notationMode]);
  const hasAudio = Boolean(audioUrl);

  const selectedRangeFrequencies = useMemo(() => {
    return {
      min: midiFrequency(selectedRange.min),
      max: midiFrequency(selectedRange.max)
    };
  }, [selectedRange.min, selectedRange.max]);

  const sequenceFrequencyBounds = useMemo(() => {
    if (sequence.length === 0) {
      return {
        min: selectedRangeFrequencies.min,
        max: selectedRangeFrequencies.max
      };
    }
    const frequencies = sequence.map((note) => midiFrequency(note));
    return {
      min: Math.min(...frequencies),
      max: Math.max(...frequencies)
    };
  }, [sequence, selectedRangeFrequencies.min, selectedRangeFrequencies.max]);

  const chartFrequencyBounds = useMemo(() => {
    const startFrequency = selectedNote ? midiFrequency(selectedNote) : sequenceFrequencyBounds.min;
    const peakFrequency = Math.max(sequenceFrequencyBounds.max, startFrequency);
    if (!Number.isFinite(startFrequency) || !Number.isFinite(peakFrequency) || startFrequency <= 0) {
      return { min: 30, max: 2000 };
    }
    const effectiveStart = startFrequency;
    let effectiveEnd = peakFrequency;
    if (effectiveEnd - effectiveStart < 1) {
      effectiveEnd = effectiveStart + 1;
    }
    const span = effectiveEnd - effectiveStart;
    const toleranceBound = 50;
    const lowerBound = (effectiveStart - span / 2) - toleranceBound;
    const upperBound = (effectiveEnd + span / 2) + toleranceBound;

    return { min: lowerBound, max: upperBound };
  }, [selectedNote, sequenceFrequencyBounds.min, sequenceFrequencyBounds.max]);

  const voicePitchHistory = useMemo(() => {
    return pitchSamples.map((sample) => sample.pitch);
  }, [pitchSamples]);

  const currentTargetNoteLabel = useMemo(() => {
    if (!currentTargetNote) {
      return "—";
    }
    return formatNoteByNotation(currentTargetNote, notationMode);
  }, [currentTargetNote, notationMode]);

  const currentVoiceNoteLabel = useMemo(() => {
    const noteName = frequencyToNearestNoteName(voiceFrequency);
    if (!noteName) {
      return "—";
    }
    return formatNoteByNotation(noteName, notationMode);
  }, [voiceFrequency, notationMode]);

  const pitchComparisonLabel = useMemo(() => {
    if (!audioUrl || !currentTargetFrequency || pitchStatus !== "ready") {
      return null;
    }
    if (!voiceFrequency || voiceFrequency <= 0 || currentTargetFrequency <= 0) {
      return null;
    }
    return getPitchAdvice(currentTargetFrequency, voiceFrequency);
  }, [audioUrl, currentTargetFrequency, voiceFrequency, pitchStatus]);

  const pitchStatusLabel = useMemo(() => {
    switch (pitchStatus) {
      case "ready":
        return "Microfono attivo";
      case "starting":
        return "Attivazione microfono...";
      case "error":
        return pitchError ?? "Errore microfono";
      default:
        return "Microfono inattivo";
    }
  }, [pitchStatus, pitchError]);

  useEffect(() => {
    if (pitchStatus !== "ready") {
      return;
    }
    const intervalId = window.setInterval(() => {
      const audioEl = audioElementRef.current;
      const isAudioPlaying = Boolean(audioEl && !audioEl.paused && !audioEl.ended);
      if (!isAudioPlaying) {
        return;
      }
      const targetHz = targetFrequencyRef.current;
      const voiceHz = voiceFrequencyRef.current;
      const deltaHz = targetHz !== null && voiceHz !== null ? targetHz - voiceHz : null;
      const advice = getPitchAdvice(targetHz, voiceHz) ?? "—";
      const targetNoteLabel = currentTargetNoteRef.current || "—";
      const userNoteLabel = frequencyToNearestNoteName(voiceHz) ?? "—";
      const targetHzLabel = targetHz !== null && Number.isFinite(targetHz) ? targetHz.toFixed(2) : "—";
      const voiceHzLabel = voiceHz !== null && Number.isFinite(voiceHz) ? voiceHz.toFixed(2) : "—";
      const deltaHzLabel = deltaHz !== null && Number.isFinite(deltaHz) ? deltaHz.toFixed(2) : "—";
      console.log(
        "pitch-log",
        `target:${targetNoteLabel}`,
        `user:${userNoteLabel}`,
        `targetHz:${targetHzLabel}`,
        `userHz:${voiceHzLabel}`,
        `deltaHz:${deltaHzLabel}`,
        `advice:${advice}`
      );
    }, PITCH_LOG_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [pitchStatus]);

  useEffect(() => {
    if (!showPlot) {
      return;
    }
    const container = pitchChartContainerRef.current;
    if (!container) {
      return;
    }

    const maxLength = Math.max(voicePitchHistory.length, targetHistory.length, 1);
    const labels = Array.from({ length: maxLength }, (_, index) => index);
    const voicedData = labels.map((_, idx) => {
      const value = voicePitchHistory[idx] ?? null;
      if (value === null) {
        return null;
      }
      if (value < chartFrequencyBounds.min || value > chartFrequencyBounds.max) {
        return null;
      }
      return value;
    });
    const targetData = labels.map((_, idx) => targetHistory[idx] ?? null);
    const chartData: uPlot.AlignedData = [labels, targetData, voicedData];
    const width = container.clientWidth || 320;

    if (!pitchChartRef.current) {
      pitchChartRef.current = new uPlot(
        {
          width,
          height: PITCH_CHART_HEIGHT,
          scales: {
            x: { time: false },
            y: {
              min: chartFrequencyBounds.min,
              max: chartFrequencyBounds.max
            }
          },
          axes: [
            { show: false },
            {
              label: "Frequenza (Hz)",
              stroke: "#cbd5f5",
              grid: { stroke: "rgba(255,255,255,0.1)" }
            }
          ],
          legend: { show: false },
          series: [
            {},
            {
              label: "Nota bersaglio (Hz)",
              stroke: "rgba(80, 220, 120, 1)",
              width: 2,
              spanGaps: true,
              points: { show: false }
            },
            {
              label: "Voce (Hz)",
              stroke: "rgba(255, 214, 102, 1)",
              width: 2,
              spanGaps: true,
              points: { show: false }
            }
          ]
        },
        chartData,
        container
      );
      return;
    }

    pitchChartRef.current.setScale("y", { min: chartFrequencyBounds.min, max: chartFrequencyBounds.max });
    pitchChartRef.current.setData(chartData);
  }, [voicePitchHistory, targetHistory, chartFrequencyBounds.min, chartFrequencyBounds.max, showPlot]);

  useEffect(() => {
    const handleResize = () => {
      const container = pitchChartContainerRef.current;
      const chart = pitchChartRef.current;
      if (!container || !chart || !showPlot) {
        return;
      }
      const width = container.clientWidth || 320;
      chart.setSize({ width, height: PITCH_CHART_HEIGHT });
    };

    window.addEventListener("resize", handleResize);
    handleResize();
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [showPlot]);

  useEffect(() => {
    if (!audioUrl || sequence.length === 0) {
      return;
    }
    if (sequenceDescription !== sequenceDisplay) {
      setSequenceDescription(sequenceDisplay);
    }
  }, [audioUrl, sequence.length, sequenceDisplay, sequenceDescription]);

  const toggleLoopMode = useCallback(() => {
    setPlayMode((prev) => (prev === "loop" ? "single" : "loop"));
  }, []);

  const pausePlayback = useCallback(() => {
    const audioElement = audioElementRef.current;
    if (audioElement && !audioElement.paused) {
      audioElement.pause();
    }
  }, []);

  const startPitchDetection = useCallback(async () => {
    if (pitchStatus === "starting" || pitchStatus === "ready") {
      return;
    }
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }
    try {
      setPitchStatus("starting");
      setPitchError(null);
      if (!navigator.mediaDevices) {
        throw new Error("Media devices non disponibili");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
           // TODO mic controls
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: false
        }
      });
      micStreamRef.current = stream;
      const win = window as typeof window & { webkitAudioContext?: typeof AudioContext };
      const AudioCtx = win.AudioContext ?? win.webkitAudioContext;
      if (!AudioCtx) {
        throw new Error("AudioContext non supportato");
      }
      const audioContext = new AudioCtx();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      // Trim low rumble before pitch detection.
      const highPass = audioContext.createBiquadFilter();
      highPass.type = "highpass";
      highPass.frequency.value = 40;
      const analyser = audioContext.createAnalyser();
      // TODO see if fftSize creates performance issues
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      analyserBufferRef.current = new Float32Array(analyser.fftSize);
      pitchDetectorRef.current = PitchDetector.forFloat32Array(analyser.fftSize);
      source.connect(highPass);
      highPass.connect(analyser);
      setPitchSamples([]);
      setTargetHistory([]);
      setVoiceFrequency(null);
      setVoiceDetected(true);
      silenceAccumRef.current = 0;
      setPitchOutOfRange(false);
      outOfRangeAccumRef.current = 0;
      lastPitchTimestampRef.current = null;

      const detectPitch = () => {
        if (!analyserRef.current || !pitchDetectorRef.current || !analyserBufferRef.current || !audioContextRef.current) {
          pitchRafRef.current = requestAnimationFrame(detectPitch);
          return;
        }
        const now = performance.now();
        const lastTick = lastPitchTimestampRef.current ?? now;
        const deltaMs = now - lastTick;
        lastPitchTimestampRef.current = now;
        analyserRef.current.getFloatTimeDomainData(analyserBufferRef.current);
        const [pitch, clarity] = pitchDetectorRef.current.findPitch(analyserBufferRef.current, audioContextRef.current.sampleRate);
        const voiceCandidate = pitch > 30 && pitch < 2000 ? pitch : null;
        let splDb = -Infinity;
        // this monitor sound pressure level (dBFS) how strong a sound is
        // 0 is max volume, silence is -infinity
        // Log SPL (approx. dBFS) periodically to monitor input level.
        if (analyserBufferRef.current) {
          let sumSquares = 0;
          for (let i = 0; i < analyserBufferRef.current.length; i += 1) {
            const sample = analyserBufferRef.current[i];
            sumSquares += sample * sample;
          }
          const rms = Math.sqrt(sumSquares / analyserBufferRef.current.length) || 1e-8;
          splDb = 20 * Math.log10(rms);
          if (now - lastSplLogRef.current > 200) {
            // console.log("SPL (dBFS):", splDb.toFixed(1));
            lastSplLogRef.current = now;
          }
        }

        const splCutoff = -100 + noiseThresholdRef.current; // Slider: 0 lets all through, 100 blocks nearly everything.
        const belowNoiseFloor = splDb < splCutoff;
        const hasSignal = !belowNoiseFloor;
        const voiceValue = hasSignal ? voiceCandidate : null;
        const audioEl = audioElementRef.current;
        const isAudioPlaying = Boolean(audioEl && !audioEl.paused && !audioEl.ended);
        const targetValue = isAudioPlaying ? targetFrequencyRef.current ?? null : null;

        if (hasSignal) {
          silenceAccumRef.current = 0;
          setVoiceDetected(true);
        } else {
          silenceAccumRef.current += deltaMs;
          if (silenceAccumRef.current >= 500 && voiceDetected) {
            setVoiceDetected(false);
          }
        }

        if (voiceValue !== null) {
          setVoiceFrequency(voiceValue);
          voiceFrequencyRef.current = voiceValue;
          const inRange = voiceValue >= selectedRangeFrequencies.min && voiceValue <= selectedRangeFrequencies.max;
          if (inRange) {
            outOfRangeAccumRef.current = 0;
            setPitchOutOfRange(false);
          } else {
            outOfRangeAccumRef.current += deltaMs;
            setPitchOutOfRange(outOfRangeAccumRef.current >= 500);
          }
        } else {
          setVoiceFrequency(null);
          voiceFrequencyRef.current = null;
          outOfRangeAccumRef.current = 0;
          setPitchOutOfRange(false);
        }

        if (isAudioPlaying) {
          setPitchSamples((prev) => {
            const next = [...prev, { pitch: voiceValue, clarity }];
            const limit = 150;
            return next.length > limit ? next.slice(next.length - limit) : next;
          });
          setTargetHistory((prev) => {
            const next = [...prev, targetValue];
            const limit = 150;
            return next.length > limit ? next.slice(next.length - limit) : next;
          });
        }

        pitchRafRef.current = requestAnimationFrame(detectPitch);
      };

      setPitchOutOfRange(false);
      setPitchStatus("ready");
      pitchRafRef.current = requestAnimationFrame(detectPitch);
    } catch (error) {
      console.error("Impossibile avviare la pitch detection", error);
      setPitchStatus("error");
      setPitchError("Consenti l'accesso al microfono per rilevare la voce.");
    }
  }, [pitchStatus, selectedRangeFrequencies.min, selectedRangeFrequencies.max, voiceDetected]);

  useEffect(() => {
    if (pitchStatus === "idle") {
      void startPitchDetection();
    }
  }, [pitchStatus, startPitchDetection]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
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
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleHalfStep, pausePlayback]);

  return (
    <main>
      <h1>Voice trainer 🎹</h1>
      <div className="card-grid">
        <fieldset>
          <legend>Impostazioni di notazione</legend>
          <div className="toggle-row">
            <p>Notazione</p>
            <div className="toggle-group" role="group" aria-label="Seleziona la notazione">
              <button
                type="button"
                className={`toggle-option${notationMode === "italian" ? " active" : ""}`}
                aria-pressed={notationMode === "italian"}
                onClick={() => setNotationMode("italian")}
              >
                🇮🇹 Italiana
              </button>
              <button
                type="button"
                className={`toggle-option${notationMode === "english" ? " active" : ""}`}
                aria-pressed={notationMode === "english"}
                onClick={() => setNotationMode("english")}
              >
                🇬🇧 Inglese
              </button>
            </div>
          </div>
          <label htmlFor="vocal-range-select" style={{ marginTop: "12px", display: "block" }}>
            Estensione vocale
            <select
              id="vocal-range-select"
              value={vocalRange}
              onChange={(event) => setVocalRange(event.target.value as VocalRangeKey)}
            >
              {(Object.keys(VOCAL_RANGES) as VocalRangeKey[]).map((rangeKey) => {
                const range = VOCAL_RANGES[rangeKey];
                const minLabel = formatNoteByNotation(range.min, notationMode);
                const maxLabel = formatNoteByNotation(range.max, notationMode);
                return (
                  <option key={rangeKey} value={rangeKey}>
                    {`${range.label} (${minLabel}–${maxLabel})`}
                  </option>
                );
              })}
            </select>
          </label>
        </fieldset>

        <fieldset>
          <legend>Sequenza e controlli</legend>
          <label htmlFor="note-select">
            Nota iniziale
            <select
              id="note-select"
              className={!selectedNote ? "error-input" : undefined}
              value={selectedNote}
              onChange={(event) => setSelectedNote(event.target.value)}
            >
              <option value="" disabled>
                Seleziona la nota
              </option>
              {availableNotes.map((note) => (
                <option key={note} value={note}>
                  {formatNoteByNotation(note, notationMode)}
                </option>
              ))}
            </select>
          </label>

          <label htmlFor="duration-slider">
            Durata di ogni nota: {duration.toFixed(1)} secondi
            <input
              id="duration-slider"
              type="range"
              min={0.1}
              max={5}
              step={0.1}
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
            />
          </label>

          <label htmlFor="note-count">
            Numero di note ascendenti
            <select
              id="note-count"
              value={String(noteCount)}
              onChange={(event) => setNoteCount(Number(event.target.value))}
            >
              {[1, 2, 3,4,5,6,7,8,9,10,11,12,13,14,15,16].map((option) => (
                <option
                  key={option}
                  value={option}
                  disabled={option > Math.min(maxNotes, 16)}
                >
                  {option}
                </option>
              ))}
            </select>
            <small>Massimo disponibile: {Math.min(maxNotes, 16)}</small>
          </label>

          {sequence.length > 0 && (
            <p className="note-display">
              Sequenza selezionata: {sequenceDisplay}
            </p>
          )}

          {feedback && (
            <div className={`feedback ${feedback.type}`} style={{ marginTop: "12px" }}>
              {feedback.message}
            </div>
          )}
        </fieldset>
      </div>

      <fieldset style={{ marginTop: "16px" }}>
        <legend>Modalità e riproduzione</legend>
        {/* <div className="player-card" style={{ marginTop: "12px" }}> */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "6px",
              justifyContent: "space-between",
              marginBottom: "10px"
            }}
          >
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <button
                className="secondary-button"
                type="button"
                aria-label="Abbassa nota di mezzo tono"
                onClick={() => handleHalfStep(-1)}
                disabled={!canStepDown}
                style={{ padding: "6px 10px", fontSize: "0.9rem" }}
              >
                ⬇️ Nota giù
              </button>
              <button
                className="secondary-button"
                type="button"
                aria-label="Alza nota di mezzo tono"
                onClick={() => handleHalfStep(1)}
                disabled={!canStepUp}
                style={{ padding: "6px 10px", fontSize: "0.9rem" }}
              >
                ⬆️ Nota su
              </button>
              <button
                className={`secondary-button${playMode === "loop" ? " active" : ""}`}
                type="button"
                aria-pressed={playMode === "loop"}
                onClick={toggleLoopMode}
                style={{ padding: "6px 10px", fontSize: "0.9rem" }}
              >
                🔁 {playMode === "loop" ? "Ripeti attivo" : "Ripeti"}
              </button>
            </div>
          </div>
          <audio
            key={audioUrl ?? "audio-player"}
            ref={audioElementRef}
            controls
            autoPlay
            loop={playMode === "loop"}
            src={audioUrl ?? ""}
            aria-label={sequenceDescription ? `Sequenza: ${sequenceDescription}` : "Audio generato"}
            style={{ width: "100%" }}
          />
          <p
            style={{
              margin: "8px 0 0",
              fontSize: "0.95rem",
              opacity: hasAudio ? 0.9 : 1,
              color: hasAudio ? "inherit" : "#ff4d4f",
              fontWeight: hasAudio ? 500 : 800
            }}
          >
            {hasAudio
              ? ``
              : "🎵 Seleziona una nota per iniziare: l'audio sarà generato in automatico e potrai usare i controlli qui sopra."}
          </p>
        {/* </div> */}
      </fieldset>

      <section className="player-card" style={{ marginTop: "16px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <h2 style={{ margin: 0 }}>Rilevamento intonazione</h2>
            <p style={{ margin: 0, fontSize: "0.9rem", opacity: 0.8 }}>{pitchStatusLabel}</p>
          </div>
          {pitchStatus === "ready" ? (
            <span style={{ fontWeight: 600 }}>🎙️ Microfono attivo</span>
          ) : (
            <button
              className={`secondary-button microphone-button microphone-button--error`}
              type="button"
              onClick={startPitchDetection}
              disabled={pitchStatus === "starting"}
            >
              {pitchStatus === "starting" ? "Attivazione..." : "Abilita microfono"}
            </button>
          )}
        </div>
        {pitchError && (
          <p className="error-text" style={{ marginTop: "8px" }}>
            {pitchError}
          </p>
        )}
        <label className="noise-filter-control" style={{ width: "100%", marginTop: pitchError ? "4px" : "12px" }}>
          <span>Filtro rumore microfono (soglia dB): {noiseThreshold.toFixed(0)}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={noiseThreshold}
            onChange={(event) => setNoiseThreshold(Number(event.target.value))}
          />
        </label>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            marginTop: "12px",
            marginBottom: "8px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <p style={{ margin: "0 0 4px" }}>Nota pianoforte: {currentTargetNoteLabel}</p>
              <p style={{ margin: 0 }}>Nota voce: {currentVoiceNoteLabel}</p>
            </div>
            <div
              style={{
                fontSize: "2.4rem",
                minWidth: "64px",
                textAlign: "center",
                opacity: pitchComparisonLabel ? 1 : 0.4
              }}
            >
              {pitchComparisonLabel ?? "🎵"}
            </div>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setShowPlot((prev) => !prev)}
          >
            {showPlot ? "Nascondi grafico" : "Mostra grafico"}
          </button>
        </div>
        {showPlot && (
          <div style={{ height: `${PITCH_CHART_HEIGHT}px` }}>
            <div ref={pitchChartContainerRef} style={{ height: "100%", width: "100%" }} />
          </div>
        )}
        <div className="pitch-warning-slot">
          {pitchOutOfRange ? (
            <button
              type="button"
              className="secondary-button flash-button"
              style={{
                backgroundColor: "#ff6b6b",
                borderColor: "#ff6b6b",
                color: "#fff"
              }}
            >
              Pitch fuori dai limiti, controlla l&aposestensione vocale
            </button>
          ) : (
            !voiceDetected && (
              <div
                className="secondary-button"
                style={{
                  backgroundColor: "#2a2e52",
                  borderColor: "#394070",
                  color: "#cbd5f5",
                  opacity: 0.9
                }}
              >
                Nessun audio rilevato
              </div>
            )
          )}
        </div>
      </section>
    </main>
  );
}
