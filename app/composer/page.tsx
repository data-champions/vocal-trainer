'use client';

import { useSession } from 'next-auth/react';
import { LoginButtons } from '../components/LoginButtons';
import { UserTabs } from '../components/UserTabs';
import { useUserRole } from '../../lib/hooks/useUserRole';

export default function ComposerPage(): JSX.Element {
  const { status } = useSession();
  const { role } = useUserRole('teacher');

  if (status === 'loading') {
    return (
      <main>
        <div className="page-header">
          <h1>Composer</h1>
        </div>
        <p>Caricamento...</p>
      </main>
    );
  }

  if (status !== 'authenticated') {
    return (
      <main>
        <div className="page-header">
          <h1>Composer</h1>
          <LoginButtons />
        </div>
        <p>Accedi come insegnante per creare o assegnare esercizi.</p>
      </main>
    );
  }

  const isTeacher = role === 'teacher';

  return (
    <main>
      <div className="page-header">
        <h1>Composer</h1>
        <LoginButtons />
      </div>

      <UserTabs />

      <fieldset>
        <legend>Area insegnanti</legend>
        {isTeacher ? (
          <p>Qui potrai creare esercizi personalizzati per i tuoi studenti (prossimamente).</p>
        ) : (
          <p>Seleziona il ruolo &quot;Insegnante&quot; nella pagina Profile per accedere al composer.</p>
        )}
      </fieldset>
    </main>
  );
}
