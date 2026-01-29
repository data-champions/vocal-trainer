'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';

type PlaybackControlsProps = {
  isPitchReady: boolean;
  noiseThreshold: number;
  onNoiseThresholdChange: (value: number) => void;
  selectedNoteLabel: string;
  canStepDown: boolean;
  canStepUp: boolean;
  onHalfStep: (direction: 1 | -1) => void;
  isAudioPlaying: boolean;
  playMode: 'single' | 'loop';
  onToggleLoop: () => void;
  audioElementRef: MutableRefObject<HTMLAudioElement | null>;
  audioUrl: string | null;
  sequenceDescription: string;
  hasAudio: boolean;
};

export function PlaybackControls({
  isPitchReady,
  noiseThreshold,
  onNoiseThresholdChange,
  selectedNoteLabel,
  canStepDown,
  canStepUp,
  onHalfStep,
  isAudioPlaying,
  playMode,
  onToggleLoop,
  audioElementRef,
  audioUrl,
  sequenceDescription,
  hasAudio,
}: PlaybackControlsProps): JSX.Element {
  const shouldAutoPlayRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const lastAudioUrlRef = useRef<string | null>(audioUrl);

  useEffect(() => {
    wasPlayingRef.current = isAudioPlaying;
  }, [isAudioPlaying]);

  useEffect(() => {
    if (!audioUrl || audioUrl === lastAudioUrlRef.current) {
      return;
    }
    if (playMode === 'loop' && wasPlayingRef.current) {
      shouldAutoPlayRef.current = true;
    }
    lastAudioUrlRef.current = audioUrl;
  }, [audioUrl, playMode]);

  useEffect(() => {
    if (!shouldAutoPlayRef.current) {
      return;
    }
    const audioEl = audioElementRef.current;
    if (!audioEl || !audioUrl) {
      return;
    }
    const playWhenReady = () => {
      void audioEl.play();
      shouldAutoPlayRef.current = false;
    };
    if (audioEl.readyState >= 2) {
      playWhenReady();
    } else {
      audioEl.addEventListener('canplay', playWhenReady, { once: true });
      return () => {
        audioEl.removeEventListener('canplay', playWhenReady);
      };
    }
  }, [audioUrl, audioElementRef]);

  const handleLoopClick = () => {
    onToggleLoop();
    if (audioUrl) {
      shouldAutoPlayRef.current = true;
    }
  };

  return (
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
              onNoiseThresholdChange(Number(event.target.value))
            }
          />
        </label>
      )}

      <div className="base-note-row base-note-row--full">
        <p style={{ margin: 0 }}>Nota base: {selectedNoteLabel || '-'}</p>
        <div className="note-step-buttons" aria-label="Sposta nota base">
          <button
            className="secondary-button note-step-button"
            type="button"
            aria-label="Alza nota base di mezzo tono"
            onClick={() => onHalfStep(1)}
            disabled={!canStepUp}
            title="Alza nota"
          >
            <span className="note-step-arrow" aria-hidden="true">
              ▲
            </span>
            <span className="note-step-label">Nota Su</span>
          </button>
          <button
            className="secondary-button note-step-button"
            type="button"
            aria-label="Abbassa nota base di mezzo tono"
            onClick={() => onHalfStep(-1)}
            disabled={!canStepDown}
            title="Abbassa nota"
          >
            <span className="note-step-arrow" aria-hidden="true">
              ▼
            </span>
            <span className="note-step-label">Nota Giù</span>
          </button>
        </div>
      </div>

      <div className="audio-loop-row">
        <audio
          key={audioUrl ?? 'audio-player'}
          ref={audioElementRef}
          controls
          loop={playMode === 'loop'}
          src={audioUrl ?? undefined}
          aria-label={
            sequenceDescription
              ? `Sequenza: ${sequenceDescription}`
              : 'Audio generato'
          }
          className="audio-loop-player"
        />
        <button
          className={`secondary-button loop-button${
            playMode === 'loop' ? ' active' : ''
          }`}
          type="button"
          aria-pressed={playMode === 'loop'}
          onClick={handleLoopClick}
          aria-label={
            playMode === 'loop' ? 'Ripeti attivo' : 'Attiva ripetizione'
          }
          title={playMode === 'loop' ? 'Ripeti attivo' : 'Attiva ripetizione'}
        >
          🔁
        </button>
      </div>
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
    </fieldset>
  );
}
//
