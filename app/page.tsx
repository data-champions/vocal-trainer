'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function HomePage(): JSX.Element {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    const isTeacher = session?.user?.isTeacher ?? false;
    router.replace(isTeacher ? '/compositore' : '/esercizi');
  }, [router, session?.user?.isTeacher, status]);

  if (status === 'loading') {
    return (
      <main>
        <div className="page-header">
          <h1>Cantami</h1>
        </div>
        <p>Caricamento...</p>
      </main>
    );
  }

  if (status === 'authenticated') {
    return (
      <main>
        <div className="page-header">
          <h1>Cantami</h1>
        </div>
        <p>Reindirizzamento...</p>
      </main>
    );
  }

  return (
    <main>
      <div className="page-header">
        <h1>Cantami</h1>
      </div>
      <ol>
        <li>
          Un'app per cantare meglio, con gli esercizi creati dal tuo maestro di
          musica.
        </li>
        <li>
          Con auricolari o cuffie vedi in tempo reale la distanza dalla nota e
          migliori subito l'intonazione.
        </li>
      </ol>
    </main>
  );
}
