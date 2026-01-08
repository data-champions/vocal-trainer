import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { randomBytes } from 'crypto';
import { ObjectId } from 'mongodb';
import clientPromise from '../../../lib/mongodb';

const INVITE_TTL_DAYS = 7;

export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!ObjectId.isValid(token.sub ?? '')) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }
  if (!token.isTeacher) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const inviteToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
  );
  const client = await clientPromise;
  const db = client.db();
  await db.collection('invitations').insertOne({
    teacherId: new ObjectId(token.sub as string),
    token: inviteToken,
    expiresAt,
    createdAt: new Date(),
  });

  const baseUrl =
    process.env.NEXTAUTH_URL || request.headers.get('origin') || '';
  const inviteLink = `${baseUrl.replace(
    /\/$/,
    ''
  )}/register?invite=${inviteToken}`;

  return NextResponse.json({ inviteLink, expiresAt });
}
