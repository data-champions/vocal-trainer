'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
// import { UserTabs } from '../components/UserTabs';
import { useUserRole } from '../../lib/hooks/useUserRole';
import { getAllowedRoles, getDefaultRoleForEmail } from '../../lib/userRole';

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
  const [showFullInvite, setShowFullInvite] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'loading' | 'copied'>(
    'idle'
  );
  const [invites, setInvites] = useState<
    Array<{ id: string; inviteLink: string; createdAt: string | null }>
  >([]);
  const [students, setStudents] = useState<
    Array<{ id: string; name: string; email: string }>
  >([]);

  const loadStudents = useCallback(async () => {
    const response = await fetch('/api/students');
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as {
      students: Array<{ id: string; name: string; email: string }>;
    };
    setStudents(data.students ?? []);
  }, []);

  const loadInvites = useCallback(async () => {
    const response = await fetch('/api/invitations');
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as {
      invitations: Array<{ id: string; inviteLink: string; createdAt: string | null }>;
    };
    setInvites(data.invitations ?? []);
  }, []);

  const handleInvite = useCallback(async () => {
    setInviteStatus('loading');
    const response = await fetch('/api/invitations', { method: 'POST' });
    if (!response.ok) {
      setInviteStatus('idle');
      return;
    }
    const data = (await response.json()) as { inviteLink: string };
    setInviteLink(data.inviteLink);
    setShowFullInvite(false);
    setInviteStatus('idle');
    void loadInvites();
  }, []);

  const handleCopy = useCallback(async () => {
    if (!inviteLink) {
      return;
    }
    await navigator.clipboard.writeText(inviteLink);
    setInviteStatus('copied');
    window.setTimeout(() => setInviteStatus('idle'), 1500);
  }, [inviteLink]);

  const handleRevoke = useCallback(async (inviteId: string, link: string) => {
    await fetch('/api/invitations/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId }),
    });
    if (inviteLink === link) {
      setInviteLink('');
      setShowFullInvite(false);
    }
    void loadInvites();
  }, [inviteLink, loadInvites]);

  useEffect(() => {
    if (status !== 'authenticated' || !isTeacher) {
      return;
    }
    void loadStudents();
    void loadInvites();
  }, [isTeacher, loadStudents, loadInvites, status]);

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
              {inviteLink ? (
                <div className="invite-link-row">
                  <input
                    className="invite-link-input"
                    type="text"
                    readOnly
                    value={
                      showFullInvite
                        ? inviteLink
                        : `${inviteLink.slice(0, 24)}…${inviteLink.slice(-10)}`
                    }
                    aria-label="Link invito studente"
                  />
                  <div className="invite-link-actions">
                    <button
                      type="button"
                      className="invite-link-copy"
                      onClick={handleCopy}
                    >
                      {inviteStatus === 'copied' ? 'Copiato' : 'Copia'}
                    </button>
                    <button
                      type="button"
                      className="invite-link-copy"
                      onClick={() => setShowFullInvite((prev) => !prev)}
                    >
                      {showFullInvite ? 'Nascondi' : 'Mostra'}
                    </button>
                  </div>
                </div>
              ) : null}
              {invites.length > 0 ? (
                <div className="invite-list">
                  <p className="invite-list__title">Inviti attivi</p>
                  <ul className="invite-list__items">
                    {invites.map((invite) => (
                      <li key={invite.id} className="invite-list__item">
                        <span className="invite-list__link">
                          {invite.inviteLink.slice(0, 28)}…{invite.inviteLink.slice(-10)}
                        </span>
                        <button
                          type="button"
                          className="invite-link-copy"
                          onClick={() => handleRevoke(invite.id, invite.inviteLink)}
                        >
                          Revoca
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <p>
              Panoramica studenti e assegnazioni arriveranno qui (prossimamente).
            </p>
            {students.length > 0 ? (
              <ul className="student-list">
                {students.map((student) => (
                  <li key={student.id} className="student-list__item">
                    <span className="student-list__name">{student.name}</span>
                    <span className="student-list__email">{student.email}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nessuno studente assegnato.</p>
            )}
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
