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

export type PatternMetadata = {
  tempo?: number;
  timeSignature?: string;
  clef?: 'treble' | 'bass';
  key?: string;
};

export type PatternNote = {
  pitch?: string;
  duration?: string;
  start?: number;
};

export type PatternScore = {
  name?: string;
  metadata?: PatternMetadata;
  notes?: PatternNote[];
};

export type Pattern = {
  id: string;
  name: string;
  score: PatternScore | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AssignedExercise = {
  id: string;
  patternId: string;
  patternName: string;
  score: PatternScore | null;
  message: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  createdAt: string | null;
  updatedAt: string | null;
};
