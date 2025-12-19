'use client';

import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { LoginButtons } from '../components/LoginButtons';
import { UserTabs } from '../components/UserTabs';
import { useUserRole } from '../../lib/hooks/useUserRole';
import { getAllowedRoles, getDefaultRoleForEmail } from '../../lib/userRole';

export default function ProfilePage(): JSX.Element {
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? null;
  const allowedRoles = useMemo(() => getAllowedRoles(email), [email]);
  const defaultRole = useMemo(() => getDefaultRoleForEmail(email), [email]);
  const { role } = useUserRole(defaultRole, allowedRoles);

  const displayName = useMemo(() => {
    return session?.user?.name || session?.user?.email || 'Account';
  }, [session?.user?.email, session?.user?.name]);

  if (status === 'loading') {
    return (
      <main>
        <div className="page-header">
          <h1>Profilo</h1>
        </div>
        <p>Caricamento...</p>
      </main>
    );
  }

  if (status !== 'authenticated') {
    return (
      <main>
        <div className="page-header">
          <h1>Profilo</h1>
          <LoginButtons />
        </div>
        <p>Accedi per scegliere se usare l&apos;app come studente o insegnante.</p>
      </main>
    );
  }

  return (
    <main>
      <div className="page-header">
        <h1>Profilo</h1>
        <LoginButtons />
      </div>

      <UserTabs />

      <div className="card-grid">
        <fieldset>
          <legend>Account</legend>
          <div className="profile-summary">
            <div>
              <p className="profile-label">Nome</p>
              <p className="profile-value">{displayName}</p>
            </div>
            <div>
              <p className="profile-label">Email</p>
              <p className="profile-value">{session.user?.email ?? '—'}</p>
            </div>
            <div>
              <p className="profile-label">Provider</p>
              <p className="profile-value">{session.user?.provider ?? '—'}</p>
            </div>
            <div>
              <p className="profile-label">Ruolo</p>
              <p className="profile-value">
                {role === 'teacher' ? 'Insegnante' : 'Studente'}
              </p>
            </div>
          </div>
        </fieldset>
      </div>
    </main>
  );
}
