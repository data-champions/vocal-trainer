'use client';

import { useSession } from 'next-auth/react';

export default function TeacherExercisesPage(): JSX.Element {
  const { data: session, status } = useSession();
  const isTeacher = session?.user?.isTeacher ?? false;

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
        <p>Accedi per vedere gli esercizi assegnati.</p>
      </main>
    );
  }

  return (
    <main>
      <div className="page-header">
        <h1>I miei esercizi</h1>
      </div>

      <fieldset>
        <legend>Esercizi assegnati</legend>
        {!isTeacher ? (
          <p>
            Qui appariranno gli esercizi assegnati dal tuo insegnante
            (prossimamente).
          </p>
        ) : (
          <p>Questa sezione è riservata agli studenti.</p>
        )}
      </fieldset>
    </main>
  );
}
