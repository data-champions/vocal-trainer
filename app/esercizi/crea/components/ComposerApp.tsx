"use client";

import { useEffect, useRef, useState } from "react";
import interact from "interactjs";
import { Note } from "./Note";
import type { NoteDuration, NoteModel } from "../types";

const NOTE_WIDTH = 20;
const NOTE_HEAD_OFFSET_X = 40;
const NOTE_HEAD_OFFSET_Y = 50;
const LEDGER_SLOT_COUNT = 6; // tagli addizionali added above and below the staff
const NOTE_GAP = NOTE_WIDTH * 0.25;
const NOTE_STEP = NOTE_WIDTH + NOTE_GAP;
const PPQ = 480;
const DEFAULT_TEMPO_MICROS = 500000;
const TREBLE_BASE_MIDI = 67; // G4
const BASS_BASE_MIDI = 53; // F3
const TREBLE_BASE_SLOT = LEDGER_SLOT_COUNT + 6; // G line (second from bottom)
const BASS_BASE_SLOT = LEDGER_SLOT_COUNT + 2; // F line (second from top)
const TREBLE_INTERVALS = [2, 2, 1, 2, 2, 1, 2]; // G A B C D E F G
const BASS_INTERVALS = [2, 2, 2, 1, 2, 2, 1]; // F G A B C D E F

const durationToBeats: Record<NoteDuration, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25
};

const durationToSymbol: Record<NoteDuration, string> = {
  whole: "w",
  half: "h",
  quarter: "q",
  eighth: "8",
  sixteenth: "16"
};

const midiToPitch = (midi: number) => {
  const names = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
  const note = names[midi % 12] || "c";
  const octave = Math.floor(midi / 12) - 1;

  return `${note}/${octave}`;
};

const writeUint32 = (value: number) => [
  (value >> 24) & 0xff,
  (value >> 16) & 0xff,
  (value >> 8) & 0xff,
  value & 0xff
];

const writeVarLen = (value: number) => {
  let buffer = value & 0x7f;
  const bytes: number[] = [];

  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }

  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) {
      buffer >>= 8;
    } else {
      break;
    }
  }

  return bytes;
};

const buildMidiFile = (notes: Array<NoteModel>) => {
  const events: Array<{ time: number; sort: number; bytes: number[] }> = [];
  let currentBeat = 0;

  const sortedNotes = [...notes].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));

  sortedNotes.forEach((note) => {
    const startBeat = currentBeat;
    const durationBeats = durationToBeats[note.duration] ?? 1;
    const endBeat = startBeat + durationBeats;
    const startTick = Math.round(startBeat * PPQ);
    const endTick = Math.round(endBeat * PPQ);
    const midi = note.midi ?? 60;

    events.push({
      time: startTick,
      sort: 1,
      bytes: [0x90, midi, 96]
    });
    events.push({
      time: endTick,
      sort: 0,
      bytes: [0x80, midi, 0]
    });

    currentBeat = endBeat;
  });

  events.sort((a, b) => (a.time === b.time ? a.sort - b.sort : a.time - b.time));

  const trackBytes: number[] = [];
  trackBytes.push(0x00, 0xff, 0x51, 0x03);
  trackBytes.push((DEFAULT_TEMPO_MICROS >> 16) & 0xff);
  trackBytes.push((DEFAULT_TEMPO_MICROS >> 8) & 0xff);
  trackBytes.push(DEFAULT_TEMPO_MICROS & 0xff);

  let lastTime = 0;
  events.forEach((event) => {
    const delta = event.time - lastTime;
    trackBytes.push(...writeVarLen(delta));
    trackBytes.push(...event.bytes);
    lastTime = event.time;
  });

  trackBytes.push(0x00, 0xff, 0x2f, 0x00);

  const trackHeader = [
    0x4d, 0x54, 0x72, 0x6b,
    ...writeUint32(trackBytes.length)
  ];
  const header = [
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    (PPQ >> 8) & 0xff,
    PPQ & 0xff
  ];

  return new Uint8Array([...header, ...trackHeader, ...trackBytes]);
};

const midiFromStaffSlot = (staffSlot: number, clef: "treble" | "bass") => {
  const baseMidi = clef === "treble" ? TREBLE_BASE_MIDI : BASS_BASE_MIDI;
  const baseSlot = clef === "treble" ? TREBLE_BASE_SLOT : BASS_BASE_SLOT;
  const intervals = clef === "treble" ? TREBLE_INTERVALS : BASS_INTERVALS;
  const steps = baseSlot - staffSlot;

  if (steps === 0) {
    return baseMidi;
  }

  const pattern = steps > 0 ? intervals : [...intervals].reverse();
  let midi = baseMidi;
  const count = Math.abs(steps);

  for (let i = 0; i < count; i++) {
    midi += steps > 0 ? pattern[i % pattern.length] : -pattern[i % pattern.length];
  }

  return midi;
};

export default function ComposerApp() {
  const [clef, setClef] = useState<"treble" | "bass">("treble");
  const clefSymbol = clef === "treble" ? "\uD834\uDD1E" : "\uD834\uDD22";
  const clefLabel = clef === "treble" ? "Chiave di violino" : "Chiave di basso";
  const paletteNotes: Array<Pick<NoteModel, "id" | "duration">> = [
    { id: "palette-whole", duration: "whole" },
    { id: "palette-half", duration: "half" },
    { id: "palette-quarter", duration: "quarter" },
    { id: "palette-eighth", duration: "eighth" }
  ];
  const idCounter = useRef(0);
  const [placedNotes, setPlacedNotes] = useState<NoteModel[]>([]);
  const hasNotes = placedNotes.length > 0;

  const resolveNoteX = (x: number, notes: NoteModel[], ignoreId?: string) => {
    let candidate = x;
    const occupied = notes
      .filter((note) => note.id !== ignoreId)
      .map((note) => note.x ?? note.beat * NOTE_STEP);

    let attempts = 0;
    while (occupied.some((pos) => Math.abs(candidate - pos) < NOTE_STEP)) {
      candidate += NOTE_STEP;
      attempts += 1;
      if (attempts > notes.length + 4) {
        break;
      }
    }

    return candidate;
  };

  const handleExportMidi = () => {
    if (!hasNotes) {
      alert("Non ci sono note da esportare.");
      return;
    }

    const data = buildMidiFile(placedNotes);
    const blob = new Blob([data], { type: "audio/midi" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "melody.mid";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    if (!hasNotes) {
      alert("Non ci sono note da esportare.");
      return;
    }

    const sortedNotes = [...placedNotes].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
    let currentBeat = 0;
    const notes: Array<{ pitch: string; duration: string; start: number }> = [];

    sortedNotes.forEach((note) => {
      const durationBeats = durationToBeats[note.duration] ?? 1;
      const start = currentBeat;
      notes.push({
        pitch: midiToPitch(note.midi ?? 60),
        duration: durationToSymbol[note.duration] ?? "q",
        start
      });

      currentBeat += durationBeats;
    });

    const payload = {
      metadata: {
        tempo: 120,
        timeSignature: "4/4",
        clef,
        key: "C"
      },
      notes
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "melody.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const computeDropPlacement = (event: any) => {
    const dropzone = event.target as HTMLElement | null;
    const notesArea = dropzone?.querySelector(".dropzone-notes") as HTMLElement | null;
    const staffLines = dropzone
      ?.querySelector(".staff-area")
      ?.querySelectorAll(".staff-lines span");

    if (!notesArea || !staffLines || staffLines.length === 0) {
      return { x: 0, y: 0, slot: 0 };
    }

    const notesRect = notesArea.getBoundingClientRect();
    const lineCenters = Array.from(staffLines)
      .map((line) => {
        const rect = (line as HTMLElement).getBoundingClientRect();
        return rect.top + rect.height / 2 - notesRect.top;
      })
      .sort((a, b) => a - b);

    const slotPositions: number[] = [];
    for (let i = 0; i < lineCenters.length; i++) {
      slotPositions.push(lineCenters[i]);
      if (i < lineCenters.length - 1) {
        slotPositions.push((lineCenters[i] + lineCenters[i + 1]) / 2);
      }
    }

    if (lineCenters.length > 1) {
      const lineSpacing = lineCenters[1] - lineCenters[0];
      const slotStep = lineSpacing / 2;

      for (let i = 1; i <= LEDGER_SLOT_COUNT; i++) {
        slotPositions.unshift(lineCenters[0] - slotStep * i);
        slotPositions.push(lineCenters[lineCenters.length - 1] + slotStep * i);
      }
    }

    const dropY = (event.dragEvent?.clientY ?? notesRect.top) - notesRect.top;
    const dropX = (event.dragEvent?.clientX ?? notesRect.left) - notesRect.left;

    let nearestSlot = 0;
    let nearestDiff = Number.POSITIVE_INFINITY;
    slotPositions.forEach((pos, idx) => {
      const diff = Math.abs(dropY - pos);
      if (diff < nearestDiff) {
        nearestDiff = diff;
        nearestSlot = idx;
      }
    });

    const y = (slotPositions[nearestSlot] ?? 0) - NOTE_HEAD_OFFSET_Y;
    const x = Math.max(
      0,
      Math.min(notesRect.width - NOTE_WIDTH, dropX - NOTE_HEAD_OFFSET_X)
    );

    return { x, y, slot: nearestSlot };
  };

  useEffect(() => {
    interact(".draggable").draggable({
      // startAxis: "xy",
      // lockAxis: "start",
      listeners: {
        start(event) {
          const target = event.target as HTMLElement;
          const startX = parseFloat(target.getAttribute("data-x") || "0") || 0;
          const startY = parseFloat(target.getAttribute("data-y") || "0") || 0;

          target.setAttribute("data-start-x", startX.toString());
          target.setAttribute("data-start-y", startY.toString());
          target.setAttribute("data-drop-success", "false");
        },
        move(event) {
          const target = event.target as HTMLElement;
          const x = (parseFloat(target.getAttribute("data-x") || "0") || 0) + event.dx;
          const y = (parseFloat(target.getAttribute("data-y") || "0") || 0) + event.dy;

          target.style.transform = `translate(${x}px, ${y}px)`;
          target.setAttribute("data-x", x.toString());
          target.setAttribute("data-y", y.toString());
        },
        end(event) {
          const target = event.target as HTMLElement;
          const dropSucceeded = target.getAttribute("data-drop-success") === "true";

          if (!dropSucceeded) {
            // reset position
            const startX = parseFloat(target.getAttribute("data-start-x") || "0") || 0;
            const startY = parseFloat(target.getAttribute("data-start-y") || "0") || 0;

            target.style.transform = `translate(${startX}px, ${startY}px)`;
            target.setAttribute("data-x", startX.toString());
            target.setAttribute("data-y", startY.toString());
          }
        }
      }
    });

    interact(".dropzone")
      .dropzone({
        overlap: 1.0,
        ondrop(event) {
          const draggable = event.relatedTarget as HTMLElement | null;
          const duration = (draggable?.dataset.duration as NoteDuration | undefined) || "quarter";
          const isPaletteItem = draggable?.dataset.palette === "true";
          const placement = computeDropPlacement(event);

          if (draggable) {
            if (isPaletteItem) {
              const newId = `note-${idCounter.current++}`;
              const midi = midiFromStaffSlot(placement.slot, clef);
              setPlacedNotes((prev) => [
                ...prev,
                {
                  id: newId,
                  duration,
                  midi,
                  beat: prev.length,
                  x: resolveNoteX(placement.x, prev),
                  y: placement.y,
                  staffSlot: placement.slot
                }
              ]);
              draggable.setAttribute("data-drop-success", "false");
            } else {
              setPlacedNotes((prev) =>
                prev.map((note) =>
                  note.id === draggable.id
                    ? {
                        ...note,
                        x: resolveNoteX(placement.x, prev, note.id),
                        y: placement.y,
                        staffSlot: placement.slot,
                        midi: midiFromStaffSlot(placement.slot, clef)
                      }
                    : note
                )
              );
              draggable.setAttribute("data-drop-success", "true");
              draggable.setAttribute("data-x", "0");
              draggable.setAttribute("data-y", "0");
              draggable.style.transform = "translate(0px, 0px)";
            }
          }

          // alert(`${duration} note was dropped into ${targetId}`);
        }
      })
      .on("dropactivate", (event) => {
        (event.target as HTMLElement | null)?.classList.add("drop-activated");
      });

    // optional cleanup
    return () => {
      interact(".draggable").unset();
      interact(".dropzone").unset();
    };
  }, []);

  useEffect(() => {
    setPlacedNotes((prev) =>
      prev.map((note) =>
        note.staffSlot == null
          ? note
          : { ...note, midi: midiFromStaffSlot(note.staffSlot, clef) }
      )
    );
  }, [clef]);

  return (
    <div className="page">
      <div className="palette">
        <div className="clef-toggle">
          <label htmlFor="clef-select">Chiave</label>
          <select
            id="clef-select"
            value={clef}
            onChange={(event) => setClef(event.target.value as "treble" | "bass")}
          >
            <option value="treble">Violino</option>
            <option value="bass">Basso</option>
          </select>
        </div>
        <button
          type="button"
          className="export-midi"
          onClick={handleExportMidi}
          disabled={!hasNotes}
        >
          Esporta MIDI
        </button>
        <button
          type="button"
          className="export-json"
          onClick={handleExportJson}
          disabled={!hasNotes}
        >
          Esporta JSON
        </button>
        {paletteNotes.map((note) => (
          <div
            key={note.id}
            id={note.id}
            className="note draggable palette-item"
            data-duration={note.duration}
            data-palette="true"
          >
            <Note duration={note.duration} />
          </div>
        ))}
      </div>

      <div className="container">
        <div id="drop-target" className="dropzone">
          <div className="dropzone-label">{clefLabel}</div>
          <div className="staff">
            <div
              className="staff-area"
              style={{
                ["--clef-anchor-y" as any]:
                  clef === "bass" ? "var(--f-line-y)" : "var(--g-line-y)"
              }}
            >
              <div className="staff-clef" aria-hidden="true">
                {clefSymbol}
              </div>
              <div className="staff-lines">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="dropzone-notes">
                {placedNotes.map((note) => (
                  <div
                    key={note.id}
                    id={note.id}
                    className="note draggable dropped-note"
                    data-duration={note.duration}
                    style={{
                      left: `${note.x ?? note.beat * NOTE_STEP}px`,
                      top: `${note.y ?? 0}px`
                    }}
                  >
                    <Note duration={note.duration} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
