'use client';

type PitchStatusProps = {
  isPitchReady: boolean;
  currentTargetNoteLabel: string;
  currentVoiceNoteLabel: string;
  pitchComparisonLabel: string | null;
  showPlot: boolean;
  onTogglePlot: () => void;
  pitchOutOfRange: boolean;
  voiceDetected: boolean;
};

export function PitchStatus({
  isPitchReady,
  currentTargetNoteLabel,
  currentVoiceNoteLabel,
  pitchComparisonLabel,
  showPlot,
  onTogglePlot,
  pitchOutOfRange,
  voiceDetected,
}: PitchStatusProps): JSX.Element | null {
  if (!isPitchReady) {
    return null;
  }

  return (
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
            <p style={{ margin: 0 }}>Nota voce: {currentVoiceNoteLabel}</p>
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
          onClick={onTogglePlot}
          style={{ padding: '6px 10px', fontSize: '0.9rem' }}
        >
          {showPlot ? 'Nascondi grafico' : 'Mostra grafico'}
        </button>
      </div>
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
  );
}
