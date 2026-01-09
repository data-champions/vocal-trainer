'use client';

import { useSession } from 'next-auth/react';
import ComposerApp from './components/ComposerApp';

export default function CompositorePage(): JSX.Element {
  const { data: session, status } = useSession();
  const isTeacher = session?.user?.isTeacher ?? false;

  const renderFallback = (message: string) => (
    <main>
      <div className="page">
        <div className="composer-header">
          <h1>Crea esercizio</h1>
        </div>
        <p>{message}</p>
      </div>
    </main>
  );

  if (status === 'loading') {
    return renderFallback('Caricamento...');
  }

  if (status !== 'authenticated') {
    return renderFallback('Accedi come insegnante per creare esercizi.');
  }

  if (!isTeacher) {
    return renderFallback('Questa sezione è riservata agli insegnanti.');
  }

  return (
    <main>
      <ComposerApp />
    </main>
  );
}
