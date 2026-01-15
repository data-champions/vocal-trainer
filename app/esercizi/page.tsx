'use client';

import '../compositore/composer-base.css';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import ExerciseReplay, { type ReplayItem } from './ExerciseReplay';
import type { AssignedExercise, Pattern } from '../../lib/types';

export default function ExercisesPage(): JSX.Element {
  const { data: session, status } = useSession();
  const isTeacher = session?.user?.isTeacher ?? false;
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [exercises, setExercises] = useState<AssignedExercise[]>([]);
  const [selectedItemKey, setSelectedItemKey] = useState<string>('');
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'loaded'>(
    'idle'
  );

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    let isActive = true;
    const loadData = async () => {
      setLoadState('loading');
      try {
        const [patternResponse, exerciseResponse] = await Promise.all([
          isTeacher ? fetch('/api/patterns') : Promise.resolve(null),
          fetch('/api/exercises'),
        ]);
        if (!isActive) {
          return;
        }
        if (patternResponse?.ok) {
          const data = (await patternResponse.json().catch(() => ({}))) as {
            patterns?: Pattern[];
          };
          setPatterns(Array.isArray(data.patterns) ? data.patterns : []);
        } else {
          setPatterns([]);
        }
        if (exerciseResponse.ok) {
          const data = (await exerciseResponse.json().catch(() => ({}))) as {
            exercises?: AssignedExercise[];
          };
          setExercises(Array.isArray(data.exercises) ? data.exercises : []);
        } else {
          setExercises([]);
        }
      } catch {
        if (isActive) {
          setPatterns([]);
          setExercises([]);
        }
      } finally {
        if (isActive) {
          setLoadState('loaded');
        }
      }
    };

    void loadData();
    return () => {
      isActive = false;
    };
  }, [isTeacher, status]);

  const patternItems = useMemo<ReplayItem[]>(
    () =>
      patterns.map((pattern) => ({
        key: `pattern:${pattern.id}`,
        title: pattern.name || 'Pattern',
        score: pattern.score ?? null,
      })),
    [patterns]
  );

  const exerciseItems = useMemo<ReplayItem[]>(
    () =>
      exercises.map((exercise) => {
        const message =
          typeof exercise.message === 'string' ? exercise.message.trim() : '';
        const emailLabel =
          exercise.studentEmail && exercise.studentEmail.includes('@')
            ? ` (${exercise.studentEmail})`
            : '';
        return {
          key: `exercise:${exercise.id}`,
          title: exercise.patternName || 'Pattern',
          score: exercise.score ?? null,
          message: message || undefined,
          meta: isTeacher
            ? `Studente: ${exercise.studentName}${emailLabel}`
            : undefined,
        };
      }),
    [exercises, isTeacher]
  );

  const patternOptions = useMemo(
    () => patternItems.map((item) => ({ key: item.key, label: item.title })),
    [patternItems]
  );

  const exerciseOptions = useMemo(
    () =>
      exercises.map((exercise) => {
        const baseLabel = exercise.patternName || 'Pattern';
        return {
          key: `exercise:${exercise.id}`,
          label: isTeacher
            ? `${baseLabel} - ${exercise.studentName}`
            : baseLabel,
        };
      }),
    [exercises, isTeacher]
  );

  const availableItems = useMemo(
    () =>
      isTeacher
        ? [...patternItems, ...exerciseItems]
        : [...exerciseItems],
    [exerciseItems, isTeacher, patternItems]
  );

  useEffect(() => {
    if (availableItems.length === 0) {
      setSelectedItemKey('');
      return;
    }
    setSelectedItemKey((prev) => {
      if (prev && availableItems.some((item) => item.key === prev)) {
        return prev;
      }
      return availableItems[0]?.key ?? '';
    });
  }, [availableItems]);

  const selectedItem =
    availableItems.find((item) => item.key === selectedItemKey) ?? null;

  if (status === 'loading') {
    return (
      <main>
        <div className="page-header">
          <h1>Esercizi</h1>
        </div>
        <p>Caricamento...</p>
      </main>
    );
  }

  if (status !== 'authenticated') {
    return (
      <main>
        <div className="page-header">
          <h1>Esercizi</h1>
        </div>
        <p>Accedi per vedere gli esercizi.</p>
      </main>
    );
  }

  return (
    <main>
      <div className="page-header">
        <h1>{isTeacher ? 'Esercizi' : 'I miei esercizi'}</h1>
      </div>

      <div className="card-grid">
        <fieldset>
          <legend>Selezione</legend>
          {loadState !== 'loaded' ? (
            <p>Caricamento esercizi...</p>
          ) : availableItems.length > 0 ? (
            <label className="stacked-label" htmlFor="exercise-select">
              {isTeacher ? 'Pattern o esercizio' : 'Esercizio'}
              <select
                id="exercise-select"
                value={selectedItemKey}
                onChange={(event) => setSelectedItemKey(event.target.value)}
              >
                {isTeacher && patternOptions.length > 0 ? (
                  <optgroup label="Pattern">
                    {patternOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {exerciseOptions.length > 0 ? (
                  <optgroup label="Esercizi">
                    {exerciseOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>
          ) : isTeacher ? (
            <p>
              Nessun pattern o esercizio disponibile. Vai al{' '}
              <Link href="/compositore">compositore</Link> per creare un pattern
              o a <Link href="/students">studenti</Link> per assegnarne uno.
            </p>
          ) : (
            <p>Nessun esercizio assegnato.</p>
          )}
        </fieldset>
      </div>

      {selectedItem ? <ExerciseReplay item={selectedItem} /> : null}
    </main>
  );
}
