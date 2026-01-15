import { ObjectId } from 'mongodb';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

type AuthError = {
  status: number;
  message: string;
};

type AuthContext =
  | {
      userId: ObjectId;
      isTeacher: boolean;
    }
  | {
      error: AuthError;
    };

export async function getAuthContext(request: NextRequest): Promise<AuthContext> {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token) {
    return { error: { status: 401, message: 'Unauthorized' } };
  }
  if (!ObjectId.isValid(token.sub ?? '')) {
    return { error: { status: 400, message: 'Invalid user id' } };
  }
  return {
    userId: new ObjectId(token.sub as string),
    isTeacher: Boolean(token.isTeacher),
  };
}
