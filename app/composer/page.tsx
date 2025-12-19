'use client';

import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { LoginButtons } from '../components/LoginButtons';
import { UserTabs } from '../components/UserTabs';
import { useUserRole } from '../../lib/hooks/useUserRole';
import { getAllowedRoles, getDefaultRoleForEmail } from '../../lib/userRole';

export default function ComposerPage(): JSX.Element {
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? null;
  const allowedRoles = useMemo(() => getAllowedRoles(email), [email]);
  const defaultRole = useMemo(() => getDefaultRoleForEmail(email), [email]);
  const { role } = useUserRole(defaultRole, allowedRoles);
  const isTeacherAllowed = allowedRoles.includes('teacher');
  const isTeacher = role === 'teacher';

  if (status === 'loading') {
    return (
      <main>
        <div className="page-header">
          <h1>Compositore</h1>
        </div>
        <p>Caricamento...</p>
      </main>
    );
  }

  if (status !== 'authenticated') {
    return (
      <main>
        <div className="page-header">
          <h1>Compositore</h1>
          <LoginButtons />
        </div>
        <p>Accedi come insegnante per creare o assegnare esercizi.</p>
      </main>
    );
  }

  return (
    <main>
      <div className="page-header">
        <h1>Compositore</h1>
        <LoginButtons />
      </div>

      <UserTabs />

      <fieldset>
        <legend>Area insegnanti</legend>
        {isTeacher ? (
          <p>Qui potrai creare esercizi personalizzati per i tuoi studenti (prossimamente).</p>
        ) : isTeacherAllowed ? (
          <p>Seleziona il ruolo &quot;Insegnante&quot; nella pagina Profilo per accedere al composer.</p>
        ) : (
          <p>Questa sezione è riservata a insegnanti autorizzati (email whitelist).</p>
        )}
      </fieldset>
    </main>
  );
}
