'use client';

import type { NotationMode } from '../../lib/constants';
import type { PianoKey } from '../../lib/notes';
import { formatNoteByNotation } from '../../lib/notes';
import type { Feedback } from '../../lib/types';

type SequenceControlsProps = {
  selectedNote: PianoKey | '';
  onSelectNote: (note: PianoKey | '') => void;
  availableNotes: PianoKey[];
  notationMode: NotationMode;
  duration: number;
  onDurationChange: (value: number) => void;
  noteCount: number;
  onNoteCountChange: (value: number) => void;
  maxNotes: number;
  sequenceDisplay: string;
  feedback: Feedback;
};

export function SequenceControls({
  selectedNote,
  onSelectNote,
  availableNotes,
  notationMode,
  duration,
  onDurationChange,
  noteCount,
  onNoteCountChange,
  maxNotes,
  sequenceDisplay,
  feedback,
}: SequenceControlsProps): JSX.Element {
  return (
    <fieldset>
      <legend>Sequenza e controlli</legend>
      <label className="stacked-label" htmlFor="note-select">
        Nota iniziale
        <select
          id="note-select"
          className={!selectedNote ? 'error-input' : undefined}
          value={selectedNote}
          onChange={(event) => onSelectNote(event.target.value as PianoKey)}
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
          onChange={(event) => onDurationChange(Number(event.target.value))}
        />
      </label>

      <label htmlFor="note-count">
        Numero di note ascendenti
        <select
          id="note-count"
          value={String(noteCount)}
          onChange={(event) => onNoteCountChange(Number(event.target.value))}
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

      {sequenceDisplay && (
        <p className="note-display">Sequenza selezionata: {sequenceDisplay}</p>
      )}

      {feedback && (
        <div className={`feedback ${feedback.type}`} style={{ marginTop: '12px' }}>
          {feedback.message}
        </div>
      )}
    </fieldset>
  );
}
