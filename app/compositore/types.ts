export type NoteDuration = "whole" | "half" | "quarter" | "eighth" | "sixteenth";

export interface NoteModel {
  id: string;
  duration: NoteDuration;
  midi: number; // pitch
  beat: number; // start time (in beats)
  x?: number;
  y?: number;
  staffSlot?: number;
  outOfStaff?: boolean;
  ledgerLineOffsets?: number[];
}

export type Note = {
  id: string;
  pitch: string;
  startBeat: number;
  duration: number;
};

export type Score = {
  measures: number;
  beatsPerMeasure: number;
  pitches: string[];
  notes: Note[];
};
