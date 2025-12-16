'use client';

import type { NotationMode } from '../../lib/constants';

type NotationToggleProps = {
  notationMode: NotationMode;
  onChange: (mode: NotationMode) => void;
};

export function NotationToggle({
  notationMode,
  onChange,
}: NotationToggleProps): JSX.Element {
  return (
    <div className="toggle-row">
      <p>Notazione</p>
      <div
        className="toggle-group"
        role="group"
        aria-label="Seleziona la notazione"
      >
        <button
          type="button"
          className={`toggle-option${notationMode === 'italian' ? ' active' : ''}`}
          aria-pressed={notationMode === 'italian'}
          onClick={() => onChange('italian')}
        >
          🇮🇹 Italiana
        </button>
        <button
          type="button"
          className={`toggle-option${notationMode === 'english' ? ' active' : ''}`}
          aria-pressed={notationMode === 'english'}
          onClick={() => onChange('english')}
        >
          🇬🇧 Inglese
        </button>
      </div>
    </div>
  );
}
