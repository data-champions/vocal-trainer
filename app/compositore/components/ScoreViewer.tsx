"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from "react";
import { Note } from "./Note";
import type { NoteAccidental, NoteDuration } from "../types";

const NOTE_HEAD_OFFSET_Y = 50;
const NOTE_STEP = 25; // keep horizontal spacing consistent with the composer
const DEFAULT_NOTE_WIDTH = 50;
const LEDGER_SLOT_COUNT = 6;
const STAFF_LINE_COUNT = 5;
const STAFF_SLOT_COUNT = STAFF_LINE_COUNT * 2 - 1;
const TREBLE_BASE_SLOT = LEDGER_SLOT_COUNT + 6; // G line (second from bottom)
const BASS_BASE_SLOT = LEDGER_SLOT_COUNT + 2; // F line (second from top)
const DEFAULT_SLOT_STEP = 8;
const DEFAULT_STAFF_TOP = 52.8;

const DURATION_MAP: Record<string, NoteDuration> = {
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

type ScoreMetadata = {
  clef?: "treble" | "bass";
  tempo?: number;
  timeSignature?: string;
  key?: string;
};

type SerializedNote = {
  pitch?: string;
  duration?: string;
  start?: number;
};

type SerializedScore = {
  name?: string;
  metadata?: ScoreMetadata;
  notes?: SerializedNote[];
};

type ScoreViewerProps = {
  score: SerializedScore | string | null;
  activeNoteIndex?: number | null;
};

type LayoutMetrics = {
  staffTop: number;
  slotStep: number;
  noteWidth: number;
};

type LayoutNote = {
  id: string;
  sequenceIndex: number;
  duration: NoteDuration;
  x: number;
  y: number;
  accidental?: NoteAccidental | null;
  outOfStaff: boolean;
  ledgerLineOffsets: number[];
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

const parseDuration = (value: string | undefined): NoteDuration => {
  const key = (value ?? "").toLowerCase();
  return DURATION_MAP[key] ?? "quarter";
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

export default function ScoreViewer({
  score,
  activeNoteIndex = null
}: ScoreViewerProps) {
  const staffRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<LayoutMetrics>({
    slotStep: DEFAULT_SLOT_STEP,
    staffTop: DEFAULT_STAFF_TOP,
    noteWidth: DEFAULT_NOTE_WIDTH
  });

  const parsedScore = useMemo<SerializedScore | null>(() => {
    if (!score) {
      return null;
    }
    if (typeof score === "string") {
      try {
        return JSON.parse(score) as SerializedScore;
      } catch (error) {
        console.warn("ScoreViewer: invalid JSON", error);
        return null;
      }
    }
    return score;
  }, [score]);

  const clef: "treble" | "bass" =
    parsedScore?.metadata?.clef === "bass" ? "bass" : "treble";
  const clefSymbol = clef === "treble" ? "\uD834\uDD1E" : "\uD834\uDD22";
  const clefLabel = clef === "treble" ? "Chiave di violino" : "Chiave di basso";

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

  const placedNotes = useMemo<LayoutNote[]>(() => {
    if (!parsedScore?.notes || !Array.isArray(parsedScore.notes)) {
      return [];
    }
    const minSpacing = Math.max(layout.noteWidth * 0.75, NOTE_STEP);
    const staffSlotStart = LEDGER_SLOT_COUNT;
    const staffSlotEnd = staffSlotStart + STAFF_SLOT_COUNT - 1;
    const orderedNotes = [...parsedScore.notes].sort((a, b) => {
      const startA = parseStart(a?.start, 0);
      const startB = parseStart(b?.start, 0);
      return startA - startB;
    });

    const baseNotes = orderedNotes.map((note, index) => {
      const duration = parseDuration(note?.duration);
      const start = parseStart(note?.start, index);
      const parsedPitch = parsePitch(note?.pitch);
      const accidental = parsedPitch?.accidental ?? null;
      const slot = getStaffSlotFromPitch(note?.pitch, clef);
      const x = Math.max(0, start * NOTE_STEP);
      const y =
        layout.staffTop +
        (slot - LEDGER_SLOT_COUNT) * layout.slotStep -
        NOTE_HEAD_OFFSET_Y;
      const outOfStaff = slot < staffSlotStart || slot > staffSlotEnd;
      const ledgerLineOffsets = getLedgerLineOffsets(slot, layout.slotStep);

      return {
        id: `note-${index}`,
        sequenceIndex: index,
        duration,
        x,
        y,
        accidental,
        outOfStaff,
        ledgerLineOffsets
      };
    });
    return applyMinimumSpacing(baseNotes, minSpacing);
  }, [clef, layout, parsedScore]);

  const clefAnchorStyle = {
    ["--clef-anchor-y" as string]:
      clef === "bass" ? "var(--f-line-y)" : "var(--g-line-y)"
  } as CSSProperties;

  if (!parsedScore || placedNotes.length === 0) {
    return (
      <div className="dropzone">
        <p>Nessuna melodia disponibile.</p>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="dropzone">
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
              {placedNotes.map((note) => (
                <div
                  key={note.id}
                  className={`note dropped-note${
                    note.outOfStaff ? " is-outside-staff" : ""
                  }${note.sequenceIndex === activeNoteIndex ? " is-playing" : ""}`}
                  style={{
                    left: `${note.x}px`,
                    top: `${note.y}px`
                  }}
                >
                  <Note duration={note.duration} accidental={note.accidental} />
                  {note.ledgerLineOffsets.map((offset, index) => (
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
  );
}
