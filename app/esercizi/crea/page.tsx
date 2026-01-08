'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import ComposerApp from './components/ComposerApp';
import { LoginButtons } from '../../components/LoginButtons';

export default function CreateExercisePage(): JSX.Element {
  const { data: session, status } = useSession();
  const isTeacher = session?.user?.isTeacher ?? false;

  const header = (
    <div className="page-header">
      <h1>Crea esercizio</h1>
      <LoginButtons />
    </div>
  );

  const actions = (
    <div className="page-actions">
      <Link className="page-action-link" href="/esercizi">
        Torna agli esercizi
      </Link>
    </div>
  );

  if (status === 'loading') {
    return (
      <main className="composer-shell">
        <div className="composer-meta">
          {header}
          <p>Caricamento...</p>
        </div>
      </main>
    );
  }

  if (status !== 'authenticated') {
    return (
      <main className="composer-shell">
        <div className="composer-meta">
          {header}
          {actions}
          <p>Accedi come insegnante per creare esercizi.</p>
        </div>
      </main>
    );
  }

  if (!isTeacher) {
    return (
      <main className="composer-shell">
        <div className="composer-meta">
          {header}
          {actions}
          <p>Questa sezione è riservata agli insegnanti.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="composer-shell">
      <div className="composer-meta">
        {header}
        {actions}
      </div>
      <ComposerApp />
    </main>
  );
}
