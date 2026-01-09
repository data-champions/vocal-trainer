'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';

type NavItem = {
  label: string;
  href: string;
};

const teacherItems: NavItem[] = [
  { label: 'Esercizi', href: '/esercizi' },
  { label: 'Compositore', href: '/compositore' },
  { label: 'Studenti', href: '/students' },
  { label: 'Esercizi base', href: '/' },
];

const studentItems: NavItem[] = [
  { label: 'I miei esercizi', href: '/my-exercises' },
  { label: 'Esercizi base', href: '/' },
];

export function Navbar(): JSX.Element | null {
  const { data: session, status } = useSession();

  if (status !== 'authenticated') {
    return null;
  }

  const isTeacher = session?.user?.isTeacher ?? false;
  const items = isTeacher ? teacherItems : studentItems;

  return (
    <nav className="home-navbar" aria-label="Navigazione principale">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className="home-navbar__link">
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
