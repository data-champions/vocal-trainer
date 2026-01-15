'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
// import { UserTabs } from '../components/UserTabs';
import { useUserRole } from '../../lib/hooks/useUserRole';
import { getAllowedRoles, getDefaultRoleForEmail } from '../../lib/userRole';
import type { AssignedExercise, Pattern } from '../../lib/types';

const getInviteMessage = (inviteLink: string): string =>
  `Ciao! Per usare cantami, clicca qui: ${inviteLink}`;

const getWhatsAppShareUrl = (message: string): string => {
  const encodedMessage = encodeURIComponent(message);
  if (typeof navigator === 'undefined') {
    return `https://wa.me/?text=${encodedMessage}`;
  }
  const userAgent = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const isAndroid = /Android/i.test(userAgent);
  if (isIOS) {
    return `https://api.whatsapp.com/send?text=${encodedMessage}`;
  }
  if (isAndroid) {
    return `https://wa.me/?text=${encodedMessage}`;
  }
  return `https://web.whatsapp.com/send?text=${encodedMessage}`;
};

export default function StudentsPage(): JSX.Element {
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? null;
  const allowedRoles = useMemo(() => getAllowedRoles(email), [email]);
  const defaultRole = useMemo(() => getDefaultRoleForEmail(email), [email]);
  const { role } = useUserRole(defaultRole, allowedRoles);
  const isTeacherAllowed = allowedRoles.includes('teacher');
  const isTeacher =
    typeof session?.user?.isTeacher === 'boolean'
      ? session.user.isTeacher
      : role === 'teacher';
  const [inviteLink, setInviteLink] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showCopyNotice, setShowCopyNotice] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'loading'>('idle');
  const [students, setStudents] = useState<
    Array<{ id: string; name: string; email: string }>
  >([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [exercises, setExercises] = useState<AssignedExercise[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedPatternId, setSelectedPatternId] = useState('');
  const [assignmentMessage, setAssignmentMessage] = useState('');
  const [assignmentStatus, setAssignmentStatus] = useState<'idle' | 'loading'>(
    'idle'
  );

  const loadStudents = useCallback(async () => {
    const response = await fetch('/api/students');
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as {
      students: Array<{ id: string; name: string; email: string }>;
    };
    const nextStudents = data.students ?? [];
    setStudents(nextStudents);
    setSelectedStudentId((prev) => {
      if (prev && nextStudents.some((student) => student.id === prev)) {
        return prev;
      }
      return nextStudents[0]?.id ?? '';
    });
  }, []);

  const loadPatterns = useCallback(async () => {
    const response = await fetch('/api/patterns');
    if (!response.ok) {
      return;
    }
    const data = (await response.json().catch(() => ({}))) as {
      patterns?: Pattern[];
    };
    const nextPatterns = Array.isArray(data.patterns) ? data.patterns : [];
    setPatterns(nextPatterns);
    setSelectedPatternId((prev) => {
      if (prev && nextPatterns.some((pattern) => pattern.id === prev)) {
        return prev;
      }
      return nextPatterns[0]?.id ?? '';
    });
  }, []);

  const loadExercises = useCallback(async () => {
    const response = await fetch('/api/exercises');
    if (!response.ok) {
      return;
    }
    const data = (await response.json().catch(() => ({}))) as {
      exercises?: AssignedExercise[];
    };
    setExercises(Array.isArray(data.exercises) ? data.exercises : []);
  }, []);

  const handleInvite = useCallback(async () => {
    setInviteStatus('loading');
    try {
      const response = await fetch('/api/invitations', { method: 'POST' });
      if (!response.ok) {
        return;
      }
      const data = (await response.json().catch(() => ({}))) as {
        inviteLink?: string;
      };
      if (typeof data.inviteLink === 'string' && data.inviteLink) {
        setInviteLink(data.inviteLink);
        setShowCopyNotice(false);
        setShowInviteModal(true);
      }
    } finally {
      setInviteStatus('idle');
    }
  }, []);

  const handleAssignExercise = useCallback(async () => {
    if (!selectedStudentId) {
      window.alert('Seleziona uno studente.');
      return;
    }
    if (!selectedPatternId) {
      window.alert('Seleziona un pattern.');
      return;
    }
    setAssignmentStatus('loading');
    try {
      const response = await fetch('/api/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudentId,
          patternId: selectedPatternId,
          message: assignmentMessage,
        }),
      });
      if (!response.ok) {
        window.alert('Errore nell\'assegnazione dell\'esercizio.');
        return;
      }
      setAssignmentMessage('');
      await loadExercises();
    } finally {
      setAssignmentStatus('idle');
    }
  }, [
    assignmentMessage,
    loadExercises,
    selectedPatternId,
    selectedStudentId,
  ]);

  const handleRemoveExercise = useCallback(
    async (exerciseId: string) => {
      const confirmed = window.confirm(
        'Vuoi rimuovere questo esercizio dallo studente?'
      );
      if (!confirmed) {
        return;
      }
      const response = await fetch(`/api/exercises/${exerciseId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        window.alert('Errore nella rimozione dell\'esercizio.');
        return;
      }
      await loadExercises();
    },
    [loadExercises]
  );

  const handleWhatsAppShare = useCallback(() => {
    if (!inviteLink) {
      return;
    }
    const message = getInviteMessage(inviteLink);
    void navigator.clipboard.writeText(message).catch(() => {});
    const whatsappUrl = getWhatsAppShareUrl(message);
    window.location.href = whatsappUrl;
  }, [inviteLink]);

  const handleCopyForShare = useCallback(async () => {
    if (!inviteLink) {
      return;
    }
    const message = getInviteMessage(inviteLink);
    try {
      await navigator.clipboard.writeText(message);
    } catch {
    }
    setShowCopyNotice(true);
    window.setTimeout(() => setShowCopyNotice(false), 2500);
  }, [inviteLink]);

  const handleCloseInviteModal = useCallback(() => {
    setShowInviteModal(false);
    setShowCopyNotice(false);
  }, []);

  useEffect(() => {
    if (status !== 'authenticated' || !isTeacher) {
      return;
    }
    void loadStudents();
    void loadPatterns();
    void loadExercises();
  }, [isTeacher, loadExercises, loadPatterns, loadStudents, status]);

  if (status === 'loading') {
    return (
      <main>
        <div className="page-header">
          <h1>Studenti</h1>
        </div>
        <p>Caricamento...</p>
      </main>
    );
  }

  if (status !== 'authenticated') {
    return (
      <main>
        <div className="page-header">
          <h1>Studenti</h1>
        </div>
        <p>Accedi come insegnante per gestire gli studenti.</p>
      </main>
    );
  }

  return (
    <main>
      <div className="page-header">
        <h1>Studenti</h1>
      </div>

      {/* <UserTabs /> */}

      <fieldset>
        <legend>Gestione studenti</legend>
        {isTeacher ? (
          <>
            <div className="invite-block">
              <div className="page-actions">
                <button
                  type="button"
                  className="page-action-button"
                  onClick={handleInvite}
                  disabled={inviteStatus === 'loading'}
                >
                  Invita nuovo studente
                </button>
              </div>
            </div>
            {showInviteModal ? (
              <div
                className="invite-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="invite-modal-title"
              >
                <div
                  className="invite-modal__backdrop"
                  onClick={handleCloseInviteModal}
                  aria-hidden="true"
                />
                <div className="invite-modal__content">
                  <h3 id="invite-modal-title" className="invite-modal__title">
                    Condividi invito
                  </h3>
                  <p className="invite-modal__subtitle">
                    Scegli come inviare il link.
                  </p>
                  <div className="invite-modal__actions">
                    <button
                      type="button"
                      className="invite-modal__action invite-modal__action--whatsapp"
                      onClick={handleWhatsAppShare}
                    >
                      <span className="invite-modal__icon" aria-hidden="true">
                        <svg
                          viewBox="0 0 24 24"
                          role="img"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path
                            d="M7 4h10a5 5 0 0 1 5 5v6a5 5 0 0 1-5 5H9l-5 4v-4H7a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M9.5 9.5c.4-1 .8-1 1.4-.4l1.1 1.1c.4.4.4 1 0 1.4l-.6.6c.6 1.1 1.5 2 2.6 2.6l.6-.6c.4-.4 1-.4 1.4 0l1.1 1.1c.6.6.6 1-.4 1.4-1.1.5-2.3.3-3.4-.4-1.6-1-3-2.4-4-4-0.7-1.1-0.9-2.3-0.4-3.4z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span>WhatsApp</span>
                    </button>
                    <button
                      type="button"
                      className="invite-modal__action invite-modal__action--copy"
                      onClick={handleCopyForShare}
                    >
                      <span className="invite-modal__icon" aria-hidden="true">
                        <svg
                          viewBox="0 0 24 24"
                          role="img"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path
                            d="M7 3h8l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M15 3v5h5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span>Copia testo</span>
                    </button>
                  </div>
                  {showCopyNotice ? (
                    <p className="invite-modal__notice">
                      ora puoi incollare questo messaggio su mail o altre
                      piattaforme
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="invite-modal__close"
                    onClick={handleCloseInviteModal}
                  >
                    Chiudi
                  </button>
                </div>
              </div>
            ) : null}
            <div style={{ marginTop: '20px' }}>
              <h3 style={{ margin: '0 0 12px' }}>Assegna esercizio</h3>
              {students.length === 0 ? (
                <p>Nessuno studente assegnato.</p>
              ) : patterns.length === 0 ? (
                <p>
                  Nessun pattern disponibile. Crea un pattern nel compositore.
                </p>
              ) : (
                <>
                  <label htmlFor="student-select">
                    Studente
                    <select
                      id="student-select"
                      value={selectedStudentId}
                      onChange={(event) =>
                        setSelectedStudentId(event.target.value)
                      }
                    >
                      {students.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.name} ({student.email})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor="pattern-select">
                    Pattern
                    <select
                      id="pattern-select"
                      value={selectedPatternId}
                      onChange={(event) =>
                        setSelectedPatternId(event.target.value)
                      }
                    >
                      {patterns.map((pattern) => (
                        <option key={pattern.id} value={pattern.id}>
                          {pattern.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor="assignment-message">
                    Messaggio
                    <input
                      id="assignment-message"
                      type="text"
                      value={assignmentMessage}
                      onChange={(event) =>
                        setAssignmentMessage(event.target.value)
                      }
                      placeholder="Messaggio per lo studente"
                    />
                  </label>
                  <button
                    type="button"
                    className="page-action-button"
                    onClick={handleAssignExercise}
                    disabled={assignmentStatus === 'loading'}
                  >
                    {assignmentStatus === 'loading'
                      ? 'Assegnazione...'
                      : 'Assegna esercizio'}
                  </button>
                </>
              )}
            </div>

            <div style={{ marginTop: '24px' }}>
              <h3 style={{ margin: '0 0 12px' }}>Esercizi assegnati</h3>
              {exercises.length > 0 ? (
                <ul className="exercise-list">
                  {exercises.map((exercise) => (
                    <li key={exercise.id} className="exercise-list__item">
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        <strong>{exercise.patternName}</strong>
                        <span>
                          Studente: {exercise.studentName} (
                          {exercise.studentEmail})
                        </span>
                        {exercise.message ? (
                          <span>Messaggio: {exercise.message}</span>
                        ) : null}
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => handleRemoveExercise(exercise.id)}
                        >
                          Rimuovi
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nessun esercizio assegnato.</p>
              )}
            </div>

            <div style={{ marginTop: '24px' }}>
              <h3 style={{ margin: '0 0 12px' }}>Studenti</h3>
              {students.length > 0 ? (
                <ul className="student-list">
                  {students.map((student) => (
                    <li key={student.id} className="student-list__item">
                      <span className="student-list__name">{student.name}</span>
                      <span className="student-list__email">
                        {student.email}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nessuno studente assegnato.</p>
              )}
            </div>
          </>
        ) : isTeacherAllowed ? (
          <p>
            Passa al ruolo &quot;Insegnante&quot; dalla pagina Profilo per
            vedere gli studenti.
          </p>
        ) : (
          <p>
            Solo gli insegnanti autorizzati (email whitelist) possono accedere a
            questa sezione.
          </p>
        )}
      </fieldset>
    </main>
  );
}
