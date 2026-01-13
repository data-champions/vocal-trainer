'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
// import { UserTabs } from '../components/UserTabs';
import {
  DEFAULT_NOTATION_MODE,
  DEFAULT_VOCAL_RANGE,
  type VocalRangeKey,
} from '../../lib/constants';
import { RangeSelector } from '../components/RangeSelector';

export default function ProfilePage(): JSX.Element {
  const { data: session, status } = useSession();
  const isTeacher = session?.user?.isTeacher ?? false;
  const [vocalRange, setVocalRange] =
    useState<VocalRangeKey>(DEFAULT_VOCAL_RANGE);
  const [rangeStatus, setRangeStatus] = useState<
    'idle' | 'loading' | 'saving' | 'saved' | 'error'
  >('idle');
  const [rangeError, setRangeError] = useState('');

  const displayName = useMemo(() => {
    return session?.user?.name || session?.user?.email || 'Account';
  }, [session?.user?.email, session?.user?.name]);

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    let isActive = true;
    setRangeStatus('loading');
    fetch('/api/users/vocal-range')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Load failed');
        }
        const data = (await response.json().catch(() => ({}))) as {
          vocalRange?: VocalRangeKey;
        };
        if (isActive && data.vocalRange) {
          setVocalRange(data.vocalRange);
        }
        if (isActive) {
          setRangeStatus('idle');
        }
      })
      .catch(() => {
        if (!isActive) {
          return;
        }
        setRangeStatus('error');
        setRangeError('Impossibile caricare l\'estensione vocale.');
      });
    return () => {
      isActive = false;
    };
  }, [status]);

  const handleVocalRangeChange = useCallback(
    async (nextRange: VocalRangeKey) => {
      setVocalRange(nextRange);
      if (status !== 'authenticated') {
        return;
      }
      setRangeStatus('saving');
      setRangeError('');
      const response = await fetch('/api/users/vocal-range', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vocalRange: nextRange }),
      });
      if (!response.ok) {
        setRangeStatus('error');
        setRangeError('Impossibile salvare l\'estensione vocale.');
        return;
      }
      setRangeStatus('saved');
      window.setTimeout(() => setRangeStatus('idle'), 1500);
    },
    [status]
  );

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
        </div>
        <p>
          Accedi per scegliere se usare l&apos;app come studente o insegnante.
        </p>
      </main>
    );
  }

  return (
    <main>
      <div className="page-header">
        <h1>Profilo</h1>
      </div>

      {/* <UserTabs /> */}

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
            {/* <div>
              <p className="profile-label">Provider</p>
              <p className="profile-value">{session.user?.provider ?? '—'}</p>
            </div> */}
            <div>
              <p className="profile-label">Ruolo</p>
              <p className="profile-value">
                {isTeacher ? 'Insegnante' : 'Studente'}
              </p>
            </div>
          </div>
          {isTeacher ? null : (
            <div className="profile-actions" aria-label="Azioni studente">
              <Link className="profile-action-link" href="/my-exercises">
                I miei esercizi
              </Link>
            </div>
          )}
        </fieldset>
        <fieldset>
          <legend>Preferenze</legend>
          <RangeSelector
            vocalRange={vocalRange}
            onChange={handleVocalRangeChange}
            notationMode={DEFAULT_NOTATION_MODE}
          />
          {rangeStatus === 'saving' ? <p>Salvataggio...</p> : null}
          {rangeStatus === 'saved' ? <p>Estensione vocale salvata.</p> : null}
          {rangeStatus === 'error' ? <p>{rangeError}</p> : null}
        </fieldset>
      </div>
    </main>
  );
}
