'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  { label: 'I miei esercizi', href: '/esercizi' },
  { label: 'Esercizi base', href: '/' },
];

export function Navbar(): JSX.Element | null {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  if (status !== 'authenticated') {
    return null;
  }

  const isTeacher = session?.user?.isTeacher ?? false;
  const items = isTeacher ? teacherItems : studentItems;

  return (
    <nav className="home-navbar" aria-label="Navigazione principale">
      {items.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== '/' && pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`home-navbar__link${isActive ? ' is-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
