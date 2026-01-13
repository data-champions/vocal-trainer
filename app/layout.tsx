import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';
import { Providers } from './providers';
import { Navbar } from './components/Navbar';
import { LoginButtons } from './components/LoginButtons';

export const metadata: Metadata = {
  title: 'Voice Trainer 🎹',
  description: 'Un\'app per cantare meglio e allenare l\'orecchio musicale',
  icons: {
    icon: [
      {
        url: '/musical_keyboard-removebg.png',
        type: 'image/png',
      },
    ],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="site-shell">
            <header className="site-header">
              <Link className="home-link" href="/">
                <h1 className="home-link__title">Cantami🎹</h1>
              </Link>
              <LoginButtons />
            </header>
            <Navbar />
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
