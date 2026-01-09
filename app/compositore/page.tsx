'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';

export default function CompositorePage(): JSX.Element {
  const { data: session, status } = useSession();
  const isTeacher = session?.user?.isTeacher ?? false;

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
        </div>
        <p>Accedi come insegnante per creare esercizi.</p>
      </main>
    );
  }

  return (
    <main>
      <div className="page-header">
        <h1>Compositore</h1>
      </div>

      <div className="page-actions">
        <Link className="page-action-link" href="/esercizi">
          Vai agli esercizi
        </Link>
        <Link className="page-action-link" href="/profile">
          Torna al profilo
        </Link>
      </div>

      <fieldset>
        <legend>Strumento esercizi</legend>
        {isTeacher ? (
          <p>Qui potrai creare esercizi personalizzati (prossimamente).</p>
        ) : (
          <p>Questa sezione è riservata agli insegnanti.</p>
        )}
      </fieldset>
    </main>
  );
}
