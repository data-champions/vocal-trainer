import type { NotationMode } from "./constants";

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export const MAJOR_SCALE_INTERVALS = [2, 2, 1, 2, 2, 2, 1];
export const MIDI_A0 = 21;
export const MIDI_C8 = 108;

export const PIANO_KEYS = [
  "C8",
  "B7", "A#7", "A7", "G#7", "G7", "F#7", "F7", "E7", "D#7", "D7", "C#7", "C7",
  "B6", "A#6", "A6", "G6", "F#6", "F6", "E6", "D#6", "D6", "C#6", "C6",
  "B5", "A#5", "A5", "G#5", "G5", "F#5", "F5", "E5", "D#5", "D5", "C#5", "C5",
  "B4", "A#4", "A4", "G#4", "G4", "F#4", "F4", "E4", "D#4", "D4", "C#4", "C4",
  "B3", "A#3", "A3", "G3", "F#3", "F3", "E3", "D#3", "D3", "C#3", "C3",
  "B2", "A#2", "A2", "G#2", "G2", "F#2", "F2", "E2", "D#2", "D2", "C#2", "C2",
  "B1", "A#1", "A1", "G#1", "G1", "F#1", "F1", "E1", "D#1", "D1", "C#1", "C1",
  "B0", "A#0", "A0"
] as const;

export const ASCENDING_KEYS = [...PIANO_KEYS].reverse();

export type PianoKey = (typeof PIANO_KEYS)[number];

const NOTE_TO_ITALIAN: Record<string, string> = {
  C: "Do",
  "C#": "Do#",
  D: "Re",
  "D#": "Re#",
  E: "Mi",
  F: "Fa",
  "F#": "Fa#",
  G: "Sol",
  "G#": "Sol#",
  A: "La",
  "A#": "La#",
  B: "Si"
};

const removeDigits = (note: string): string => note.replace(/\d/g, "");

const extractOctave = (note: string): string => {
  const match = note.match(/\d+/);
  return match ? match[0] : "";
};

export function toItalianLabel(note: string): string {
  const base = removeDigits(note);
  return `${NOTE_TO_ITALIAN[base] ?? base}${extractOctave(note)}`;
}

export function formatNoteByNotation(note: string, mode: NotationMode): string {
  return mode === "italian" ? toItalianLabel(note) : note;
}

export const noteIndex = (note: PianoKey | string): number =>
  ASCENDING_KEYS.indexOf(note as PianoKey);

export function buildAscendingNotes(startNote: PianoKey | string, count: number): string[] {
  if (count <= 0) {
    return [];
  }
  const startIdx = ASCENDING_KEYS.indexOf(startNote as PianoKey);
  if (startIdx === -1) {
    return [];
  }
  const ascending: string[] = [ASCENDING_KEYS[startIdx]];
  let currentIdx = startIdx;
  for (let i = 0; i < count - 1; i += 1) {
    const interval = MAJOR_SCALE_INTERVALS[i % MAJOR_SCALE_INTERVALS.length];
    currentIdx += interval;
    if (currentIdx >= ASCENDING_KEYS.length) {
      break;
    }
    ascending.push(ASCENDING_KEYS[currentIdx]);
  }
  return ascending;
}

export function buildSequence(startNote: string, count: number): string[] {
  const ascending = buildAscendingNotes(startNote, count);
  if (ascending.length === 0) {
    return [startNote];
  }

  const descending = ascending.slice(0, -1).reverse();
  return [...ascending, ...descending];
}

export function midiFrequency(note: string): number {
  const octave = Number(note.slice(-1));
  const name = note.slice(0, -1);
  const midiNum = NOTE_NAMES.indexOf(name as (typeof NOTE_NAMES)[number]) + 12 * (octave + 1);
  return 440 * 2 ** ((midiNum - 69) / 12);
}

export function frequencyToNearestNoteName(frequency: number | null): string | null {
  if (!frequency || !Number.isFinite(frequency) || frequency <= 0) {
    return null;
  }
  const midiValue = Math.round(69 + 12 * Math.log2(frequency / 440));
  const clampedMidi = Math.min(Math.max(midiValue, MIDI_A0), MIDI_C8);
  const noteName = NOTE_NAMES[((clampedMidi % 12) + 12) % 12];
  const octave = Math.floor(clampedMidi / 12) - 1;
  return `${noteName}${octave}`;
}

export function getToleranceHzByNote(freqNote: number, toneFractionTolerance: number = 1): number {
  // toneFractionTolerance = 1 → 1 tone
  // toneFractionTolerance = 2 → 1/2 tone
  // toneFractionTolerance = 4 → 1/4 tone

  const semitoneFraction = 2 / toneFractionTolerance;
  const ratio = Math.pow(2, semitoneFraction / 12);

  const deltaHz = freqNote * (ratio - 1);

  return deltaHz;
}

export type { NotationMode };
