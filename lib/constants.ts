import type { VocalRange } from './types';

export const PIANO_SAMPLE_BASE_URL = 'https://tonejs.github.io/audio/salamander/';

export const PIANO_SAMPLE_MAP = {
  A0: 'A0.mp3',
  C1: 'C1.mp3',
  'D#1': 'Ds1.mp3',
  'F#1': 'Fs1.mp3',
  A1: 'A1.mp3',
  C2: 'C2.mp3',
  'D#2': 'Ds2.mp3',
  'F#2': 'Fs2.mp3',
  A2: 'A2.mp3',
  C3: 'C3.mp3',
  'D#3': 'Ds3.mp3',
  'F#3': 'Fs3.mp3',
  A3: 'A3.mp3',
  C4: 'C4.mp3',
  'D#4': 'Ds4.mp3',
  'F#4': 'Fs4.mp3',
  A4: 'A4.mp3',
  C5: 'C5.mp3',
  'D#5': 'Ds5.mp3',
  'F#5': 'Fs5.mp3',
  A5: 'A5.mp3',
  C6: 'C6.mp3',
  'D#6': 'Ds6.mp3',
  'F#6': 'Fs6.mp3',
  A6: 'A6.mp3',
  C7: 'C7.mp3',
  'D#7': 'Ds7.mp3',
  'F#7': 'Fs7.mp3',
  A7: 'A7.mp3',
  C8: 'C8.mp3',
} as const;

export const GAP_SECONDS = 0.05;
export const PIANO_RELEASE_SECONDS = 2.5;
export const PITCH_LOG_INTERVAL_MS = 10;
export const PITCH_CHART_HEIGHT = 180;

export const NOTATION_MODES = ['italian', 'english'] as const;
export type NotationMode = (typeof NOTATION_MODES)[number];
export const DEFAULT_NOTATION_MODE: NotationMode = 'italian';

export type VocalRangeKey =
  | 'soprano'
  | 'mezzo-soprano'
  | 'contralto'
  | 'tenor'
  | 'baritone'
  | 'bass';

export const VOCAL_RANGES: Record<
  VocalRangeKey,
  VocalRange
> = {
  soprano: { label: 'Soprano', min: 'C4', max: 'A5' },
  'mezzo-soprano': { label: 'Mezzo-soprano', min: 'A3', max: 'F#5' },
  contralto: { label: 'Contralto', min: 'F3', max: 'D5' },
  tenor: { label: 'Tenore', min: 'C3', max: 'A4' },
  baritone: { label: 'Baritono', min: 'A2', max: 'F4' },
  bass: { label: 'Basso', min: 'F2', max: 'E4' },
};
