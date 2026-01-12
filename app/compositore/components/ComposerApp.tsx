"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties
} from "react";
import interact from "interactjs";
import { encodeWav } from "../../../lib/audio";
import { GAP_SECONDS } from "../../../lib/constants";
import { NOTE_NAMES } from "../../../lib/notes";
import { renderPianoMelody, type PianoNoteEvent } from "../../../lib/piano";
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
const SECONDS_PER_BEAT = DEFAULT_TEMPO_MICROS / 1_000_000;
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

const midiToToneNote = (midi: number) => {
  const index = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[index]}${octave}`;
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

const noteSortValue = (note: NoteModel) => note.x ?? note.beat * NOTE_STEP;

const buildPlaybackNotes = (notes: NoteModel[]): PianoNoteEvent[] => {
  const sortedNotes = [...notes].sort(
    (a, b) => noteSortValue(a) - noteSortValue(b)
  );

  return sortedNotes
    .map((note) => ({
      note: midiToToneNote(note.midi ?? 60),
      durationSeconds:
        (durationToBeats[note.duration] ?? 1) * SECONDS_PER_BEAT,
    }))
    .filter((note) => note.note && note.durationSeconds > 0);
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

type DropEvent = {
  target: EventTarget | null;
  relatedTarget?: EventTarget | null;
  dragEvent?: {
    clientX: number;
    clientY: number;
  } | null;
};

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

const computeDropPlacement = (event: DropEvent) => {
  const dropzone = event.target as HTMLElement | null;
  const notesArea = dropzone?.querySelector(".dropzone-notes") as HTMLElement | null;
  const staffLines = dropzone
    ?.querySelector(".staff-area")
    ?.querySelectorAll(".staff-lines span");

  if (!notesArea || !staffLines || staffLines.length === 0) {
    return {
      x: 0,
      y: 0,
      slot: 0,
      outOfStaff: false,
      outOfStaffDistance: 0,
      ledgerLineOffsets: []
    };
  }

  const notesRect = notesArea.getBoundingClientRect();
  const lineCenters = Array.from(staffLines)
    .map((line) => {
      const rect = (line as HTMLElement).getBoundingClientRect();
      return rect.top + rect.height / 2 - notesRect.top;
    })
    .sort((a, b) => a - b);
  const staffSlotCount = lineCenters.length * 2 - 1;
  const staffSlotStart = LEDGER_SLOT_COUNT;
  const staffSlotEnd = staffSlotStart + staffSlotCount - 1;

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

  const outOfStaffDistance =
    nearestSlot < staffSlotStart
      ? (staffSlotStart - nearestSlot) * 0.5
      : nearestSlot > staffSlotEnd
        ? (staffSlotEnd - nearestSlot) * 0.5
        : 0;
  const ledgerLineCount = Math.floor(Math.abs(outOfStaffDistance));
  const noteSlotPosition = slotPositions[nearestSlot] ?? 0;
  const ledgerLineOffsets: number[] = [];
  if (ledgerLineCount > 0) {
    if (nearestSlot < staffSlotStart) {
      for (let i = 1; i <= ledgerLineCount; i += 1) {
        const slotIndex = staffSlotStart - 2 * i;
        const slotPosition = slotPositions[slotIndex];
        if (typeof slotPosition === "number") {
          ledgerLineOffsets.push(
            slotPosition - noteSlotPosition + NOTE_HEAD_OFFSET_Y
          );
        }
      }
    } else if (nearestSlot > staffSlotEnd) {
      for (let i = 1; i <= ledgerLineCount; i += 1) {
        const slotIndex = staffSlotEnd + 2 * i;
        const slotPosition = slotPositions[slotIndex];
        if (typeof slotPosition === "number") {
          ledgerLineOffsets.push(
            slotPosition - noteSlotPosition + NOTE_HEAD_OFFSET_Y
          );
        }
      }
    }
  }
  const y = (slotPositions[nearestSlot] ?? 0) - NOTE_HEAD_OFFSET_Y;
  const x = Math.max(
    0,
    Math.min(notesRect.width - NOTE_WIDTH, dropX - NOTE_HEAD_OFFSET_X)
  );

  return {
    x,
    y,
    slot: nearestSlot,
    outOfStaff: nearestSlot < staffSlotStart || nearestSlot > staffSlotEnd,
    outOfStaffDistance,
    ledgerLineOffsets
  };
};

export default function ComposerApp() {
  const [clef, setClef] = useState<"treble" | "bass">("treble");
  const clefSymbol = clef === "treble" ? "\uD834\uDD1E" : "\uD834\uDD22";
  const clefLabel = clef === "treble" ? "Chiave di violino" : "Chiave di basso";
  const paletteNotes: Array<Pick<NoteModel, "id" | "duration">> = [
    { id: "palette-eighth", duration: "eighth" },
    { id: "palette-quarter", duration: "quarter" },
    { id: "palette-half", duration: "half" },
    { id: "palette-whole", duration: "whole" }
  ];
  const idCounter = useRef(0);
  const [placedNotes, setPlacedNotes] = useState<NoteModel[]>([]);
  const hasNotes = placedNotes.length > 0;
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isRenderingAudio, setIsRenderingAudio] = useState(false);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const shouldAutoplayRef = useRef(false);

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

  const handleListen = useCallback(async () => {
    if (!hasNotes) {
      window.alert("Non ci sono note da riprodurre.");
      return;
    }

    const playbackNotes = buildPlaybackNotes(placedNotes);
    if (playbackNotes.length === 0) {
      window.alert("Nessuna nota valida da riprodurre.");
      return;
    }

    setIsRenderingAudio(true);
    try {
      const rendering = await renderPianoMelody(playbackNotes, GAP_SECONDS);
      if (!rendering || rendering.samples.length === 0) {
        window.alert("Nessun audio generato.");
        return;
      }

      const wavBuffer = encodeWav(rendering.samples, rendering.sampleRate, 1);
      const blob = new Blob([wavBuffer], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      shouldAutoplayRef.current = true;
      setAudioUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return url;
      });
    } catch (error) {
      console.error("Errore nella riproduzione del pianoforte", error);
      window.alert("Errore nella riproduzione del pianoforte.");
    } finally {
      setIsRenderingAudio(false);
    }
  }, [hasNotes, placedNotes]);

  const handleSaveMelody = () => {
    if (!hasNotes) {
      alert("Non ci sono note da salvare.");
      return;
    }

    const exerciseName = window.prompt("Nome dell'esercizio:");
    if (!exerciseName) {
      return;
    }
    const trimmedName = exerciseName.trim();
    if (!trimmedName) {
      return;
    }

    const sortedNotes = [...placedNotes].sort(
      (a, b) => noteSortValue(a) - noteSortValue(b)
    );
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
      name: trimmedName,
      metadata: {
        tempo: 120,
        timeSignature: "4/4",
        clef,
        key: "C"
      },
      notes
    };

    const json = JSON.stringify(payload, null, 2);
    // TODO: Integrare il salvataggio nel DB quando l'endpoint è disponibile.
    console.info("Melodia pronta per il salvataggio:", json);
  };

  useEffect(() => {
    if (!audioUrl || !shouldAutoplayRef.current) {
      return;
    }
    const audioEl = audioElementRef.current;
    if (!audioEl) {
      return;
    }
    const playWhenReady = () => {
      void audioEl.play();
      shouldAutoplayRef.current = false;
    };
    if (audioEl.readyState >= 2) {
      playWhenReady();
    } else {
      audioEl.addEventListener("canplay", playWhenReady, { once: true });
      return () => {
        audioEl.removeEventListener("canplay", playWhenReady);
      };
    }
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

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
          console.log("outOfStaffDistance", placement.outOfStaffDistance);

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
                  staffSlot: placement.slot,
                  outOfStaff: placement.outOfStaff,
                  ledgerLineOffsets: placement.ledgerLineOffsets
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
                        midi: midiFromStaffSlot(placement.slot, clef),
                        outOfStaff: placement.outOfStaff,
                        ledgerLineOffsets: placement.ledgerLineOffsets
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

    interact(".trash-dropzone").dropzone({
      accept: ".dropped-note",
      overlap: "pointer",
      ondragenter(event) {
        (event.target as HTMLElement | null)?.classList.add("trash-activated");
      },
      ondragleave(event) {
        (event.target as HTMLElement | null)?.classList.remove("trash-activated");
      },
      ondrop(event) {
        const draggable = event.relatedTarget as HTMLElement | null;

        if (!draggable) {
          return;
        }

        setPlacedNotes((prev) =>
          prev.filter((note) => note.id !== draggable.id)
        );
        draggable.setAttribute("data-drop-success", "true");
        (event.target as HTMLElement | null)?.classList.remove("trash-activated");
      }
    });

    // optional cleanup
    return () => {
      interact(".draggable").unset();
      interact(".dropzone").unset();
      interact(".trash-dropzone").unset();
    };
  }, [clef]);

  useEffect(() => {
    setPlacedNotes((prev) =>
      prev.map((note) =>
        note.staffSlot == null
          ? note
          : { ...note, midi: midiFromStaffSlot(note.staffSlot, clef) }
      )
    );
  }, [clef]);

  const clefAnchorStyle = {
    ["--clef-anchor-y" as string]:
      clef === "bass" ? "var(--f-line-y)" : "var(--g-line-y)"
  } as CSSProperties;

  return (
    <div className="page">
      <div className="composer-header">
        <h1>Crea esercizio</h1>
      </div>
      <div className="palette">
        <div className="palette-controls">
          <div className="clef-toggle">
            <select
              value={clef}
              onChange={(event) => setClef(event.target.value as "treble" | "bass")}
              aria-label="Scegli chiave"
              title="Scegli chiave"
            >
              <option value="treble">Violino</option>
              <option value="bass">Basso</option>
            </select>
          </div>
          <button
            type="button"
            className="export-json"
            onClick={handleSaveMelody}
            disabled={!hasNotes}
          >
            Salva melodia
          </button>
          <button
            type="button"
            className="export-midi"
            onClick={handleListen}
            disabled={!hasNotes || isRenderingAudio}
          >
            {isRenderingAudio ? "Preparazione..." : "Ascolta"}
          </button>
        </div>
        <div className="palette-notes" aria-label="Note disponibili">
          {paletteNotes.map((note) => (
            <Fragment key={note.id}>
              <div
                id={note.id}
                className="note draggable palette-item"
                data-duration={note.duration}
                data-palette="true"
              >
                <Note duration={note.duration} />
              </div>
              {note.duration === "whole" ? (
                <div
                  className="trash-dropzone"
                  aria-label="Elimina nota"
                  title="Trascina qui per eliminare"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0V4.5a2.25 2.25 0 0 0-2.25-2.25h-3a2.25 2.25 0 0 0-2.25 2.25v1.289m7.5 0a48.11 48.11 0 0 0-7.5 0"
                    />
                  </svg>
                </div>
              ) : null}
            </Fragment>
          ))}
        </div>
      </div>

        {audioUrl ? (
          <audio
            key={audioUrl}
            ref={audioElementRef}
            controls
            src={audioUrl}
            className="composer-audio"
            aria-label="Riproduzione melodia"
        />
         ) : null}

      <div className="container">
        <div id="drop-target" className="dropzone">
          <div className="dropzone-label">{clefLabel}</div>
          <div className="staff">
            <div className="staff-area" style={clefAnchorStyle}>
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
                    className={`note draggable dropped-note${note.outOfStaff ? " is-outside-staff" : ""}`}
                    data-duration={note.duration}
                    style={{
                      left: `${note.x ?? note.beat * NOTE_STEP}px`,
                      top: `${note.y ?? 0}px`
                    }}
                  >
                    <Note duration={note.duration} />
                    {note.ledgerLineOffsets?.map((offset, index) => (
                      <span
                        key={`${note.id}-ledger-${index}`}
                        className="ledger-line"
                        style={{ top: `${offset}px` }}
                        aria-hidden="true"
                      />
                    ))}
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
