export type NoteDuration = "whole" | "half" | "quarter" | "eighth" | "sixteenth";

export interface NoteModel {
  id: string;
  duration: NoteDuration;
  midi: number; // pitch
  beat: number; // start time (in beats)
  x?: number;
  y?: number;
  staffSlot?: number;
}
