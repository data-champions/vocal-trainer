'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva';

type NoteDuration = '8' | 'q' | 'h' | 'w';

type ComposerNote = {
  id: string;
  duration: NoteDuration;
  pitch: string;
  x: number;
};

type DurationDef = {
  key: string;
  code: NoteDuration;
  symbol: string;
  fraction: string;
  beats: number;
};

const NOTE_DEFS: DurationDef[] = [
  { key: '1/8', code: '8', symbol: '♪', fraction: '1/8', beats: 0.5 },
  { key: '2/8', code: 'q', symbol: '♩', fraction: '2/8', beats: 1 },
  { key: '4/8', code: 'h', symbol: '𝅗𝅥', fraction: '4/8', beats: 2 },
  { key: '1/4', code: 'q', symbol: '♩', fraction: '1/4', beats: 1 },
  { key: '2/4', code: 'h', symbol: '𝅗𝅥', fraction: '2/4', beats: 2 },
  { key: '4/4', code: 'w', symbol: '𝅝', fraction: '4/4', beats: 4 },
];

const PITCHES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];

const randomId = () => Math.random().toString(36).slice(2, 10);

const durationToBeats = (duration: NoteDuration) => {
  const def = NOTE_DEFS.find((item) => item.code === duration);
  return def?.beats ?? 1;
};

export function KonvaComposer(): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<any>(null);
  const [stageSize, setStageSize] = useState({ width: 720, height: 260 });
  const [selectedDuration, setSelectedDuration] =
    useState<NoteDuration>('q');
  const [selectedPitch, setSelectedPitch] = useState(PITCHES[0]);
  const [notes, setNotes] = useState<ComposerNote[]>([]);
  const [hoveredPitch, setHoveredPitch] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<{
    id: string;
    left: number;
    top: number;
  } | null>(null);

  const padding = 24;
  const staffTop = 60;
  const staffHeight = 120;
  const noteHeadRadius = 10;

  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      if (container) {
        setStageSize({
          width: container.clientWidth || 720,
          height: 280,
        });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const measureLines = useMemo(() => {
    const totalBeats = Math.max(
      4,
      notes.reduce((acc, note) => acc + durationToBeats(note.duration), 0)
    );
    const measures = Math.max(1, Math.ceil(totalBeats / 4));
    const measureWidth =
      (stageSize.width - padding * 2) / Math.max(1, measures);
    return Array.from({ length: measures - 1 }, (_, idx) => ({
      x: padding + measureWidth * (idx + 1),
    }));
  }, [notes, padding, stageSize.width]);

  const pitchToY = (pitch: string) => {
    const index = PITCHES.indexOf(pitch);
    if (index === -1) {
      return staffTop + staffHeight / 2;
    }
    const step = staffHeight / (PITCHES.length - 1);
    const inverted = PITCHES.length - 1 - index;
    return staffTop + inverted * step;
  };

  const yToPitch = (y: number) => {
    const step = staffHeight / (PITCHES.length - 1);
    const invertedIdx = Math.round((y - staffTop) / step);
    const clamped = Math.max(
      0,
      Math.min(PITCHES.length - 1, invertedIdx)
    );
    return PITCHES[PITCHES.length - 1 - clamped];
  };

  const clampX = (x: number) => {
    const minX = padding;
    const maxX = stageSize.width - padding;
    return Math.max(minX, Math.min(maxX, x));
  };

  const addNoteAt = (x: number, y: number, duration: NoteDuration) => {
    const snappedX = clampX(x);
    const pitch = yToPitch(y);
    setNotes((prev) => [
      ...prev,
      { id: randomId(), duration, pitch, x: snappedX },
    ]);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const duration = event.dataTransfer.getData('duration') as NoteDuration;
    if (!duration) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    addNoteAt(x, y, duration);
    setHoveredPitch(null);
  };

  const handleClick = (event: any) => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    const pointer = stage.getPointerPosition();
    if (!pointer) {
      return;
    }
    addNoteAt(pointer.x, pointer.y, selectedDuration);
    setEditingNote(null);
  };

  const handleDragStart = (duration: NoteDuration) => {
    setSelectedDuration(duration);
    setEditingNote(null);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - rect.top;
    setHoveredPitch(yToPitch(y));
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleNoteDragEnd = (
    id: string,
    duration: NoteDuration,
    x: number,
    y: number
  ) => {
    setNotes((prev) =>
      prev.map((note) =>
        note.id === id
          ? { ...note, x: clampX(x), pitch: yToPitch(y) }
          : note
      )
    );
    setEditingNote(null);
  };

  const openEditorAtEvent = (id: string, evt: any) => {
    evt.evt?.preventDefault?.();
    const containerRect = containerRef.current?.getBoundingClientRect();
    const absPos = evt.target.getAbsolutePosition();
    setEditingNote({
      id,
      left: containerRect ? absPos.x - (containerRect.left ?? 0) : absPos.x,
      top: containerRect ? absPos.y - (containerRect.top ?? 0) : absPos.y,
    });
  };

  const pitchBands = useMemo(() => {
    const step = staffHeight / (PITCHES.length - 1);
    return PITCHES.map((pitch, idx) => {
      const inverted = PITCHES.length - 1 - idx;
      return {
        pitch,
        y: staffTop + inverted * step - step / 2,
        height: step,
      };
    });
  }, []);

  return (
    <div className="composer-card">
      <div className="composer-toolbar">
        <div className="toolbar-group">
          <p className="toolbar-label">Durata</p>
          <div className="note-palette">
            {NOTE_DEFS.map((option) => (
              <button
                key={option.key}
                className={`note-chip${selectedDuration === option.code ? ' is-active' : ''}`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'copy';
                  event.dataTransfer.setData('duration', option.code);
                  handleDragStart(option.code);
                }}
                onClick={() => {
                  setSelectedDuration(option.code);
                  addNoteAt(
                    padding + (notes.length % 8) * 40,
                    pitchToY(selectedPitch),
                    option.code
                  );
                }}
              >
                <span className="note-symbol">{option.symbol}</span>
                <span className="note-fraction">{option.fraction}</span>
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
        ref={containerRef}
        className="staff-surface"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragLeave={() => setHoveredPitch(null)}
      >
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          onClick={handleClick}
          onContextMenu={(evt) => {
            evt.evt?.preventDefault?.();
          }}
        >
          <Layer>
            {pitchBands.map((band) => (
              <Rect
                key={band.pitch}
                x={0}
                y={band.y}
                width={stageSize.width}
                height={band.height}
                fill={
                  hoveredPitch === band.pitch
                    ? 'rgba(56,189,248,0.15)'
                    : 'transparent'
                }
                listening={false}
              />
            ))}
            {/* Staff lines */}
            {Array.from({ length: 5 }, (_, idx) => {
              const y = staffTop + (idx * staffHeight) / 4;
              return (
                <Line
                  key={`line-${idx}`}
                  points={[padding, y, stageSize.width - padding, y]}
                  stroke="rgba(203,213,225,0.5)"
                  strokeWidth={1}
                />
              );
            })}
            {/* Measure separators */}
            {measureLines.map((line) => (
              <Line
                key={`bar-${line.x}`}
                points={[
                  line.x,
                  staffTop - 12,
                  line.x,
                  staffTop + staffHeight + 12,
                ]}
                stroke="rgba(148,163,184,0.7)"
                strokeWidth={1}
              />
            ))}
            {/* Notes */}
            {notes.map((note) => {
              const y = pitchToY(note.pitch);
              const def = NOTE_DEFS.find(
                (item) => item.code === note.duration
              );
              return (
                <Group
                  key={note.id}
                  x={note.x}
                  y={y}
                  draggable
                  onDragEnd={(evt) =>
                    handleNoteDragEnd(
                      note.id,
                      note.duration,
                      evt.target.x(),
                      evt.target.y()
                    )
                  }
                  onClick={(evt) => openEditorAtEvent(note.id, evt)}
                  onContextMenu={(evt) => openEditorAtEvent(note.id, evt)}
                >
                  <Circle
                    radius={noteHeadRadius}
                    fill="#fcd34d"
                    stroke="#fbbf24"
                    strokeWidth={2}
                  />
                  <Line
                    points={[noteHeadRadius, -noteHeadRadius, noteHeadRadius, -noteHeadRadius - 24]}
                    stroke="#fcd34d"
                    strokeWidth={3}
                  />
                  <Text
                    text={def?.symbol ?? ''}
                    fontSize={18}
                    fill="#0f172a"
                    offsetX={8}
                    offsetY={10}
                  />
                </Group>
              );
            })}
          </Layer>
        </Stage>
        {editingNote ? (
          <div
            className="note-editor"
            style={{
              left: `${editingNote.left}px`,
              top: `${editingNote.top}px`,
            }}
          >
            <label className="note-editor-row">
              <span>Durata</span>
              <select
                value={
                  notes.find((n) => n.id === editingNote.id)?.duration ?? 'q'
                }
                onChange={(event) => {
                  const next = event.target.value as NoteDuration;
                  setNotes((prev) =>
                    prev.map((note) =>
                      note.id === editingNote.id
                        ? { ...note, duration: next }
                        : note
                    )
                  );
                }}
              >
                {NOTE_DEFS.map((def) => (
                  <option key={def.key} value={def.code}>
                    {def.symbol} {def.fraction}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setNotes((prev) =>
                  prev.filter((note) => note.id !== editingNote.id)
                );
                setEditingNote(null);
              }}
            >
              Elimina nota
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setEditingNote(null)}
            >
              Chiudi
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
