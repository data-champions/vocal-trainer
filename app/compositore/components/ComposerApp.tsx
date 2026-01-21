"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";
import interact from "interactjs";
import { encodeWav } from "../../../lib/audio";
import { GAP_SECONDS } from "../../../lib/constants";
import { NOTE_NAMES } from "../../../lib/notes";
import { renderPianoMelody, type PianoNoteEvent } from "../../../lib/piano";
import type { Pattern, PatternScore } from "../../../lib/types";
import { Note } from "./Note";
import type { NoteAccidental, NoteDuration, NoteModel } from "../types";

const NOTE_WIDTH = 20;
const DEFAULT_NOTE_WIDTH = 60;
const NOTE_HEAD_OFFSET_X = 40;
const NOTE_HEAD_OFFSET_Y = 50;
const LEDGER_SLOT_COUNT = 6; // tagli addizionali added above and below the staff
const NOTE_GAP = NOTE_WIDTH * 0.25;
const NOTE_STEP = NOTE_WIDTH + NOTE_GAP;
const MIN_DROPZONE_WIDTH = NOTE_STEP * 128;
const DROPZONE_TRAILING_SPACE = NOTE_STEP * 8;
const PPQ = 480;
const DEFAULT_TEMPO_MICROS = 500000;
const SECONDS_PER_BEAT = DEFAULT_TEMPO_MICROS / 1_000_000;
const STAFF_LINE_COUNT = 5;
const STAFF_SLOT_COUNT = STAFF_LINE_COUNT * 2 - 1;
const DEFAULT_SLOT_STEP = 8;
const DEFAULT_STAFF_TOP = 52.8;
const TREBLE_BASE_MIDI = 67; // G4
const BASS_BASE_MIDI = 53; // F3
const TREBLE_BASE_SLOT = LEDGER_SLOT_COUNT + 6; // G line (second from bottom)
const BASS_BASE_SLOT = LEDGER_SLOT_COUNT + 2; // F line (second from top)
const TREBLE_INTERVALS = [2, 2, 1, 2, 2, 1, 2]; // G A B C D E F G
const BASS_INTERVALS = [2, 2, 2, 1, 2, 2, 1]; // F G A B C D E F

const SYMBOL_TO_DURATION: Record<string, NoteDuration> = {
  whole: "whole",
  half: "half",
  quarter: "quarter",
  eighth: "eighth",
  sixteenth: "sixteenth",
  w: "whole",
  h: "half",
  q: "quarter",
  "8": "eighth",
  "16": "sixteenth"
};

const DIATONIC_INDEX: Record<string, number> = {
  c: 0,
  d: 1,
  e: 2,
  f: 3,
  g: 4,
  a: 5,
  b: 6
};
const DIATONIC_LETTERS = ["c", "d", "e", "f", "g", "a", "b"];

const accidentalToOffset = (accidental: NoteAccidental | null | undefined) => {
  if (accidental === "sharp") {
    return 1;
  }
  if (accidental === "flat") {
    return -1;
  }
  return 0;
};

const accidentalToSymbol = (accidental: NoteAccidental | null | undefined) => {
  if (accidental === "sharp") {
    return "#";
  }
  if (accidental === "flat") {
    return "b";
  }
  return "";
};

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

type ParsedPitch = {
  letter: keyof typeof DIATONIC_INDEX;
  octave: number;
  accidental: NoteAccidental | null;
};

const parsePitch = (pitch: string | null | undefined): ParsedPitch | null => {
  if (!pitch) {
    return null;
  }
  const match = pitch.trim().toLowerCase().match(/^([a-g])([#b]?)(?:\/)?(-?\d+)$/);
  if (!match) {
    return null;
  }
  const letter = match[1] as keyof typeof DIATONIC_INDEX;
  const accidental = match[2];
  const octave = Number(match[3]);
  if (!Number.isFinite(octave) || !(letter in DIATONIC_INDEX)) {
    return null;
  }
  return {
    letter,
    octave,
    accidental:
      accidental === "#"
        ? "sharp"
        : accidental === "b"
          ? "flat"
          : null
  };
};

const getStaffSlotFromPitch = (
  pitch: string | undefined,
  clef: "treble" | "bass"
) => {
  const parsed = parsePitch(pitch);
  const base =
    clef === "bass"
      ? { letter: "f", octave: 3, slot: BASS_BASE_SLOT }
      : { letter: "g", octave: 4, slot: TREBLE_BASE_SLOT };

  if (!parsed) {
    return base.slot;
  }

  const baseIndex = base.octave * 7 + DIATONIC_INDEX[base.letter];
  const targetIndex = parsed.octave * 7 + DIATONIC_INDEX[parsed.letter];
  const steps = targetIndex - baseIndex;

  return base.slot - steps;
};

const getPitchFromStaffSlot = (
  staffSlot: number,
  clef: "treble" | "bass"
) => {
  const base =
    clef === "bass"
      ? { letter: "f", octave: 3, slot: BASS_BASE_SLOT }
      : { letter: "g", octave: 4, slot: TREBLE_BASE_SLOT };
  const baseIndex = base.octave * 7 + DIATONIC_INDEX[base.letter];
  const steps = base.slot - staffSlot;
  const targetIndex = baseIndex + steps;
  const letterIndex = ((targetIndex % 7) + 7) % 7;
  const octave = Math.floor(targetIndex / 7);
  const letter = DIATONIC_LETTERS[letterIndex] ?? "c";

  return { letter, octave };
};

const parseDuration = (value: string | undefined): NoteDuration => {
  const key = (value ?? "").toLowerCase();
  return SYMBOL_TO_DURATION[key] ?? "quarter";
};

const parseStart = (value: number | undefined, fallback: number) => {
  const start = typeof value === "number" ? value : Number(value);
  return Number.isFinite(start) ? start : fallback;
};

const getLedgerLineOffsets = (slot: number, slotStep: number) => {
  const offsets: number[] = [];
  const staffSlotStart = LEDGER_SLOT_COUNT;
  const staffSlotEnd = staffSlotStart + STAFF_SLOT_COUNT - 1;

  if (slot < staffSlotStart) {
    const distanceSlots = staffSlotStart - slot;
    const ledgerLineCount = Math.floor(distanceSlots / 2);
    for (let i = 1; i <= ledgerLineCount; i += 1) {
      const lineSlot = staffSlotStart - 2 * i;
      offsets.push((lineSlot - slot) * slotStep + NOTE_HEAD_OFFSET_Y);
    }
  } else if (slot > staffSlotEnd) {
    const distanceSlots = slot - staffSlotEnd;
    const ledgerLineCount = Math.floor(distanceSlots / 2);
    for (let i = 1; i <= ledgerLineCount; i += 1) {
      const lineSlot = staffSlotEnd + 2 * i;
      offsets.push((lineSlot - slot) * slotStep + NOTE_HEAD_OFFSET_Y);
    }
  }

  return offsets;
};

const readCssNumber = (value: string, fallback: number) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const midiToPitch = (midi: number) => {
  const names = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
  const note = names[midi % 12] || "c";
  const octave = Math.floor(midi / 12) - 1;

  return `${note}/${octave}`;
};

const buildPitchFromNote = (
  note: NoteModel,
  clef: "treble" | "bass"
) => {
  if (note.staffSlot == null) {
    return midiToPitch(note.midi ?? 60);
  }
  const { letter, octave } = getPitchFromStaffSlot(note.staffSlot, clef);
  const accidental = accidentalToSymbol(note.accidental);
  return `${letter}${accidental}/${octave}`;
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

type DropzoneMetrics = {
  notesRect: DOMRect;
  slotPositions: number[];
  staffSlotStart: number;
  staffSlotEnd: number;
};

type DropzonePreviewLine = {
  offset: number;
  kind: "staff" | "ledger";
  x: number;
};

const resolveNoteX = (
  x: number,
  notes: NoteModel[],
  minSpacing: number,
  ignoreId?: string
) => {
  let candidate = x;
  const occupied = notes
    .filter((note) => note.id !== ignoreId)
    .map((note) => note.x ?? note.beat * NOTE_STEP);

  let attempts = 0;
  const step = Math.max(minSpacing, NOTE_STEP);
  while (occupied.some((pos) => Math.abs(candidate - pos) < minSpacing)) {
    candidate += step;
    attempts += 1;
    if (attempts > notes.length + 4) {
      break;
    }
  }

  return candidate;
};

const applyMinimumSpacing = <T extends { x: number }>(
  notes: T[],
  minSpacing: number
) => {
  let lastX = -Infinity;
  return notes.map((note) => {
    const nextX = Math.max(note.x, lastX + minSpacing);
    lastX = nextX;
    if (nextX === note.x) {
      return note;
    }
    return { ...note, x: nextX };
  });
};

const buildSlotPositions = (lineCenters: number[]) => {
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

  return slotPositions;
};

const getDropzoneMetrics = (event: DropEvent): DropzoneMetrics | null => {
  const dropzone = event.target as HTMLElement | null;
  const notesArea = dropzone?.querySelector(".dropzone-notes") as HTMLElement | null;
  const staffLines = dropzone
    ?.querySelector(".staff-area")
    ?.querySelectorAll(".staff-lines span");

  if (!notesArea || !staffLines || staffLines.length === 0) {
    return null;
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
  const slotPositions = buildSlotPositions(lineCenters);

  return {
    notesRect,
    slotPositions,
    staffSlotStart,
    staffSlotEnd
  };
};

const findNearestSlot = (dropY: number, slotPositions: number[]) => {
  let nearestSlot = 0;
  let nearestDiff = Number.POSITIVE_INFINITY;
  slotPositions.forEach((pos, idx) => {
    const diff = Math.abs(dropY - pos);
    if (diff < nearestDiff) {
      nearestDiff = diff;
      nearestSlot = idx;
    }
  });

  return nearestSlot;
};

const arePreviewLinesEqual = (
  left: DropzonePreviewLine[],
  right: DropzonePreviewLine[]
) => {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i += 1) {
    if (
      left[i]?.offset !== right[i]?.offset ||
      left[i]?.kind !== right[i]?.kind ||
      left[i]?.x !== right[i]?.x
    ) {
      return false;
    }
  }
  return true;
};

const computeDropPlacement = (event: DropEvent) => {
  const metrics = getDropzoneMetrics(event);
  if (!metrics) {
    return {
      x: 0,
      y: 0,
      slot: 0,
      outOfStaff: false,
      outOfStaffDistance: 0,
      ledgerLineOffsets: []
    };
  }

  const { notesRect, slotPositions, staffSlotStart, staffSlotEnd } = metrics;

  const dropY = (event.dragEvent?.clientY ?? notesRect.top) - notesRect.top;
  const dropX = (event.dragEvent?.clientX ?? notesRect.left) - notesRect.left;

  const nearestSlot = findNearestSlot(dropY, slotPositions);

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

const computeDropHighlight = (event: DropEvent): DropzonePreviewLine[] => {
  const metrics = getDropzoneMetrics(event);
  if (!metrics) {
    return [];
  }

  const { notesRect, slotPositions, staffSlotStart, staffSlotEnd } = metrics;
  const dropY = (event.dragEvent?.clientY ?? notesRect.top) - notesRect.top;
  const dropX = (event.dragEvent?.clientX ?? notesRect.left) - notesRect.left;
  const nearestSlot = findNearestSlot(dropY, slotPositions);
  const slotDelta = Math.abs(nearestSlot - staffSlotStart);
  const isLineSlot = slotDelta % 2 === 0;
  const lineSlots = isLineSlot
    ? [nearestSlot]
    : [nearestSlot - 1, nearestSlot + 1];
  const noteX = Math.max(
    0,
    Math.min(notesRect.width - NOTE_WIDTH, dropX - NOTE_HEAD_OFFSET_X)
  );

  return lineSlots
    .filter((slot) => slot >= 0 && slot < slotPositions.length)
    .map((slot) => {
      const offset = slotPositions[slot];
      if (!Number.isFinite(offset)) {
        return null;
      }
      return {
        offset,
        kind: slot >= staffSlotStart && slot <= staffSlotEnd ? "staff" : "ledger",
        x: noteX
      };
    })
    .filter((value): value is DropzonePreviewLine => value !== null);
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
  const [patternName, setPatternName] = useState("");
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const [selectedAccidental, setSelectedAccidental] =
    useState<NoteAccidental | null>(null);
  const staffRef = useRef<HTMLDivElement | null>(null);
  const dropzoneScrollRef = useRef<HTMLDivElement | null>(null);
  const dropzonePanningRef = useRef(false);
  const dropzonePanStartXRef = useRef(0);
  const dropzonePanStartScrollLeftRef = useRef(0);
  const selectedAccidentalRef = useRef<NoteAccidental | null>(null);
  const [layout, setLayout] = useState({
    slotStep: DEFAULT_SLOT_STEP,
    staffTop: DEFAULT_STAFF_TOP,
    noteWidth: DEFAULT_NOTE_WIDTH
  });
  const [placedNotes, setPlacedNotes] = useState<NoteModel[]>([]);
  const hasNotes = placedNotes.length > 0;
  const hasPatternName = patternName.trim().length > 0;
  const selectedPattern = useMemo(
    () => patterns.find((pattern) => pattern.id === selectedPatternId),
    [patterns, selectedPatternId]
  );
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isRenderingAudio, setIsRenderingAudio] = useState(false);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const shouldAutoplayRef = useRef(false);
  const [previewLines, setPreviewLines] = useState<DropzonePreviewLine[]>([]);
  const dropzoneWidth = useMemo(() => {
    const maxNoteX = placedNotes.reduce((max, note) => {
      const noteX = note.x ?? note.beat * NOTE_STEP;
      return Math.max(max, noteX);
    }, 0);

    return Math.max(
      MIN_DROPZONE_WIDTH,
      maxNoteX + DROPZONE_TRAILING_SPACE + layout.noteWidth
    );
  }, [layout.noteWidth, placedNotes]);
  const minNoteSpacing = Math.max(layout.noteWidth * .75, NOTE_STEP);

  const handleDropzonePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "mouse" || event.button !== 0) {
        return;
      }
      const target = event.target as HTMLElement;
      if (target.closest(".note")) {
        return;
      }
      const scrollEl = dropzoneScrollRef.current;
      if (!scrollEl) {
        return;
      }

      dropzonePanningRef.current = true;
      dropzonePanStartXRef.current = event.clientX;
      dropzonePanStartScrollLeftRef.current = scrollEl.scrollLeft;
      scrollEl.classList.add("is-panning");
      scrollEl.setPointerCapture(event.pointerId);
    },
    []
  );

  const handleDropzonePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dropzonePanningRef.current || event.pointerType !== "mouse") {
        return;
      }
      const scrollEl = dropzoneScrollRef.current;
      if (!scrollEl) {
        return;
      }
      const deltaX = event.clientX - dropzonePanStartXRef.current;
      scrollEl.scrollLeft = dropzonePanStartScrollLeftRef.current - deltaX;
    },
    []
  );

  const handleDropzonePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dropzonePanningRef.current) {
        return;
      }
      const scrollEl = dropzoneScrollRef.current;
      if (scrollEl?.hasPointerCapture(event.pointerId)) {
        scrollEl.releasePointerCapture(event.pointerId);
      }
      dropzonePanningRef.current = false;
      scrollEl?.classList.remove("is-panning");
    },
    []
  );

  useEffect(() => {
    const updateLayout = () => {
      const staffEl = staffRef.current;
      if (!staffEl) {
        return;
      }
      const styles = getComputedStyle(staffEl);
      const slotStep = readCssNumber(
        styles.getPropertyValue("--slot-step"),
        DEFAULT_SLOT_STEP
      );
      const staffTop = readCssNumber(
        styles.getPropertyValue("--staff-top"),
        DEFAULT_STAFF_TOP
      );
      const noteWidth = readCssNumber(
        styles.getPropertyValue("--note-width"),
        DEFAULT_NOTE_WIDTH
      );
      setLayout({ slotStep, staffTop, noteWidth });
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, []);

  useEffect(() => {
    selectedAccidentalRef.current = selectedAccidental;
  }, [selectedAccidental]);

  const handleAccidentalToggle = useCallback((accidental: NoteAccidental) => {
    setSelectedAccidental((prev) => {
      const next = prev === accidental ? null : accidental;
      selectedAccidentalRef.current = next;
      return next;
    });
  }, []);

  const buildPlacedNotesFromScore = useCallback(
    (
      score: PatternScore | null,
      targetClef: "treble" | "bass"
    ): NoteModel[] => {
      if (!score || !Array.isArray(score.notes)) {
        return [];
      }
      const staffSlotStart = LEDGER_SLOT_COUNT;
      const staffSlotEnd = staffSlotStart + STAFF_SLOT_COUNT - 1;
      const orderedNotes = [...score.notes].sort((a, b) => {
        const startA = parseStart(a?.start, 0);
        const startB = parseStart(b?.start, 0);
        return startA - startB;
      });

      idCounter.current = 0;
      const baseNotes = orderedNotes.map((note, index) => {
        const duration = parseDuration(note?.duration);
        const start = parseStart(note?.start, index);
        const parsedPitch = parsePitch(note?.pitch);
        const staffSlot = getStaffSlotFromPitch(note?.pitch, targetClef);
        const accidental = parsedPitch?.accidental ?? null;
        const baseMidi = midiFromStaffSlot(staffSlot, targetClef);
        const midi = baseMidi + accidentalToOffset(accidental);
        const x = Math.max(0, start * NOTE_STEP);
        const y =
          layout.staffTop +
          (staffSlot - LEDGER_SLOT_COUNT) * layout.slotStep -
          NOTE_HEAD_OFFSET_Y;
        const outOfStaff =
          staffSlot < staffSlotStart || staffSlot > staffSlotEnd;
        const ledgerLineOffsets = getLedgerLineOffsets(
          staffSlot,
          layout.slotStep
        );

        return {
          id: `note-${idCounter.current++}`,
          duration,
          midi,
          beat: start,
          x,
          y,
          staffSlot,
          accidental,
          outOfStaff,
          ledgerLineOffsets
        };
      });
      return applyMinimumSpacing(baseNotes, minNoteSpacing);
    },
    [layout.slotStep, layout.staffTop, minNoteSpacing]
  );

  const applyPattern = useCallback(
    (pattern: Pattern | null) => {
      if (!pattern) {
        setPatternName("");
        setPlacedNotes([]);
        setAudioUrl(null);
        setIsRenderingAudio(false);
        idCounter.current = 0;
        return;
      }
      const nextClef =
        pattern.score?.metadata?.clef === "bass" ? "bass" : "treble";
      setClef(nextClef);
      setPatternName(pattern.name);
      setPlacedNotes(buildPlacedNotesFromScore(pattern.score, nextClef));
      setAudioUrl(null);
      setIsRenderingAudio(false);
    },
    [buildPlacedNotesFromScore]
  );

  const refreshPatterns = useCallback(
    async (preferredId?: string | null) => {
      const response = await fetch("/api/patterns");
      if (!response.ok) {
        return;
      }
      const data = (await response.json().catch(() => ({}))) as {
        patterns?: Pattern[];
      };
      const nextPatterns = Array.isArray(data.patterns) ? data.patterns : [];
      setPatterns(nextPatterns);
      setSelectedPatternId((prev) => {
        const candidateId = preferredId ?? prev;
        const nextId =
          candidateId && nextPatterns.some((pattern) => pattern.id === candidateId)
            ? candidateId
            : nextPatterns[0]?.id ?? null;
        const nextPattern = nextId
          ? nextPatterns.find((pattern) => pattern.id === nextId) ?? null
          : null;
        applyPattern(nextPattern);
        return nextId;
      });
    },
    [applyPattern]
  );

  useEffect(() => {
    void refreshPatterns();
  }, [refreshPatterns]);

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

  const handleSelectPattern = useCallback(
    (patternId: string) => {
      if (!patternId) {
        setSelectedPatternId(null);
        applyPattern(null);
        return;
      }
      const pattern = patterns.find((item) => item.id === patternId) ?? null;
      if (!pattern) {
        return;
      }
      setSelectedPatternId(pattern.id);
      applyPattern(pattern);
    },
    [applyPattern, patterns]
  );

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

  const handleSaveMelody = async () => {
    if (!hasNotes) {
      alert("Non ci sono note da salvare.");
      return;
    }
    const trimmedName = patternName.trim();
    if (!trimmedName) {
      alert("Inserisci un nome per il pattern.");
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
        pitch: buildPitchFromNote(note, clef),
        duration: durationToSymbol[note.duration] ?? "q",
        start
      });

      currentBeat += durationBeats;
    });

    const payload: PatternScore = {
      name: trimmedName,
      metadata: {
        tempo: 120,
        timeSignature: "4/4",
        clef,
        key: "C"
      },
      notes
    };
    const saveNewPattern = async (): Promise<boolean> => {
      const response = await fetch("/api/patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, score: payload })
      });
      if (!response.ok) {
        window.alert("Errore nel salvataggio del pattern.");
        return false;
      }
      const data = (await response.json().catch(() => ({}))) as {
        pattern?: Pattern;
      };
      const createdId = data.pattern?.id ?? null;
      await refreshPatterns(createdId);
      return true;
    };

    const updatePattern = async (patternId: string): Promise<boolean> => {
      const response = await fetch(`/api/patterns/${patternId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, score: payload })
      });
      if (!response.ok) {
        window.alert("Errore nel salvataggio del pattern.");
        return false;
      }
      await refreshPatterns(patternId);
      return true;
    };

    if (selectedPattern && selectedPatternId) {
      if (selectedPattern.name !== trimmedName) {
        const renameExisting = window.confirm(
          "Hai cambiato il nome. Vuoi rinominare il pattern esistente?\nOK = rinomina, Annulla = crea un nuovo pattern."
        );
        if (renameExisting) {
          const updated = await updatePattern(selectedPatternId);
          if (updated) {
            window.alert("Pattern rinominato e salvato.");
          }
          return;
        }
        const created = await saveNewPattern();
        if (created) {
          window.alert("Nuova melodia creata.");
        }
        return;
      }
      const updated = await updatePattern(selectedPatternId);
      if (updated) {
        window.alert("Melodia salvata.");
      }
      return;
    }

    const created = await saveNewPattern();
    if (created) {
      window.alert("Melodia salvata. Ora la trovi in /esercizi.");
    }
  };

  const handleDeletePattern = async () => {
    if (!selectedPatternId || !selectedPattern) {
      window.alert("Seleziona una melodia da eliminare.");
      return;
    }
    const confirmed = window.confirm(
      `Vuoi eliminare la melodia "${selectedPattern.name}"?`
    );
    if (!confirmed) {
      return;
    }
    const response = await fetch(`/api/patterns/${selectedPatternId}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      window.alert("Errore nell'eliminazione della melodia.");
      return;
    }
    await refreshPatterns(null);
    window.alert("Melodia eliminata.");
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
        ondropmove(event) {
          const nextPreview = computeDropHighlight(event);
          setPreviewLines((prev) =>
            arePreviewLinesEqual(prev, nextPreview) ? prev : nextPreview
          );
        },
        ondragleave() {
          setPreviewLines([]);
        },
        ondropdeactivate() {
          setPreviewLines([]);
        },
        ondrop(event) {
          setPreviewLines([]);
          const draggable = event.relatedTarget as HTMLElement | null;
          const duration = (draggable?.dataset.duration as NoteDuration | undefined) || "quarter";
          const isPaletteItem = draggable?.dataset.palette === "true";
          const placement = computeDropPlacement(event);
          console.log("outOfStaffDistance", placement.outOfStaffDistance);

          if (draggable) {
            if (isPaletteItem) {
              const newId = `note-${idCounter.current++}`;
              const accidental = selectedAccidentalRef.current;
              const baseMidi = midiFromStaffSlot(placement.slot, clef);
              const midi = baseMidi + accidentalToOffset(accidental);
              setPlacedNotes((prev) => [
                ...prev,
                {
                  id: newId,
                  duration,
                  midi,
                  beat: prev.length,
                  x: resolveNoteX(placement.x, prev, minNoteSpacing),
                  y: placement.y,
                  staffSlot: placement.slot,
                  accidental,
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
                        x: resolveNoteX(placement.x, prev, minNoteSpacing, note.id),
                        y: placement.y,
                        staffSlot: placement.slot,
                        midi:
                          midiFromStaffSlot(placement.slot, clef) +
                          accidentalToOffset(note.accidental),
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
  }, [clef, minNoteSpacing]);

  useEffect(() => {
    setPlacedNotes((prev) =>
      prev.map((note) =>
        note.staffSlot == null
          ? note
          : {
              ...note,
              midi:
                midiFromStaffSlot(note.staffSlot, clef) +
                accidentalToOffset(note.accidental)
            }
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
          <div className="exercise-select">
            <select
              value={selectedPatternId ?? ""}
              onChange={(event) => handleSelectPattern(event.target.value)}
              aria-label="Seleziona pattern"
              title="Seleziona pattern"
            >
              <option value="">Nuova melodia</option>
              {/* pattern=melodia */}
              {patterns.map((pattern) => (
                <option key={pattern.id} value={pattern.id}>
                  {pattern.name}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            className="exercise-name-input"
            value={patternName}
            onChange={(event) => setPatternName(event.target.value)}
            placeholder="Nome melodia"
            aria-label="Nome melodia"
          />
          <div className="clef-toggle">
            <select
              value={clef}
              onChange={(event) => setClef(event.target.value as "treble" | "bass")}
              aria-label="Scegli chiave"
              title="Scegli chiave"
            >
              <option value="treble">Chiave di violino</option>
              <option value="bass">Chiave di basso</option>
            </select>
          </div>
          <button
            type="button"
            className="export-json"
            onClick={handleSaveMelody}
            disabled={!hasNotes || !hasPatternName}
          >
            Salva melodia
          </button>
          <button
            type="button"
            className="delete-pattern"
            onClick={handleDeletePattern}
            disabled={!selectedPatternId}
          >
            Elimina melodia
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
          <div className="palette-accidentals" aria-label="Alterazioni">
            <button
              type="button"
              className={`accidental-toggle${
                selectedAccidental === "sharp" ? " is-selected" : ""
              }`}
              onClick={() => handleAccidentalToggle("sharp")}
              aria-pressed={selectedAccidental === "sharp"}
              aria-label="Diesis"
              title="Diesis"
            >
              <span aria-hidden="true">{"\u266f"}</span>
            </button>
            <button
              type="button"
              className={`accidental-toggle${
                selectedAccidental === "flat" ? " is-selected" : ""
              }`}
              onClick={() => handleAccidentalToggle("flat")}
              aria-pressed={selectedAccidental === "flat"}
              aria-label="Bemolle"
              title="Bemolle"
            >
              <span aria-hidden="true">{"\u266d"}</span>
            </button>
          </div>
          <div className="palette-note-row">
            {paletteNotes.map((note) => (
              <Fragment key={note.id}>
                <div
                  id={note.id}
                  className="note draggable palette-item"
                  data-duration={note.duration}
                  data-palette="true"
                >
                  <Note duration={note.duration} accidental={selectedAccidental} />
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
        <div
          className="dropzone-scroll"
          ref={dropzoneScrollRef}
          onPointerDown={handleDropzonePointerDown}
          onPointerMove={handleDropzonePointerMove}
          onPointerUp={handleDropzonePointerUp}
          onPointerCancel={handleDropzonePointerUp}
        >
          <div
            id="drop-target"
            className="dropzone"
            style={{ minWidth: dropzoneWidth }}
          >
            <div className="dropzone-label">{clefLabel}</div>
            <div className="staff">
              <div className="staff-area" style={clefAnchorStyle} ref={staffRef}>
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
                  {previewLines.map((line, index) => (
                    <span
                      key={`preview-line-${line.kind}-${index}`}
                      className={`dropzone-preview-line${line.kind === "ledger" ? " is-ledger" : ""}`}
                      style={{
                        top: `${line.offset}px`,
                        ["--preview-note-x" as string]: `${line.x}px`
                      }}
                      aria-hidden="true"
                    />
                  ))}
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
                      <Note duration={note.duration} accidental={note.accidental} />
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

    </div>
  );
}
