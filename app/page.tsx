'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import {
  DEFAULT_NOTATION_MODE,
  PITCH_CHART_HEIGHT,
  PITCH_LOG_INTERVAL_MS,
  VOCAL_RANGES,
  type NotationMode,
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

export default function HomePage(): JSX.Element {
  const [notationMode, setNotationMode] =
    useState<NotationMode>(DEFAULT_NOTATION_MODE);
  const [vocalRange, setVocalRange] = useState<VocalRangeKey>('tenor');
  const [selectedNote, setSelectedNote] = useState<PianoKey | ''>('');
  const [duration, setDuration] = useState(1);
  const [noteCount, setNoteCount] = useState(3);
  const [playMode, setPlayMode] = useState<'single' | 'loop'>('single');
  const [noiseThreshold, setNoiseThreshold] = useState(30);
  const [showPlot, setShowPlot] = useState(true);
  const [currentTargetFrequency, setCurrentTargetFrequency] = useState<
    number | null
  >(null);
  const [currentTargetNote, setCurrentTargetNote] = useState('');
  const pitchChartContainerRef = useRef<HTMLDivElement | null>(null);
  const pitchChartRef = useRef<uPlot | null>(null);
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
    isPianoReady,
    maxNotes,
    sequence,
    sequenceDisplay,
    handleHalfStep,
    canStepDown,
    canStepUp,
    generateAudioForNote,
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
    currentTargetNoteRef.current = currentTargetNote;
  }, [currentTargetNote]);

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
      if (targetFrequencyRef.current !== frequency) {
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
    targetFrequencyRef,
    voiceFrequencyRef,
  } = usePitchDetection({
    noiseThreshold,
    selectedRangeFrequencies,
    getTargetFrequency: () => currentTargetFrequencyRef.current,
    audioElementRef,
  });

  useEffect(() => {
    currentTargetFrequencyRef.current = currentTargetFrequency;
    targetFrequencyRef.current = currentTargetFrequency;
  }, [currentTargetFrequency, targetFrequencyRef]);

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
      const targetHz = targetFrequencyRef.current;
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
  }, [pitchStatus]);

  useEffect(() => {
    if (!showPlot) {
      return;
    }
    const container = pitchChartContainerRef.current;
    if (!container) {
      return;
    }

    const maxLength = Math.max(
      voicePitchHistory.length,
      targetHistory.length,
      1
    );
    const labels = Array.from({ length: maxLength }, (_, index) => index);
    const voicedData = labels.map((_, idx) => {
      const value = voicePitchHistory[idx] ?? null;
      if (value === null) {
        return null;
      }
      if (
        value < chartFrequencyBounds.min ||
        value > chartFrequencyBounds.max
      ) {
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
              max: chartFrequencyBounds.max,
            },
          },
          axes: [
            { show: false },
            {
              label: 'Frequenza (Hz)',
              stroke: '#cbd5f5',
              grid: { stroke: 'rgba(255,255,255,0.1)' },
            },
          ],
          legend: { show: false },
          series: [
            {},
            {
              label: 'Nota bersaglio (Hz)',
              stroke: 'rgba(80, 220, 120, 1)',
              width: 2,
              spanGaps: true,
              points: { show: false },
            },
            {
              label: 'Voce (Hz)',
              stroke: 'rgba(255, 214, 102, 1)',
              width: 2,
              spanGaps: true,
              points: { show: false },
            },
          ],
        },
        chartData,
        container
      );
      return;
    }

    pitchChartRef.current.setScale('y', {
      min: chartFrequencyBounds.min,
      max: chartFrequencyBounds.max,
    });
    pitchChartRef.current.setData(chartData);
  }, [
    voicePitchHistory,
    targetHistory,
    chartFrequencyBounds.min,
    chartFrequencyBounds.max,
    showPlot,
  ]);

  const handleResize = useCallback(() => {
    const container = pitchChartContainerRef.current;
    const chart = pitchChartRef.current;
    if (!container || !chart || !showPlot) {
      return;
    }
    const width = container.clientWidth || 320;
    chart.setSize({ width, height: PITCH_CHART_HEIGHT });
  }, [showPlot]);

  useEffect(() => {
    handleResize();
  }, [handleResize]);

  useEventListener('resize', handleResize);

  useEffect(() => {
    if (!audioUrl || sequence.length === 0) {
      return;
    }
    if (sequenceDescription !== sequenceDisplay) {
      setSequenceDescription(sequenceDisplay);
    }
  }, [audioUrl, sequence.length, sequenceDisplay, sequenceDescription]);

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
    <main>
      <h1>Voice trainer 🎹</h1>
      <div className="card-grid">
        <fieldset>
          <legend>Impostazioni di notazione</legend>
          <div className="toggle-row">
            <p>Notazione</p>
            <div
              className="toggle-group"
              role="group"
              aria-label="Seleziona la notazione"
            >
              <button
                type="button"
                className={`toggle-option${
                  notationMode === 'italian' ? ' active' : ''
                }`}
                aria-pressed={notationMode === 'italian'}
                onClick={() => setNotationMode('italian')}
              >
                🇮🇹 Italiana
              </button>
              <button
                type="button"
                className={`toggle-option${
                  notationMode === 'english' ? ' active' : ''
                }`}
                aria-pressed={notationMode === 'english'}
                onClick={() => setNotationMode('english')}
              >
                🇬🇧 Inglese
              </button>
            </div>
          </div>
          <label
            className="stacked-label"
            htmlFor="vocal-range-select"
            style={{ marginTop: '12px' }}
          >
            Estensione vocale
            <select
              id="vocal-range-select"
              value={vocalRange}
              onChange={(event) =>
                setVocalRange(event.target.value as VocalRangeKey)
              }
            >
              {(Object.keys(VOCAL_RANGES) as VocalRangeKey[]).map(
                (rangeKey) => {
                  const range = VOCAL_RANGES[rangeKey];
                  const minLabel = formatNoteByNotation(
                    range.min,
                    notationMode
                  );
                  const maxLabel = formatNoteByNotation(
                    range.max,
                    notationMode
                  );
                  return (
                    <option key={rangeKey} value={rangeKey}>
                      {`${range.label} (${minLabel}–${maxLabel})`}
                    </option>
                  );
                }
              )}
            </select>
          </label>
        </fieldset>

        <fieldset>
          <legend>Sequenza e controlli</legend>
          <label className="stacked-label" htmlFor="note-select">
            Nota iniziale
            <select
              id="note-select"
              className={!selectedNote ? 'error-input' : undefined}
              value={selectedNote}
              onChange={(event) =>
                setSelectedNote(event.target.value as PianoKey)
              }
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

          <label className="stacked-label" htmlFor="duration-slider">
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
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(
                (option) => (
                  <option
                    key={option}
                    value={option}
                    disabled={option > Math.min(maxNotes, 16)}
                  >
                    {option}
                  </option>
                )
              )}
            </select>
          </label>

          {sequence.length > 0 && (
            <p className="note-display">
              Sequenza selezionata: {sequenceDisplay}
            </p>
          )}

          {feedback && (
            <div
              className={`feedback ${feedback.type}`}
              style={{ marginTop: '12px' }}
            >
              {feedback.message}
            </div>
          )}
        </fieldset>
      </div>

      <fieldset style={{ marginTop: '16px' }}>
        <legend>Modalità e riproduzione</legend>
        {!isPitchReady ? (
          <div className="player-card" style={{ marginTop: '8px' }}>
            <p style={{ margin: 0, color: '#ff4d4f', fontWeight: 800 }}>
              autorizzare il microfono per usare le funzionalita&apos; di
              rilevamento vocale
            </p>
          </div>
        ) : (
          <label
            className="noise-filter-control"
            style={{ width: '100%', marginTop: '8px' }}
          >
            <span>Filtro rumore (soglia dB): {noiseThreshold.toFixed(0)}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={noiseThreshold}
              onChange={(event) =>
                setNoiseThreshold(Number(event.target.value))
              }
            />
          </label>
        )}

        <div className="playback-actions">
          <div>
            <button
              className="secondary-button"
              type="button"
              aria-label="Abbassa nota di mezzo tono"
              onClick={() => handleHalfStep(-1)}
              disabled={!canStepDown}
              style={{ padding: '6px 1px', fontSize: '0.8rem' }}
            >
              ⬇️ Nota giù
            </button>
            <button
              className="secondary-button"
              type="button"
              aria-label="Alza nota di mezzo tono"
              onClick={() => handleHalfStep(1)}
              disabled={!canStepUp}
              style={{ padding: '6px 1px', fontSize: '0.8rem' }}
            >
              ⬆️ Nota su
            </button>
            <button
              className={`secondary-button${
                playMode === 'loop' ? ' active' : ''
              }`}
              type="button"
              aria-pressed={playMode === 'loop'}
              onClick={toggleLoopMode}
              style={{ padding: '6px 1px', fontSize: '0.8rem' }}
            >
              🔁 {playMode === 'loop' ? 'Ripeti attivo' : 'Ripeti'}
            </button>
          </div>
        </div>

        <audio
          key={audioUrl ?? 'audio-player'}
          ref={audioElementRef}
          controls
          autoPlay
          loop={playMode === 'loop'}
          src={audioUrl ?? ''}
          aria-label={
            sequenceDescription
              ? `Sequenza: ${sequenceDescription}`
              : 'Audio generato'
          }
          style={{ width: '100%' }}
        />
        <p
          style={{
            margin: '8px 0 0',
            fontSize: '0.95rem',
            opacity: hasAudio ? 0.9 : 1,
            color: hasAudio ? 'inherit' : '#ff4d4f',
            fontWeight: hasAudio ? 500 : 800,
          }}
        >
          {hasAudio
            ? ``
            : "🎵 Seleziona una nota per iniziare: l'audio sarà generato in automatico e potrai usare i controlli qui sopra."}
        </p>

        {isPitchReady && (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                marginTop: '18px',
                marginBottom: '8px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <p style={{ margin: '0 0 4px' }}>
                    Nota pianoforte: {currentTargetNoteLabel}
                  </p>
                  <p style={{ margin: 0 }}>
                    Nota voce: {currentVoiceNoteLabel}
                  </p>
                </div>
                <div
                  style={{
                    fontSize: '2.4rem',
                    minWidth: '64px',
                    textAlign: 'center',
                    opacity: pitchComparisonLabel ? 1 : 0.4,
                  }}
                >
                  {pitchComparisonLabel ?? '🎵'}
                </div>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowPlot((prev) => !prev)}
                style={{ padding: '6px 10px', fontSize: '0.9rem' }}
              >
                {showPlot ? 'Nascondi grafico' : 'Mostra grafico'}
              </button>
            </div>
            {showPlot && (
              <div style={{ height: `${PITCH_CHART_HEIGHT}px` }}>
                <div
                  ref={pitchChartContainerRef}
                  style={{ height: '100%', width: '100%' }}
                />
              </div>
            )}
            <div className="pitch-warning-slot">
              {pitchOutOfRange ? (
                <button
                  type="button"
                  className="secondary-button flash-button"
                  style={{
                    backgroundColor: '#ff6b6b',
                    borderColor: '#ff6b6b',
                    color: '#fff',
                  }}
                >
                  Pitch fuori dai limiti, controlla l&apos;estensione vocale
                </button>
              ) : (
                !voiceDetected && (
                  <div
                    className="secondary-button"
                    style={{
                      backgroundColor: '#2a2e52',
                      borderColor: '#394070',
                      color: '#cbd5f5',
                      opacity: 0.9,
                    }}
                  >
                    Nessun audio rilevato
                  </div>
                )
              )}
            </div>
          </>
        )}
      </fieldset>
    </main>
  );
}
