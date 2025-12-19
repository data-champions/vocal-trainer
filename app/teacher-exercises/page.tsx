'use client';

import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { LoginButtons } from '../components/LoginButtons';
import { UserTabs } from '../components/UserTabs';
import { useUserRole } from '../../lib/hooks/useUserRole';
import { getAllowedRoles, getDefaultRoleForEmail } from '../../lib/userRole';

export default function TeacherExercisesPage(): JSX.Element {
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? null;
  const allowedRoles = useMemo(() => getAllowedRoles(email), [email]);
  const defaultRole = useMemo(() => getDefaultRoleForEmail(email), [email]);
  const { role } = useUserRole(defaultRole, allowedRoles);

  if (status === 'loading') {
    return (
      <main>
        <div className="page-header">
          <h1>Esercizi insegnante</h1>
        </div>
        <p>Caricamento...</p>
      </main>
    );
  }

  if (status !== 'authenticated') {
    return (
      <main>
        <div className="page-header">
          <h1>Esercizi insegnante</h1>
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
        <h1>Esercizi insegnante</h1>
        <LoginButtons />
      </div>

      <UserTabs />

      <fieldset>
        <legend>Esercizi assegnati</legend>
        {isStudent ? (
          <p>Qui appariranno gli esercizi condivisi dal tuo insegnante (prossimamente).</p>
        ) : (
          <p>Passa al ruolo &quot;Studente&quot; nella pagina Profilo per vedere gli esercizi assegnati.</p>
        )}
      </fieldset>
    </main>
  );
}
