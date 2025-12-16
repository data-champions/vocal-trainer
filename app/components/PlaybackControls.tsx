'use client';

import type { MutableRefObject } from 'react';

type PlaybackControlsProps = {
  isPitchReady: boolean;
  noiseThreshold: number;
  onNoiseThresholdChange: (value: number) => void;
  canStepDown: boolean;
  canStepUp: boolean;
  onHalfStep: (direction: 1 | -1) => void;
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
  canStepDown,
  canStepUp,
  onHalfStep,
  playMode,
  onToggleLoop,
  audioElementRef,
  audioUrl,
  sequenceDescription,
  hasAudio,
}: PlaybackControlsProps): JSX.Element {
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
            onChange={(event) => onNoiseThresholdChange(Number(event.target.value))}
          />
        </label>
      )}

      <div className="playback-actions">
        <div>
          <button
            className="secondary-button"
            type="button"
            aria-label="Abbassa nota di mezzo tono"
            onClick={() => onHalfStep(-1)}
            disabled={!canStepDown}
            style={{ padding: '6px 1px', fontSize: '0.8rem' }}
          >
            ⬇️ Nota giù
          </button>
          <button
            className="secondary-button"
            type="button"
            aria-label="Alza nota di mezzo tono"
            onClick={() => onHalfStep(1)}
            disabled={!canStepUp}
            style={{ padding: '6px 1px', fontSize: '0.8rem' }}
          >
            ⬆️ Nota su
          </button>
          <button
            className={`secondary-button${playMode === 'loop' ? ' active' : ''}`}
            type="button"
            aria-pressed={playMode === 'loop'}
            onClick={onToggleLoop}
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
        src={audioUrl ?? undefined}
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
    </fieldset>
  );
}
