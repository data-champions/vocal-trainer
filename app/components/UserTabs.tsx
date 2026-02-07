'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useUserRole, type UserRole } from '../../lib/hooks/useUserRole';
import {
  getAllowedRoles,
  getDefaultRoleForEmail,
} from '../../lib/userRole';

type TabConfig = {
  label: string;
  href: string;
};

const teacherTabs: TabConfig[] = [
  { label: 'Profilo', href: '/profile' },
  { label: 'Esercizi', href: '/esercizi' },
  { label: 'Compositore', href: '/compositore' },
  { label: 'Studenti', href: '/students' },
];

const studentTabs: TabConfig[] = [
  { label: 'Profilo', href: '/profile' },
  { label: 'I miei esercizi', href: '/esercizi' },
];

function resolveTabs(role: UserRole | null) {
  if (role === 'teacher') {
    return teacherTabs;
  }
  return studentTabs;
}

export function UserTabs(): JSX.Element | null {
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? null;
  const allowedRoles = useMemo(() => getAllowedRoles(email), [email]);
  const defaultRole = useMemo(() => getDefaultRoleForEmail(email), [email]);
  const { role } = useUserRole(defaultRole, allowedRoles);
  const pathname = usePathname();

  if (status !== 'authenticated') {
    return null;
  }

  const effectiveRole =
    typeof session?.user?.isTeacher === 'boolean'
      ? session.user.isTeacher
        ? 'teacher'
        : 'student'
      : role;
  const tabs = resolveTabs(effectiveRole);

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
