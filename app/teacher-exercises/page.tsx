'use client';

import { useSession } from 'next-auth/react';
import { LoginButtons } from '../components/LoginButtons';
import { UserTabs } from '../components/UserTabs';
import { useUserRole } from '../../lib/hooks/useUserRole';

export default function TeacherExercisesPage(): JSX.Element {
  const { status } = useSession();
  const { role } = useUserRole();

  if (status === 'loading') {
    return (
      <main>
        <div className="page-header">
          <h1>Teacher exercises</h1>
        </div>
        <p>Caricamento...</p>
      </main>
    );
  }

  if (status !== 'authenticated') {
    return (
      <main>
        <div className="page-header">
          <h1>Teacher exercises</h1>
          <LoginButtons />
        </div>
        <p>Accedi per vedere gli esercizi assegnati dal tuo insegnante.</p>
      </main>
    );
  }

  const isStudent = role === 'student';

  return (
    <main>
      <div className="page-header">
        <h1>Teacher exercises</h1>
        <LoginButtons />
      </div>

      <UserTabs />

      <fieldset>
        <legend>Esercizi assegnati</legend>
        {isStudent ? (
          <p>Qui appariranno gli esercizi condivisi dal tuo insegnante (prossimamente).</p>
        ) : (
          <p>Passa al ruolo &quot;Studente&quot; nella pagina Profile per vedere gli esercizi assegnati.</p>
        )}
      </fieldset>
    </main>
  );
}
