import React, { useEffect, useMemo } from 'react';
import interact from 'interactjs';
import NoteGlyph from './NoteGlyph';
import type { Score } from '../types';

const MEASURE_WIDTH = 200;
const STAFF_HEIGHT = 200;
const LINES = 5;
const NOTE_DURATION = 1; // beats

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const Staff: React.FC<{ score: Score; onScoreChange: (next: Score) => void }> = ({ score, onScoreChange }) => {
  const beats = score.measures * score.beatsPerMeasure;
  const width = score.measures * MEASURE_WIDTH + 40;

  const pitchRow = useMemo(() => {
    const map = new Map<string, number>();
    score.pitches.forEach((pitch, idx) => map.set(pitch, idx));
    return map;
  }, [score.pitches]);

  // Interact.js drag + drop
  useEffect(() => {
    const draggables = interact('.note-token, .note-handle').draggable({
      inertia: false,
      modifiers: [
        interact.modifiers.restrictRect({
          restriction: 'parent',
          endOnly: true,
        }),
      ],
      autoScroll: true,
      listeners: {
        move(event) {
          const target = event.target as HTMLElement;
          const x = (parseFloat(target.getAttribute('data-x') || '0') || 0) + event.dx;
          const y = (parseFloat(target.getAttribute('data-y') || '0') || 0) + event.dy;
          target.style.transform = `translate(${x}px, ${y}px)`;
          target.setAttribute('data-x', x.toString());
          target.setAttribute('data-y', y.toString());
        },
        end(event) {
          const target = event.target as HTMLElement;
          target.style.transform = '';
          target.removeAttribute('data-x');
          target.removeAttribute('data-y');
          target.classList.remove('can-drop');
        },
      },
    });

    const dropzones = interact('.drop-cell').dropzone({
      accept: '.note-token, .note-handle',
      overlap: 0.75,
      ondropactivate(event) {
        event.target.classList.add('drop-active');
      },
      ondragenter(event) {
        const dropzone = event.target as HTMLElement;
        const draggable = event.relatedTarget as HTMLElement;
        dropzone.classList.add('drop-target');
        draggable.classList.add('can-drop');
      },
      ondragleave(event) {
        const dropzone = event.target as HTMLElement;
        const draggable = event.relatedTarget as HTMLElement;
        dropzone.classList.remove('drop-target');
        draggable.classList.remove('can-drop');
      },
      ondrop(event) {
        const cell = event.target as HTMLElement;
        const beat = Number(cell.dataset.beat ?? '0');
        const pitch = cell.dataset.pitch ?? score.pitches[0];
        const src = event.relatedTarget as HTMLElement;
        const noteId = src.dataset.noteId;

        const snappedBeat = clamp(Math.round(beat), 0, beats - NOTE_DURATION);
        const nextNotes = [...score.notes];

        if (noteId) {
          const existing = nextNotes.find((n) => n.id === noteId);
          if (existing) {
            existing.pitch = pitch;
            existing.startBeat = snappedBeat;
            existing.duration = NOTE_DURATION;
          }
        } else {
          nextNotes.push({ id: crypto.randomUUID(), pitch, startBeat: snappedBeat, duration: NOTE_DURATION });
        }

        onScoreChange({ ...score, notes: nextNotes });
      },
      ondropdeactivate(event) {
        const dropzone = event.target as HTMLElement;
        dropzone.classList.remove('drop-active');
        dropzone.classList.remove('drop-target');
      },
    });

    return () => {
      draggables.unset();
      dropzones.unset();
    };
  }, [beats, onScoreChange, score]);

  const gridStyle: React.CSSProperties = {
    gridTemplateColumns: `repeat(${beats}, 1fr)`,
    gridTemplateRows: `repeat(${score.pitches.length}, 1fr)`,
  };

  const renderStaffLines = () => {
    const spacing = STAFF_HEIGHT / (LINES + 2);
    const lines = Array.from({ length: LINES }).map((_, idx) => {
      const y = spacing * (idx + 1);
      return <line key={idx} x1={20} x2={width - 20} y1={y} y2={y} stroke="#cbd5e1" strokeWidth={2} />;
    });

    const measures = Array.from({ length: score.measures + 1 }).map((_, idx) => {
      const x = 20 + idx * MEASURE_WIDTH;
      return <line key={`m-${idx}`} x1={x} x2={x} y1={spacing} y2={spacing * LINES} stroke="#cbd5e1" strokeWidth={2} />;
    });

    return (
      <svg width={width} height={STAFF_HEIGHT} role="presentation">
        {lines}
        {measures}
      </svg>
    );
  };

  return (
    <div className="staff-shell">
      <div className="vex-sheet" style={{ width: `${width}px`, height: `${STAFF_HEIGHT}px` }}>
        <div className="vex-sheet__draw" aria-hidden>
          {renderStaffLines()}
        </div>
        <div className="vex-sheet__overlay">
          <div className="overlay-grid" style={gridStyle}>
            {score.pitches.map((pitch) => (
              <React.Fragment key={pitch}>
                {Array.from({ length: beats }).map((_, beat) => (
                  <div
                    key={`${pitch}-${beat}`}
                    className="drop-cell"
                    data-pitch={pitch}
                    data-beat={beat}
                    title={`${pitch} • beat ${beat + 1}`}
                  />
                ))}
              </React.Fragment>
            ))}
          </div>
          <div className="overlay-handles" style={gridStyle}>
            {score.notes.map((note) => {
              const rowIndex = pitchRow.get(note.pitch);
              if (rowIndex === undefined) return null;
              const colStart = note.startBeat + 1;
              const colSpan = Math.max(1, Math.round(note.duration));
              return (
                <div
                  key={note.id}
                  className="note-handle"
                  data-note-id={note.id}
                  style={{ gridColumn: `${colStart} / span ${colSpan}`, gridRow: rowIndex + 1 }}
                  title={`${note.pitch} • beat ${note.startBeat + 1}`}
                  onDoubleClick={() => onScoreChange({ ...score, notes: score.notes.filter((n) => n.id !== note.id) })}
                >
                  <NoteGlyph size={18} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Staff;
