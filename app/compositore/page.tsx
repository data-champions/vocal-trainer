'use client';

import { useSession } from 'next-auth/react';
import ComposerApp from './components/ComposerApp';

export default function CompositorePage(): JSX.Element {
  const { data: session, status } = useSession();
  const isTeacher = session?.user?.isTeacher ?? false;

  const header = (
    <div className="page-header">
      <h1>Crea esercizio</h1>
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
          <p>Questa sezione è riservata agli insegnanti.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="composer-shell">
      <div className="composer-meta">
        {header}
      </div>
      <ComposerApp />
    </main>
  );
}
