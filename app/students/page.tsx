'use client';

import { useSession } from 'next-auth/react';
import { LoginButtons } from '../components/LoginButtons';
import { UserTabs } from '../components/UserTabs';
import { useUserRole } from '../../lib/hooks/useUserRole';

export default function StudentsPage(): JSX.Element {
  const { status } = useSession();
  const { role } = useUserRole('teacher');

  if (status === 'loading') {
    return (
      <main>
        <div className="page-header">
          <h1>Students</h1>
        </div>
        <p>Caricamento...</p>
      </main>
    );
  }

  if (status !== 'authenticated') {
    return (
      <main>
        <div className="page-header">
          <h1>Students</h1>
          <LoginButtons />
        </div>
        <p>Accedi come insegnante per gestire gli studenti.</p>
      </main>
    );
  }

  const isTeacher = role === 'teacher';

  return (
    <main>
      <div className="page-header">
        <h1>Students</h1>
        <LoginButtons />
      </div>

      <UserTabs />

      <fieldset>
        <legend>Gestione studenti</legend>
        {isTeacher ? (
          <p>Panoramica studenti e assegnazioni arriveranno qui (prossimamente).</p>
        ) : (
          <p>Passa al ruolo &quot;Insegnante&quot; dalla pagina Profile per vedere gli studenti.</p>
        )}
      </fieldset>
    </main>
  );
}
