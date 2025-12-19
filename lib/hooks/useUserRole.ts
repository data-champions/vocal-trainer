import { useCallback, useEffect, useMemo, useState } from 'react';

export type UserRole = 'student' | 'teacher';

const ROLE_STORAGE_KEY = 'vocal-trainer:user-role';
const ROLE_EVENT = 'vocal-trainer:role-change';

const isValidRole = (value: string | null): value is UserRole => {
  return value === 'student' || value === 'teacher';
};

export function useUserRole(
  defaultRole: UserRole = 'student',
  allowedRoles: UserRole[] = ['student', 'teacher']
) {
  const allowed = useMemo(
    () => (allowedRoles.length ? allowedRoles : ['student']),
    [allowedRoles]
  );
  const [role, setRole] = useState<UserRole>(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(ROLE_STORAGE_KEY);
      if (isValidRole(stored) && allowed.includes(stored)) {
        return stored;
      }
    }
    if (allowed.includes(defaultRole)) {
      return defaultRole;
    }
    return allowed[0];
  });
  const [hasUserSetRole, setHasUserSetRole] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = window.localStorage.getItem(ROLE_STORAGE_KEY);
    if (isValidRole(stored) && allowed.includes(stored) && stored !== role) {
      setRole(stored);
    }
    if (stored && !isValidRole(stored)) {
      window.localStorage.removeItem(ROLE_STORAGE_KEY);
    }
  }, [allowed, role]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== ROLE_STORAGE_KEY) {
        return;
      }
      if (isValidRole(event.newValue) && allowed.includes(event.newValue)) {
        setRole(event.newValue);
      }
    };
    const handleLocalRoleEvent = (event: Event) => {
      if ('detail' in event && isValidRole((event as CustomEvent).detail)) {
        const nextRole = (event as CustomEvent<UserRole>).detail;
        if (allowed.includes(nextRole)) {
          setRole(nextRole);
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(ROLE_EVENT, handleLocalRoleEvent as EventListener);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(ROLE_EVENT, handleLocalRoleEvent as EventListener);
    };
  }, [allowed]);

  useEffect(() => {
    if (!allowed.includes(role)) {
      setRole(allowed.includes(defaultRole) ? defaultRole : allowed[0]);
      return;
    }
    if (!hasUserSetRole && allowed.includes(defaultRole) && role !== defaultRole) {
      setRole(defaultRole);
    }
  }, [allowed, defaultRole, hasUserSetRole, role]);

  const updateRole = useCallback(
    (nextRole: UserRole) => {
      if (!allowed.includes(nextRole)) {
        return;
      }
      setHasUserSetRole(true);
      setRole(nextRole);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(ROLE_STORAGE_KEY, nextRole);
        window.dispatchEvent(new CustomEvent<UserRole>(ROLE_EVENT, { detail: nextRole }));
      }
    },
    [allowed]
  );

  return { role, setRole: updateRole };
}
