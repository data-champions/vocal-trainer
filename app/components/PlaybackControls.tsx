'use client';

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type MutableRefObject,
} from 'react';

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
  const isSeekingRef = useRef(false);
  const volumePopupRef = useRef<HTMLDivElement | null>(null);
  const [volume, setVolume] = useState(1);
  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

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

  useEffect(() => {
    const audioEl = audioElementRef.current;
    if (!audioEl) {
      return;
    }

    const handleLoadedMetadata = () => {
      const nextDuration = Number.isFinite(audioEl.duration)
        ? audioEl.duration
        : 0;
      setDuration(nextDuration);
      setCurrentTime(audioEl.currentTime || 0);
    };

    const handleTimeUpdate = () => {
      if (isSeekingRef.current) {
        return;
      }
      setCurrentTime(audioEl.currentTime || 0);
    };

    const handleDurationChange = () => {
      setDuration(Number.isFinite(audioEl.duration) ? audioEl.duration : 0);
    };

    const handleVolumeChange = () => {
      const nextVolume = audioEl.muted ? 0 : audioEl.volume;
      setVolume(nextVolume);
    };

    const handleRateChange = () => {
      setPlaybackRate(audioEl.playbackRate || 1);
    };

    handleLoadedMetadata();
    handleVolumeChange();
    handleRateChange();

    audioEl.addEventListener('loadedmetadata', handleLoadedMetadata);
    audioEl.addEventListener('timeupdate', handleTimeUpdate);
    audioEl.addEventListener('durationchange', handleDurationChange);
    audioEl.addEventListener('volumechange', handleVolumeChange);
    audioEl.addEventListener('ratechange', handleRateChange);

    return () => {
      audioEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audioEl.removeEventListener('timeupdate', handleTimeUpdate);
      audioEl.removeEventListener('durationchange', handleDurationChange);
      audioEl.removeEventListener('volumechange', handleVolumeChange);
      audioEl.removeEventListener('ratechange', handleRateChange);
    };
  }, [audioElementRef, audioUrl]);

  useEffect(() => {
    const audioEl = audioElementRef.current;
    if (!audioEl) {
      return;
    }
    audioEl.volume = volume;
    audioEl.muted = volume === 0;
  }, [audioElementRef, volume]);

  useEffect(() => {
    const audioEl = audioElementRef.current;
    if (!audioEl) {
      return;
    }
    audioEl.playbackRate = playbackRate;
  }, [audioElementRef, playbackRate]);

  useEffect(() => {
    if (!isVolumeOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && volumePopupRef.current?.contains(target)) {
        return;
      }
      setIsVolumeOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsVolumeOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isVolumeOpen]);

  useEffect(() => {
    if (!hasAudio) {
      setIsVolumeOpen(false);
    }
  }, [hasAudio]);

  const handleLoopClick = () => {
    onToggleLoop();
    if (audioUrl) {
      shouldAutoPlayRef.current = true;
    }
  };

  const handlePlayToggle = () => {
    const audioEl = audioElementRef.current;
    if (!audioEl) {
      return;
    }
    if (audioEl.paused) {
      void audioEl.play();
    } else {
      audioEl.pause();
    }
  };

  const handleVolumeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextVolume = Number(event.target.value) / 100;
    setVolume(nextVolume);
  };

  const toggleVolumePopup = () => {
    if (!hasAudio) {
      return;
    }
    setIsVolumeOpen((prev) => !prev);
  };

  const handleSeekStart = () => {
    isSeekingRef.current = true;
  };

  const handleSeekEnd = () => {
    isSeekingRef.current = false;
  };

  const handleSeekChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(event.target.value);
    setCurrentTime(nextTime);
    const audioEl = audioElementRef.current;
    if (audioEl) {
      audioEl.currentTime = nextTime;
    }
  };

  const handleSpeedToggle = () => {
    const rounded = Math.round(playbackRate * 100) / 100;
    const nextRate = rounded >= 2 ? 0.25 : Math.min(rounded + 0.25, 2);
    setPlaybackRate(nextRate);
  };

  const formatTime = (value: number) => {
    if (!Number.isFinite(value) || value < 0) {
      return '0:00';
    }
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const volumePercent = Math.round(volume * 100);
  const volumeLabel =
    volumePercent === 0 ? 'Volume off' : `Volume ${volumePercent}%`;
  const volumeIcon =
    volumePercent === 0 ? '🔇' : volumePercent < 50 ? '🔈' : '🔊';

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
          loop={playMode === 'loop'}
          src={audioUrl ?? undefined}
          aria-label={
            sequenceDescription
              ? `Sequenza: ${sequenceDescription}`
              : 'Audio generato'
          }
          className="audio-loop-player audio-loop-player--hidden"
        />
        <div className="audio-control-bar" role="group" aria-label="Controlli audio">
          <div className="audio-control-left">
            <button
              className="audio-control-button"
              type="button"
              onClick={handlePlayToggle}
              aria-label={isAudioPlaying ? 'Pausa' : 'Riproduci'}
              title={isAudioPlaying ? 'Pausa' : 'Riproduci'}
              disabled={!hasAudio}
            >
              {isAudioPlaying ? '⏸' : '▶'}
            </button>
            <div
              className="audio-volume-control audio-volume-popup"
              ref={volumePopupRef}
            >
              <button
                className="audio-control-button audio-volume-trigger"
                type="button"
                onClick={toggleVolumePopup}
                aria-expanded={isVolumeOpen}
                aria-controls="audio-volume-panel"
                aria-label="Volume audio"
                title={volumeLabel}
                disabled={!hasAudio}
              >
                {volumeIcon}
              </button>
              <div
                id="audio-volume-panel"
                className={`audio-volume-panel${
                  isVolumeOpen ? ' is-open' : ''
                }`}
                role="dialog"
                aria-label="Volume audio"
                aria-hidden={!isVolumeOpen}
              >
                <span className="audio-volume-label">{volumeLabel}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={volumePercent}
                  onChange={handleVolumeChange}
                  aria-label="Volume audio"
                  aria-valuetext={volumeLabel}
                  disabled={!hasAudio}
                  className="audio-range audio-volume-range"
                />
                <div className="audio-volume-scale" aria-hidden="true">
                  <span>Off</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          </div>
          <div className="audio-control-progress">
            <span className="audio-time">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.01}
              value={Math.min(currentTime, duration || 0)}
              onChange={handleSeekChange}
              onMouseDown={handleSeekStart}
              onMouseUp={handleSeekEnd}
              onTouchStart={handleSeekStart}
              onTouchEnd={handleSeekEnd}
              aria-label="Avanzamento audio"
              disabled={!hasAudio || duration <= 0}
              className="audio-range audio-progress-range"
            />
            <span className="audio-time">{formatTime(duration)}</span>
          </div>
          <div className="audio-control-right">
            <button
              className={`audio-control-button audio-loop-toggle${
                playMode === 'loop' ? ' active' : ''
              }`}
              type="button"
              aria-pressed={playMode === 'loop'}
              onClick={handleLoopClick}
              aria-label={
                playMode === 'loop' ? 'Ripeti attivo' : 'Attiva ripetizione'
              }
              title={playMode === 'loop' ? 'Ripeti attivo' : 'Attiva ripetizione'}
              disabled={!hasAudio}
            >
              🔁
            </button>
            <button
              className="audio-speed-button"
              type="button"
              onClick={handleSpeedToggle}
              aria-label={`Velocità ${playbackRate.toFixed(2)}x`}
              title="Velocità riproduzione"
              disabled={!hasAudio}
            >
              {playbackRate.toFixed(2).replace(/\.00$/, '')}x
            </button>
          </div>
        </div>
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
