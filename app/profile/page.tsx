'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
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
  const [teacherNameStatus, setTeacherNameStatus] = useState<
    'idle' | 'loading' | 'saving' | 'saved' | 'error'
  >('idle');
  const [teacherNameError, setTeacherNameError] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [studentFacingName, setStudentFacingName] = useState('');
  const [studentFacingNameInitial, setStudentFacingNameInitial] = useState('');

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

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    let isActive = true;
    setTeacherNameStatus('loading');
    setTeacherNameError('');
    fetch('/api/users/teacher-display-name')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Load failed');
        }
        const data = (await response.json().catch(() => ({}))) as {
          teacherName?: string;
          studentDisplayName?: string;
        };
        if (!isActive) {
          return;
        }
        if (isTeacher) {
          const displayNameValue =
            typeof data.studentDisplayName === 'string'
              ? data.studentDisplayName
              : '';
          setStudentFacingName(displayNameValue);
          setStudentFacingNameInitial(displayNameValue);
        } else {
          const resolvedTeacherName =
            typeof data.teacherName === 'string' ? data.teacherName : '';
          setTeacherName(resolvedTeacherName);
        }
        setTeacherNameStatus('idle');
      })
      .catch(() => {
        if (!isActive) {
          return;
        }
        setTeacherNameStatus('error');
        setTeacherNameError('Impossibile caricare il nome dell\'insegnante.');
      });
    return () => {
      isActive = false;
    };
  }, [isTeacher, status]);

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

  const handleStudentFacingNameSave = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (status !== 'authenticated' || !isTeacher) {
        return;
      }
      const trimmedName = studentFacingName.trim();
      const trimmedInitial = studentFacingNameInitial.trim();
      if (trimmedName === trimmedInitial || teacherNameStatus === 'saving') {
        return;
      }
      setTeacherNameStatus('saving');
      setTeacherNameError('');
      const response = await fetch('/api/users/teacher-display-name', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentDisplayName: trimmedName }),
      });
      if (!response.ok) {
        setTeacherNameStatus('error');
        setTeacherNameError(
          'Impossibile salvare il nome per gli studenti.'
        );
        return;
      }
      setStudentFacingName(trimmedName);
      setStudentFacingNameInitial(trimmedName);
      setTeacherNameStatus('saved');
      window.setTimeout(() => setTeacherNameStatus('idle'), 1500);
    },
    [
      isTeacher,
      status,
      studentFacingName,
      studentFacingNameInitial,
      teacherNameStatus,
    ]
  );

  const isStudentFacingNameDirty =
    studentFacingName.trim() !== studentFacingNameInitial.trim();

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
            {isTeacher ? null : (
              <div>
                <p className="profile-label">Insegnante</p>
                <p className="profile-value">
                  {teacherNameStatus === 'loading'
                    ? 'Caricamento...'
                    : teacherNameStatus === 'error'
                      ? teacherNameError
                      : teacherName || 'Nessun insegnante collegato'}
                </p>
              </div>
            )}
          </div>
          {isTeacher ? (
            <form
              className="profile-form"
              onSubmit={handleStudentFacingNameSave}
            >
              <label htmlFor="student-facing-name">
                Nome (per i tuoi studenti)
                <input
                  id="student-facing-name"
                  type="text"
                  className="profile-input"
                  value={studentFacingName}
                  onChange={(event) => setStudentFacingName(event.target.value)}
                  placeholder={displayName}
                  maxLength={80}
                  disabled={
                    teacherNameStatus === 'loading' ||
                    teacherNameStatus === 'saving'
                  }
                />
              </label>
              <div className="profile-form-actions">
                <button
                  type="submit"
                  className="text-button"
                  disabled={
                    teacherNameStatus === 'loading' ||
                    teacherNameStatus === 'saving' ||
                    !isStudentFacingNameDirty
                  }
                >
                  {teacherNameStatus === 'saving'
                    ? 'Salvataggio...'
                    : 'Salva nome'}
                </button>
              </div>
              {teacherNameStatus === 'loading' ? (
                <p>Caricamento...</p>
              ) : null}
              {teacherNameStatus === 'saved' ? <p>Nome aggiornato.</p> : null}
              {teacherNameStatus === 'error' ? (
                <p>{teacherNameError}</p>
              ) : null}
            </form>
          ) : null}
          {isTeacher ? null : (
            <div className="profile-actions" aria-label="Azioni studente">
              <Link className="profile-action-link" href="/esercizi">
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
