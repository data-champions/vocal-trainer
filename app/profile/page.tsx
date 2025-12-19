'use client';

import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { LoginButtons } from '../components/LoginButtons';
import { UserTabs } from '../components/UserTabs';
import { useUserRole } from '../../lib/hooks/useUserRole';

export default function ProfilePage(): JSX.Element {
  const { data: session, status } = useSession();
  const { role, setRole } = useUserRole();

  const displayName = useMemo(() => {
    return session?.user?.name || session?.user?.email || 'Account';
  }, [session?.user?.email, session?.user?.name]);

  if (status === 'loading') {
    return (
      <main>
        <div className="page-header">
          <h1>Profile</h1>
        </div>
        <p>Caricamento...</p>
      </main>
    );
  }

  if (status !== 'authenticated') {
    return (
      <main>
        <div className="page-header">
          <h1>Profile</h1>
          <LoginButtons />
        </div>
        <p>Accedi per scegliere se usare l&apos;app come studente o insegnante.</p>
      </main>
    );
  }

  return (
    <main>
      <div className="page-header">
        <h1>Profile</h1>
        <LoginButtons />
      </div>

      <UserTabs />

      <div className="card-grid">
        <fieldset>
          <legend>Ruolo</legend>
          <div className="role-grid" role="radiogroup" aria-label="Seleziona il ruolo">
            <label className={`role-card${role === 'student' ? ' is-active' : ''}`}>
              <input
                type="radio"
                name="user-role"
                value="student"
                checked={role === 'student'}
                onChange={() => setRole('student')}
              />
              <div className="role-card__content">
                <p className="role-label">Studente</p>
                <p className="role-description">
                  Allenati sugli esercizi base o svolgi gli esercizi assegnati dal tuo insegnante.
                </p>
                <p className="role-tabs">Tab disponibili: Profile, Teacher exercises, Basic exercises</p>
              </div>
            </label>

            <label className={`role-card${role === 'teacher' ? ' is-active' : ''}`}>
              <input
                type="radio"
                name="user-role"
                value="teacher"
                checked={role === 'teacher'}
                onChange={() => setRole('teacher')}
              />
              <div className="role-card__content">
                <p className="role-label">Insegnante</p>
                <p className="role-description">
                  Componi esercizi personalizzati e gestisci gli studenti, oltre alla sezione degli esercizi base.
                </p>
                <p className="role-tabs">Tab disponibili: Profile, Composer, Students, Basic exercises</p>
              </div>
            </label>
          </div>
        </fieldset>

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
          </div>
        </fieldset>
      </div>
    </main>
  );
}
