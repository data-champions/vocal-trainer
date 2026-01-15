export type ExerciseMetadata = {
  tempo?: number;
  timeSignature?: string;
  clef?: 'treble' | 'bass';
  key?: string;
};

export type ExerciseNote = {
  pitch?: string;
  duration?: string;
  start?: number;
};

export type ExerciseScore = {
  name?: string;
  metadata?: ExerciseMetadata;
  notes?: ExerciseNote[];
};

export type SavedExercise = {
  id: string;
  title: string;
  score: ExerciseScore;
  createdAt: string;
};

const STORAGE_KEY = 'vocal-trainer:teacher-exercises';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const buildId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `exercise-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const sanitizeExercise = (value: unknown): SavedExercise | null => {
  if (!isRecord(value)) {
    return null;
  }
  const title = typeof value.title === 'string' ? value.title : '';
  const score = isRecord(value.score) ? (value.score as ExerciseScore) : null;
  if (!title || !score) {
    return null;
  }
  const id = typeof value.id === 'string' ? value.id : buildId();
  const createdAt =
    typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString();

  return { id, title, score, createdAt };
};

export const loadSavedExercises = (): SavedExercise[] => {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => sanitizeExercise(item))
      .filter((item): item is SavedExercise => Boolean(item));
  } catch {
    return [];
  }
};

export const saveExercise = (
  title: string,
  score: ExerciseScore
): SavedExercise[] => {
  if (typeof window === 'undefined') {
    return [];
  }
  const exercise: SavedExercise = {
    id: buildId(),
    title,
    score: { ...score, name: score.name ?? title },
    createdAt: new Date().toISOString(),
  };
  const current = loadSavedExercises();
  const next = [exercise, ...current];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
};
