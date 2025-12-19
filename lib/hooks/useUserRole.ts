import { useCallback, useEffect, useState } from 'react';

export type UserRole = 'student' | 'teacher';

const ROLE_STORAGE_KEY = 'vocal-trainer:user-role';
const ROLE_EVENT = 'vocal-trainer:role-change';

const isValidRole = (value: string | null): value is UserRole => {
  return value === 'student' || value === 'teacher';
};

export function useUserRole(defaultRole: UserRole = 'student') {
  const [role, setRole] = useState<UserRole>(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(ROLE_STORAGE_KEY);
      if (isValidRole(stored)) {
        return stored;
      }
    }
    return defaultRole;
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = window.localStorage.getItem(ROLE_STORAGE_KEY);
    if (isValidRole(stored) && stored !== role) {
      setRole(stored);
    }
  }, [role]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== ROLE_STORAGE_KEY) {
        return;
      }
      if (isValidRole(event.newValue)) {
        setRole(event.newValue);
      }
    };
    const handleLocalRoleEvent = (event: Event) => {
      if ('detail' in event && isValidRole((event as CustomEvent).detail)) {
        setRole((event as CustomEvent<UserRole>).detail);
      }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(ROLE_EVENT, handleLocalRoleEvent as EventListener);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(ROLE_EVENT, handleLocalRoleEvent as EventListener);
    };
  }, []);

  const updateRole = useCallback((nextRole: UserRole) => {
    setRole(nextRole);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ROLE_STORAGE_KEY, nextRole);
      window.dispatchEvent(new CustomEvent<UserRole>(ROLE_EVENT, { detail: nextRole }));
    }
  }, []);

  return { role, setRole: updateRole };
}
