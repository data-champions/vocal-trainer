export type Feedback = {
  type: 'success' | 'info' | 'warning';
  message: string;
} | null;

export type PitchSample = {
  pitch: number | null;
  clarity: number;
};

export type PlaybackSegment = {
  note: string;
  start: number;
  end: number;
};

export type VocalRange = {
  label: string;
  min: string;
  max: string;
};
