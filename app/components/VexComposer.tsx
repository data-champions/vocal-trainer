'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Flow } from 'vexflow';

type NoteDuration = '8' | 'q' | 'h' | 'w';

type ComposerNote = {
  duration: NoteDuration;
  pitch: string;
};

const DURATION_OPTIONS: Array<{ key: string; code: NoteDuration; symbol: string; fraction: string }> = [
  { key: '1/8', code: '8', symbol: '♪', fraction: '1/8' },
  { key: '2/8', code: 'q', symbol: '♩', fraction: '2/8' },
  { key: '4/8', code: 'h', symbol: '𝅗𝅥', fraction: '4/8' },
  { key: '1/4', code: 'q', symbol: '♩', fraction:  '1/4' },
  { key: '2/4', code: 'h', symbol: '𝅗𝅥 ', fraction: '2/4' },
  { key: '4/4', code: 'w', symbol: '𝅝 ', fraction: '4/4' },
];

const PITCHES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];

const pitchToKey = (pitch: string) => {
  const match = /^([A-Ga-g])(b|#)?(\d)$/.exec(pitch);
  if (!match) {
    return 'c/4';
  }
  const [, letter, accidental, octave] = match;
  const key = `${letter.toLowerCase()}${accidental ?? ''}/${octave}`;
  return key;
};

export function VexComposer(): JSX.Element {
  const staffRef = useRef<HTMLDivElement | null>(null);
  const [selectedDuration, setSelectedDuration] =
    useState<NoteDuration>('q');
  const [selectedPitch, setSelectedPitch] = useState(PITCHES[0]);
  const [notes, setNotes] = useState<ComposerNote[]>([]);

  const vexNotes = useMemo(() => {
    return notes.map((note) => {
      const keys = [pitchToKey(note.pitch)];
      return new Flow.StaveNote({
        clef: 'treble',
        keys,
        duration: note.duration,
      });
    });
  }, [notes]);

  useEffect(() => {
    const container = staffRef.current;
    if (!container) {
      return;
    }
    container.innerHTML = '';
    const width = container.clientWidth || 720;
    const height = 200;
    const renderer = new Flow.Renderer(
      container,
      Flow.Renderer.Backends.SVG
    );
    renderer.resize(width, height);
    const context = renderer.getContext();
    context.setFont('Arial', 10, '').setBackgroundFillStyle('#fff');
    const stave = new Flow.Stave(10, 40, width - 20);
    stave.addClef('treble').addTimeSignature('4/4');
    stave.setContext(context).draw();

    if (vexNotes.length > 0) {
      Flow.Formatter.FormatAndDraw(context, stave, vexNotes);
    }
  }, [vexNotes]);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const duration = event.dataTransfer.getData('duration') as NoteDuration;
    if (!duration) {
      return;
    }
    addNote(duration);
  };

  const addNote = (duration: NoteDuration) => {
    setNotes((prev) => [...prev, { duration, pitch: selectedPitch }]);
  };

  return (
    <div className="composer-card">
      <div className="composer-toolbar">
        <div className="toolbar-group">
          <p className="toolbar-label">Durata</p>
          <div className="note-palette">
            {DURATION_OPTIONS.map((option) => (
              <button
                key={option.key}
                className={`note-chip${selectedDuration === option.code ? ' is-active' : ''}`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'copy';
                  event.dataTransfer.setData('duration', option.code);
                  setSelectedDuration(option.code);
                }}
                onClick={() => {
                  setSelectedDuration(option.code);
                  addNote(option.code);
                }}
              >
                <span className="note-symbol">{option.symbol}</span>
              </button>
            ))}
          </div>
          <p className="toolbar-hint">
            Trascina una durata sul pentagramma o clicca per aggiungere.
          </p>
        </div>
        <div className="toolbar-group">
          <label className="toolbar-label" htmlFor="pitch-select">
            Altezza
          </label>
          <select
            id="pitch-select"
            value={selectedPitch}
            onChange={(event) => setSelectedPitch(event.target.value)}
          >
            {PITCHES.map((pitch) => (
              <option key={pitch} value={pitch}>
                {pitch}
              </option>
            ))}
          </select>
          <p className="toolbar-hint">
            L&apos;altezza selezionata verrà usata per le nuove note.
          </p>
        </div>
        <div className="toolbar-group">
          <button
            type="button"
            className="text-button"
            onClick={() => setNotes([])}
          >
            Svuota pentagramma
          </button>
        </div>
      </div>

      <div
        className="staff-surface"
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={handleDrop}
        onClick={() => addNote(selectedDuration)}
        aria-label="Pentagramma"
      >
        <div ref={staffRef} className="staff-svg" />
      </div>
    </div>
  );
}
