'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

type HomePageClientProps = {
  showDevLinks: boolean;
};

export default function HomePageClient({
  showDevLinks,
}: HomePageClientProps): JSX.Element {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    const isTeacher = session?.user?.isTeacher ?? false;
    router.replace(isTeacher ? '/compositore' : '/esercizi');
  }, [router, session?.user?.isTeacher, status]);

  const devLinks = showDevLinks ? (
    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>
      {' '}
      Pagine dev:{' '}
      <a href="/base" style={{ textDecoration: 'underline' }}>
        /base
      </a>{' '}
      <a href="/admin" style={{ textDecoration: 'underline' }}>
        /admin
      </a>
    </span>
  ) : null;

  if (status === 'loading') {
    return (
      <main>
        <div className="page-header">
          <h1>
            Cantami
            {devLinks}
          </h1>
        </div>
        <p>Caricamento...</p>
      </main>
    );
  }

  if (status === 'authenticated') {
    return (
      <main>
        <div className="page-header">
          <h1>
            Cantami
            {devLinks}
          </h1>
        </div>
        <p>Reindirizzamento...</p>
      </main>
    );
  }

  return (
    <main>
      <section className="landing-hero">
        <div className="landing-hero__text">
          <h1 className="landing-title">
            🎤 La tua palestra di canto, semplice e guidata.
            {devLinks}
          </h1>
          <p className="landing-subtitle">
            Allenati ogni giorno con un metodo chiaro, costruito insieme al tuo
            maestro. Tutto in un&apos;unica pagina, pronto per la tua voce.
          </p>
        </div>
        <div className="landing-hero__badge">
          <div className="landing-badge-card">
            <p className="landing-badge-title"> ⭐ Ascolta. Vedi. Migliora. </p>
            <p className="landing-badge-text">
              Microfono attivo, feedback immediato e progressi che si vedono
              nota dopo nota.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-points">
        <article className="landing-card">
          <p className="landing-card__step">1</p>
          <h2 className="landing-card__title"> 🎶 Esercizi su misura</h2>
          <p className="landing-card__text">
            Ogni lezione si trasforma in un percorso personalizzato: melodie,
            range e ripetizioni pensati dal tuo maestro, così sai sempre cosa
            cantare e perché.
          </p>
        </article>
        <article className="landing-card">
          <p className="landing-card__step">2</p>
          <h2 className="landing-card__title"> 🎤 Intonazione in tempo reale</h2>
          <p className="landing-card__text">
            Con auricolari o cuffie vedi subito quanto la tua voce è vicina alla
            nota giusta. Correggi l&apos;intonazione mentre canti e senti il
            miglioramento in pochi minuti.
          </p>
        </article>
      </section>
    </main>
  );
}
