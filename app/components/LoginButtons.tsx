'use client';

import { useCallback, useMemo, useState } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';

function GoogleIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={18}
      height={18}
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M17.64 9.2045c0-.6395-.0573-1.2528-.1636-1.8409H9v3.4816h4.84c-.2087 1.1263-.8422 2.0804-1.794 2.7191v2.2582h2.9073c1.7018-1.5663 2.6877-3.8748 2.6877-6.618z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.4673-.8063 5.9563-2.1763l-2.9073-2.2582c-.8063.54-1.8364.8605-3.049.8605-2.3446 0-4.3305-1.5832-5.0409-3.7088H1.9286v2.3323C3.4095 15.9836 5.985 18 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.9591 10.7172c-.1827-.54-.2868-1.1163-.2868-1.7172s.1041-1.1772.2868-1.7172V4.9505H1.9286C1.35 6.1668 1 7.5454 1 9s.35 2.8332.9286 4.0495l2.0305-2.3323z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.5795c1.3214 0 2.509.4559 3.4427 1.3505l2.5827-2.5827C13.4632.8895 11.426 0 9 0 5.985 0 3.4095 2.0164 1.9286 4.9505l2.0305 2.3323C4.6695 5.1627 6.6554 3.5795 9 3.5795z"
        fill="#EA4335"
      />
    </svg>
  );
}

function MailIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={18}
      height={18}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="currentColor"
        d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm8 7.15L5.92 7.6L4.08 9l7.24 5.43a1 1 0 0 0 1.16 0L19.76 9L17.92 7.6L12 12.15Z"
      />
    </svg>
  );
}

export function LoginButtons(): JSX.Element {
  const { data: session, status } = useSession();
  const [emailSignInPending, setEmailSignInPending] = useState(false);

  const handleGoogleLogin = useCallback(() => {
    void signIn('google', { callbackUrl: '/' });
  }, []);

  const handleEmailLogin = useCallback(async () => {
    const emailInput = window.prompt('Inserisci la tua email per accedere');
    if (!emailInput) {
      return;
    }
    const normalizedEmail = emailInput.trim();
    if (!normalizedEmail) {
      return;
    }
    try {
      setEmailSignInPending(true);
      await signIn('credentials', {
        email: normalizedEmail,
        redirect: true,
        callbackUrl: '/',
      });
    } finally {
      setEmailSignInPending(false);
    }
  }, []);

  const handleLogout = useCallback(() => {
    void signOut({ callbackUrl: '/' });
  }, []);

  const displayName = useMemo(() => {
    return (
      session?.user?.name ||
      session?.user?.email ||
      'Account'
    );
  }, [session?.user?.email, session?.user?.name]);

  const avatarInitial = useMemo(() => {
    const source = displayName || '';
    const firstChar = source.trim().charAt(0);
    if (!firstChar) {
      return 'H';
    }
    return firstChar.toUpperCase();
  }, [displayName]);

  const providerLabel = useMemo(() => {
    const provider = session?.user?.provider;
    if (!provider) {
      return 'Connesso';
    }
    return provider === 'google' ? 'Google' : 'Email';
  }, [session?.user?.provider]);

  const isLoading = status === 'loading' || emailSignInPending;
  const isAuthenticated = status === 'authenticated';

  return (
    <div className="auth-actions" aria-label="Sezione di accesso">
      {isAuthenticated ? (
        <>
          <div
            className="user-pill"
            title={session?.user?.email ?? displayName}
          >
            <span className="user-avatar">{avatarInitial}</span>
            <div className="user-details">
              <span className="user-name">{displayName}</span>
              <span className="user-provider">Home - {providerLabel}</span>
            </div>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={handleLogout}
            aria-label="Esci"
          >
            Esci
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="login-button google-button"
            disabled={isLoading}
            onClick={handleGoogleLogin}
            aria-label="Accedi con Google"
          >
            <GoogleIcon />
            Accedi con Google
          </button>
          <button
            type="button"
            className="login-button email-button"
            disabled={isLoading}
            onClick={handleEmailLogin}
            aria-label="Accedi con email"
          >
            <MailIcon />
            Accedi con email
          </button>
        </>
      )}
    </div>
  );
}
