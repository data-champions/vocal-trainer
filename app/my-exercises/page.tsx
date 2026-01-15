'use client';

import '../compositore/composer-base.css';
import { useSession } from 'next-auth/react';
import ScoreViewer from '../compositore/components/ScoreViewer';

const DEMO_EXERCISE_SCORE = {
  name: 'Esercizio demo',
  metadata: {
    tempo: 120,
    timeSignature: '4/4',
    clef: 'treble',
    key: 'C'
  },
  notes: [
    { pitch: 'c/4', duration: 'q', start: 0 },
    { pitch: 'd/4', duration: 'q', start: 1 },
    { pitch: 'e/4', duration: 'q', start: 2 },
    { pitch: 'f/4', duration: 'q', start: 3 },
    { pitch: 'g/4', duration: 'h', start: 4 },
    { pitch: 'e/4', duration: 'h', start: 6 }
  ]
};

const ASSIGNED_EXERCISES = [
  {
    id: 'demo-1',
    title: 'Esercizio demo',
    scoreJson: JSON.stringify(DEMO_EXERCISE_SCORE)
  }
];

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
          ASSIGNED_EXERCISES.length > 0 ? (
            <div>
              {ASSIGNED_EXERCISES.map((exercise) => (
                <div key={exercise.id}>
                  <h2>{exercise.title}</h2>
                  <ScoreViewer score={exercise.scoreJson} />
                </div>
              ))}
            </div>
          ) : (
            <p>
              Qui appariranno gli esercizi assegnati dal tuo insegnante
              (prossimamente).
            </p>
          )
        ) : (
          <p>Questa sezione è riservata agli studenti.</p>
        )}
      </fieldset>
    </main>
  );
}
