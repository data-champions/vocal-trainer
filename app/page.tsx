'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_NOTATION_MODE,
  PITCH_CHART_HEIGHT,
  PITCH_LOG_INTERVAL_MS,
  VOCAL_RANGES,
  type VocalRangeKey,
} from '../lib/constants';
import {
  ASCENDING_KEYS,
  PIANO_KEYS,
  PianoKey,
  formatNoteByNotation,
  frequencyToNearestNoteName,
  midiFrequency,
  noteIndex,
} from '../lib/notes';
import { getPitchAdvice } from '../lib/pitch';
import { usePianoSequence } from '../lib/hooks/usePianoSequence';
import { usePitchDetection } from '../lib/hooks/usePitchDetection';
import { useEventListener, useRafLoop } from '../lib/hooks/common';
import { RangeSelector } from './components/RangeSelector';
import { SequenceControls } from './components/SequenceControls';
import { PlaybackControls } from './components/PlaybackControls';
import { PitchStatus } from './components/PitchStatus';
import { PitchChart } from './components/PitchChart';

export default function HomePage(): JSX.Element {
  const notationMode = DEFAULT_NOTATION_MODE;
  const [vocalRange, setVocalRange] = useState<VocalRangeKey>('tenor');
  const [selectedNote, setSelectedNote] = useState<PianoKey | ''>('');
  const [duration, setDuration] = useState(1);
  const [noteCount, setNoteCount] = useState(3);
  const [playMode, setPlayMode] = useState<'single' | 'loop'>('single');
  const [noiseThreshold, setNoiseThreshold] = useState(30);
  const [showPlot, setShowPlot] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [currentTargetFrequency, setCurrentTargetFrequency] = useState<
    number | null
  >(null);
  const [currentTargetNote, setCurrentTargetNote] = useState('');
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const currentTargetFrequencyRef = useRef<number | null>(null);
  const currentTargetNoteRef = useRef<string>('');
  const selectedRange = VOCAL_RANGES[vocalRange];
  const rangeBounds = useMemo(() => {
    const startIdx = noteIndex(selectedRange.min);
    const endIdx = noteIndex(selectedRange.max);
    return { startIdx, endIdx };
  }, [selectedRange.min, selectedRange.max]);
  const rangeNotesAsc = useMemo<PianoKey[]>(() => {
    if (rangeBounds.startIdx === -1 || rangeBounds.endIdx === -1) {
      return ASCENDING_KEYS as PianoKey[];
    }
    return ASCENDING_KEYS.slice(
      rangeBounds.startIdx,
      rangeBounds.endIdx + 1
    ) as PianoKey[];
  }, [rangeBounds.startIdx, rangeBounds.endIdx]);
  const allowedNoteSet = useMemo(
    () => new Set<PianoKey>(rangeNotesAsc),
    [rangeNotesAsc]
  );
  const availableNotes = useMemo<PianoKey[]>(
    () => PIANO_KEYS.filter((note) => allowedNoteSet.has(note)),
    [allowedNoteSet]
  );
  useEffect(() => {
    if (availableNotes.length === 0) {
      return;
    }
    const middleIndex = Math.floor(availableNotes.length / 2);
    setSelectedNote(availableNotes[middleIndex]);
  }, [availableNotes]);
  const resetTargets = useCallback(() => {
    setCurrentTargetFrequency(null);
    setCurrentTargetNote('');
    currentTargetFrequencyRef.current = null;
    currentTargetNoteRef.current = '';
  }, []);

  const {
    audioUrl,
    feedback,
    sequenceDescription,
    setSequenceDescription,
    maxNotes,
    sequence,
    sequenceDisplay,
    handleHalfStep,
    canStepDown,
    canStepUp,
    hasAudio,
    playbackScheduleRef,
    lastScheduleNoteRef,
    selectedNoteRef,
  } = usePianoSequence({
    notationMode,
    playMode,
    selectedNote,
    setSelectedNote,
    noteCount,
    duration,
    allowedNoteSet,
    availableNotes,
    rangeBounds,
    onTargetReset: resetTargets,
  });

  useEffect(() => {
    const audioEl = audioElementRef.current;
    if (!audioEl) {
      setIsAudioPlaying(false);
      return;
    }
    const handlePlay = () => setIsAudioPlaying(true);
    const handlePause = () => setIsAudioPlaying(false);
    const handleEnded = () => setIsAudioPlaying(false);
    audioEl.addEventListener('play', handlePlay);
    audioEl.addEventListener('pause', handlePause);
    audioEl.addEventListener('ended', handleEnded);
    setIsAudioPlaying(!audioEl.paused);
    return () => {
      audioEl.removeEventListener('play', handlePlay);
      audioEl.removeEventListener('pause', handlePause);
      audioEl.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  useEffect(() => {
    currentTargetNoteRef.current = currentTargetNote;
  }, [currentTargetNote]);

  useEffect(() => {
    const maxSelectable = Math.min(maxNotes, 16);
    if (noteCount > maxSelectable) {
      setNoteCount(maxSelectable);
    }
  }, [maxNotes, noteCount]);

  useRafLoop(() => {
    const audioEl = audioElementRef.current;
    const schedule = playbackScheduleRef.current;
    const applyTarget = (note: string | null) => {
      const frequency = note ? midiFrequency(note) : null;
      if (currentTargetFrequencyRef.current !== frequency) {
        setCurrentTargetFrequency(frequency);
      }
      const nextNote = note ?? '';
      if (currentTargetNoteRef.current !== nextNote) {
        setCurrentTargetNote(nextNote);
      }
    };
    if (!audioEl || !schedule || schedule.length === 0) {
      lastScheduleNoteRef.current = null;
      applyTarget(selectedNoteRef.current || null);
    } else {
      const time = audioEl.currentTime;
      const segment = schedule.find(
        (entry) => time >= entry.start && time <= entry.end
      );
      if (segment) {
        lastScheduleNoteRef.current = segment.note;
        applyTarget(segment.note);
      } else {
        const fallbackNote =
          lastScheduleNoteRef.current ?? selectedNoteRef.current ?? null;
        applyTarget(fallbackNote);
      }
    }
  }, true);

  const selectedRangeFrequencies = useMemo(() => {
    return {
      min: midiFrequency(selectedRange.min),
      max: midiFrequency(selectedRange.max),
    };
  }, [selectedRange.min, selectedRange.max]);

  const {
    voiceFrequency,
    voiceDetected,
    pitchOutOfRange,
    pitchSamples,
    targetHistory,
    pitchStatus,
    voiceFrequencyRef,
  } = usePitchDetection({
    noiseThreshold,
    selectedRangeFrequencies,
    getTargetFrequency: () => currentTargetFrequencyRef.current,
    audioElementRef,
  });

  useEffect(() => {
    currentTargetFrequencyRef.current = currentTargetFrequency;
  }, [currentTargetFrequency]);

  const sequenceFrequencyBounds = useMemo(() => {
    if (sequence.length === 0) {
      return {
        min: selectedRangeFrequencies.min,
        max: selectedRangeFrequencies.max,
      };
    }
    const frequencies = sequence.map((note) => midiFrequency(note));
    return {
      min: Math.min(...frequencies),
      max: Math.max(...frequencies),
    };
  }, [sequence, selectedRangeFrequencies.min, selectedRangeFrequencies.max]);

  const chartFrequencyBounds = useMemo(() => {
    const startFrequency = selectedNote
      ? midiFrequency(selectedNote)
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
  }, [selectedNote, sequenceFrequencyBounds.min, sequenceFrequencyBounds.max]);

  const voicePitchHistory = useMemo(() => {
    return pitchSamples.map((sample) => sample.pitch);
  }, [pitchSamples]);

  const currentTargetNoteLabel = useMemo(() => {
    if (!currentTargetNote) {
      return '—';
    }
    return formatNoteByNotation(currentTargetNote, notationMode);
  }, [currentTargetNote, notationMode]);

  const currentVoiceNoteLabel = useMemo(() => {
    const noteName = frequencyToNearestNoteName(voiceFrequency);
    if (!noteName) {
      return '—';
    }
    return formatNoteByNotation(noteName, notationMode);
  }, [voiceFrequency, notationMode]);

  const pitchComparisonLabel = useMemo(() => {
    if (!audioUrl || !currentTargetFrequency || pitchStatus !== 'ready') {
      return null;
    }
    if (!voiceFrequency || voiceFrequency <= 0 || currentTargetFrequency <= 0) {
      return null;
    }
    return getPitchAdvice(currentTargetFrequency, voiceFrequency);
  }, [audioUrl, currentTargetFrequency, voiceFrequency, pitchStatus]);

  const isPitchReady = pitchStatus === 'ready';

  useEffect(() => {
    if (pitchStatus !== 'ready') {
      return;
    }
    const intervalId = window.setInterval(() => {
      const audioEl = audioElementRef.current;
      const isAudioPlaying = Boolean(
        audioEl && !audioEl.paused && !audioEl.ended
      );
      if (!isAudioPlaying) {
        return;
      }
      const targetHz = currentTargetFrequencyRef.current;
      const voiceHz = voiceFrequencyRef.current;
      const deltaHz =
        targetHz !== null && voiceHz !== null ? targetHz - voiceHz : null;
      const advice = getPitchAdvice(targetHz, voiceHz) ?? '—';
      const targetNoteLabel = currentTargetNoteRef.current || '—';
      const userNoteLabel = frequencyToNearestNoteName(voiceHz) ?? '—';
      const targetHzLabel =
        targetHz !== null && Number.isFinite(targetHz)
          ? targetHz.toFixed(2)
          : '—';
      const voiceHzLabel =
        voiceHz !== null && Number.isFinite(voiceHz) ? voiceHz.toFixed(2) : '—';
      const deltaHzLabel =
        deltaHz !== null && Number.isFinite(deltaHz) ? deltaHz.toFixed(2) : '—';
      console.log(
        'pitch-log',
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
  }, [pitchStatus, voiceFrequencyRef]);

  useEffect(() => {
    if (!audioUrl || sequence.length === 0) {
      return;
    }
    if (sequenceDescription !== sequenceDisplay) {
      setSequenceDescription(sequenceDisplay);
    }
  }, [
    audioUrl,
    sequence.length,
    sequenceDisplay,
    sequenceDescription,
    setSequenceDescription,
  ]);

  const toggleLoopMode = useCallback(() => {
    setPlayMode((prev) => (prev === 'loop' ? 'single' : 'loop'));
  }, []);

  const pausePlayback = useCallback(() => {
    const audioElement = audioElementRef.current;
    if (audioElement && !audioElement.paused) {
      audioElement.pause();
    }
  }, []);

  useEventListener(
    'keydown',
    (event) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName ?? '';
      const isEditable =
        target?.isContentEditable ||
        tagName === 'INPUT' ||
        tagName === 'SELECT' ||
        tagName === 'TEXTAREA';
      if (isEditable) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        handleHalfStep(1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        handleHalfStep(-1);
      } else if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        pausePlayback();
      }
    },
    typeof window !== 'undefined' ? window : null
  );

  return (
    <main id="home">
      <div className="card-grid">
        <fieldset>
          <legend>Impostazioni</legend>
          <RangeSelector
            vocalRange={vocalRange}
            onChange={setVocalRange}
            notationMode={notationMode}
          />
        </fieldset>

        <SequenceControls
          selectedNote={selectedNote}
          onSelectNote={setSelectedNote}
          availableNotes={availableNotes}
          notationMode={notationMode}
          duration={duration}
          onDurationChange={setDuration}
          noteCount={noteCount}
          onNoteCountChange={setNoteCount}
          maxNotes={maxNotes}
          sequenceDisplay={sequenceDisplay}
          feedback={feedback}
        />
      </div>

      <PlaybackControls
        isPitchReady={isPitchReady}
        noiseThreshold={noiseThreshold}
        onNoiseThresholdChange={setNoiseThreshold}
        selectedNoteLabel={
          selectedNote ? formatNoteByNotation(selectedNote, notationMode) : ''
        }
        canStepDown={canStepDown}
        canStepUp={canStepUp}
        onHalfStep={handleHalfStep}
        isAudioPlaying={isAudioPlaying}
        playMode={playMode}
        onToggleLoop={toggleLoopMode}
        audioElementRef={audioElementRef}
        audioUrl={audioUrl}
        sequenceDescription={sequenceDescription}
        hasAudio={hasAudio}
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
    </main>
  );
}
