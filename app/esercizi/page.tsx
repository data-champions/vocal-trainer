'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';

export default function TeacherExercisesPage(): JSX.Element {
  const { data: session, status } = useSession();
  const isTeacher = session?.user?.isTeacher ?? false;
  const exercises: Array<{ id: string; title: string }> = [];

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
            <ul className="exercise-list">
              {exercises.map((exercise) => (
                <li key={exercise.id} className="exercise-list__item">
                  {exercise.title}
                </li>
              ))}
            </ul>
          ) : (
            <p>Questa sezione dimostra come gli studenti vedono gli esercizi dell'insegnante.</p>
          )
        ) : (
          <p>Questa sezione è riservata agli insegnanti.</p>
        )}
      </fieldset>
    </main>
  );
}
