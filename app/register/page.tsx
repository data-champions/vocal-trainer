'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';

export default function RegisterPage(): JSX.Element {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite')?.trim() ?? '';
  const { data: session, status } = useSession();
  const [linkStatus, setLinkStatus] = useState<'idle' | 'linking' | 'done' | 'error'>('idle');
  const callbackUrl = useMemo(() => `/register?invite=${encodeURIComponent(inviteToken)}`, [inviteToken]);

  const handleGoogleLogin = useCallback(() => {
    void signIn('google', { callbackUrl });
  }, [callbackUrl]);

  const handleEmailLogin = useCallback(async () => {
    const emailInput = window.prompt('Inserisci la tua email per accedere');
    if (!emailInput) {
      return;
    }
    const normalizedEmail = emailInput.trim();
    if (!normalizedEmail) {
      return;
    }
    await signIn('email', { email: normalizedEmail, callbackUrl });
  }, [callbackUrl]);

  useEffect(() => {
    if (!inviteToken || status !== 'authenticated' || linkStatus !== 'idle') {
      return;
    }
    setLinkStatus('linking');
    fetch('/api/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite: inviteToken }),
    })
      .then(async (res) => {
        if (!res.ok) {
          setLinkStatus('error');
          return;
        }
        setLinkStatus('done');
      })
      .catch(() => {
        setLinkStatus('error');
      });
  }, [inviteToken, linkStatus, status]);

  if (!inviteToken) {
    return (
      <main>
        <div className="page-header">
          <h1>Registrazione</h1>
        </div>
        <p>Link di invito non valido.</p>
      </main>
    );
  }

  if (status === 'loading') {
    return (
      <main>
        <div className="page-header">
          <h1>Registrazione</h1>
        </div>
        <p>Caricamento...</p>
      </main>
    );
  }

  return (
    <main>
      <div className="page-header">
        <h1>Registrazione</h1>
      </div>
      {status !== 'authenticated' ? (
        <div className="register-card">
          <p className="register-text">Accedi per completare la registrazione.</p>
          <div className="register-actions">
            <button type="button" className="login-button google-button" onClick={handleGoogleLogin}>
              Accedi con Google
            </button>
            <button type="button" className="login-button email-button" onClick={handleEmailLogin}>
              Accedi con email
            </button>
          </div>
        </div>
      ) : (
        <div className="register-card">
          {linkStatus === 'linking' && <p className="register-text">Sto collegando il tuo profilo...</p>}
          {linkStatus === 'done' && (
            <p className="register-text">Registrazione completata. Ora puoi usare l&apos;app.</p>
          )}
          {linkStatus === 'error' && (
            <p className="register-text">Non è stato possibile completare la registrazione.</p>
          )}
        </div>
      )}
      {session?.user?.email ? (
        <p className="register-meta">Utente: {session.user.email}</p>
      ) : null}
    </main>
  );
}
