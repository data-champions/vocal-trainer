'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useUserRole, type UserRole } from '../../lib/hooks/useUserRole';

type TabConfig = {
  label: string;
  href: string;
};

const teacherTabs: TabConfig[] = [
  { label: 'Profile', href: '/profile' },
  { label: 'Composer', href: '/composer' },
  { label: 'Students', href: '/students' },
  { label: 'Basic exercises', href: '/' },
];

const studentTabs: TabConfig[] = [
  { label: 'Profile', href: '/profile' },
  { label: 'Teacher exercises', href: '/teacher-exercises' },
  { label: 'Basic exercises', href: '/' },
];

function resolveTabs(role: UserRole | null) {
  if (role === 'teacher') {
    return teacherTabs;
  }
  return studentTabs;
}

export function UserTabs(): JSX.Element | null {
  const { status } = useSession();
  const { role } = useUserRole();
  const pathname = usePathname();

  if (status !== 'authenticated') {
    return null;
  }

  const tabs = resolveTabs(role);

  return (
    <nav className="tab-bar" aria-label="Sezioni utente">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`tab-link${isActive ? ' is-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
