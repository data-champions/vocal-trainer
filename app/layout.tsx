import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Voice Trainer 🎹',
  description: 'Interactive vocal training tool recreated in Next.js',
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
                <h1 className="home-link__title">Cantami 🎹</h1>
              </Link>
            </header>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
