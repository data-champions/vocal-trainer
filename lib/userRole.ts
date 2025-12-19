import type { UserRole } from './hooks/useUserRole';

export const TEACHER_WHITELIST = new Set([
  'fortini.david@gmail.com',
  'infodatachampions@gmail.com',
]);

export function isTeacherWhitelisted(email?: string | null) {
  if (!email) {
    return false;
  }
  return TEACHER_WHITELIST.has(email.toLowerCase());
}

export function getDefaultRoleForEmail(email?: string | null): UserRole {
  return isTeacherWhitelisted(email) ? 'teacher' : 'student';
}

export function getAllowedRoles(email?: string | null): UserRole[] {
  return isTeacherWhitelisted(email)
    ? ['student', 'teacher']
    : ['student'];
}
