import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';
import { Providers } from './providers';
import { Navbar } from './components/Navbar';
import { LoginButtons } from './components/LoginButtons';

export const metadata: Metadata = {
  title: ' Cantami',
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
  const isDev = process.env.IS_DEV === 'true';
  return (
    <html lang="en">
      <head>
        {isDev ? null : (
          <>
            <script
              defer
              src="https://cloud.umami.is/script.js"
              data-website-id="b4fb4185-8915-470c-8c54-bad1a3bc113e"
            />
            <script
              async
              src="https://www.googletagmanager.com/gtag/js?id=G-VS4KLF5VVB"
            />
            {/* eslint-disable-next-line @next/next/next-script-for-ga */}
            <script
              dangerouslySetInnerHTML={{
                __html: `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-VS4KLF5VVB');
`,
              }}
            />
          </>
        )}
      </head>
      <body>
        <Providers>
          <div className="site-shell">
            <header className="site-header">
              <Link className="home-link" href="/">
                <h1 className="home-link__title">🎹 Cantami</h1>
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
