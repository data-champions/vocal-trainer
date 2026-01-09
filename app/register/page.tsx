import { Suspense } from 'react';
import RegisterClient from './register-client';

export default function RegisterPage(): JSX.Element {
  return (
    <Suspense
      fallback={
        <main>
          <div className="page-header">
            <h1>Registrazione</h1>
          </div>
          <p>Caricamento...</p>
        </main>
      }
    >
      <RegisterClient />
    </Suspense>
  );
}
