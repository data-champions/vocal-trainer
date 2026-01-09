import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const teacherPaths = ['/esercizi', '/compositore', '/students'];
const studentPaths = ['/my-exercises'];

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!matchesPrefix(pathname, [...teacherPaths, ...studentPaths])) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  const isTeacher = Boolean(token.isTeacher);
  if (matchesPrefix(pathname, teacherPaths) && !isTeacher) {
    const url = request.nextUrl.clone();
    url.pathname = '/profile';
    return NextResponse.redirect(url);
  }

  if (matchesPrefix(pathname, studentPaths) && isTeacher) {
    const url = request.nextUrl.clone();
    url.pathname = '/profile';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/esercizi/:path*', '/compositore/:path*', '/students/:path*', '/my-exercises/:path*'],
};
