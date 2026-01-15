'use client';

import '../compositore/composer-base.css';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import ExerciseReplay from './ExerciseReplay';
import { loadSavedExercises, type SavedExercise } from '../../lib/exercises';

export default function TeacherExercisesPage(): JSX.Element {
  const { data: session, status } = useSession();
  const isTeacher = session?.user?.isTeacher ?? false;
  const [exercises, setExercises] = useState<SavedExercise[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(
    null
  );
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadExercises = () => {
      const nextExercises = loadSavedExercises();
      setExercises(nextExercises);
      setIsLoaded(true);
      setSelectedExerciseId((prev) => {
        if (prev && nextExercises.some((exercise) => exercise.id === prev)) {
          return prev;
        }
        return nextExercises[0]?.id ?? null;
      });
    };
    loadExercises();
    window.addEventListener('storage', loadExercises);
    return () => {
      window.removeEventListener('storage', loadExercises);
    };
  }, []);

  const selectedExercise =
    exercises.find((exercise) => exercise.id === selectedExerciseId) ?? null;

  if (status === 'loading') {
    return (
      <main>
        <div className="page-header">
          <h1>I miei esercizi</h1>
        </div>
        <p>Caricamento...</p>
      </main>
    );
  }

  if (status !== 'authenticated') {
    return (
      <main>
        <div className="page-header">
          <h1>I miei esercizi</h1>
        </div>
        <p>Accedi come insegnante per vedere e creare esercizi.</p>
      </main>
    );
  }

  return (
    <main>
      <div className="page-header">
        <h1>I miei esercizi</h1>
      </div>

      <fieldset>
        <legend>Lista esercizi</legend>
        {isTeacher ? (
          exercises.length > 0 ? (
            <label className="stacked-label" htmlFor="exercise-select">
              Esercizio
              <select
                id="exercise-select"
                value={selectedExerciseId ?? ''}
                onChange={(event) => setSelectedExerciseId(event.target.value)}
              >
                {exercises.map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {exercise.title}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p>
              {isLoaded
                ? 'Nessun esercizio salvato. Vai al '
                : 'Caricamento esercizi...'}
              {isLoaded ? (
                <>
                  <Link href="/compositore">compositore</Link> per crearne uno.
                </>
              ) : null}
            </p>
          )
        ) : (
          <p>Questa sezione è riservata agli insegnanti.</p>
        )}
      </fieldset>

      {isTeacher && selectedExercise ? (
        <ExerciseReplay exercise={selectedExercise} />
      ) : null}
    </main>
  );
}
