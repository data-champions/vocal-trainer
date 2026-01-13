import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { randomBytes } from 'crypto';
import { ObjectId } from 'mongodb';
import clientPromise from '../../../lib/mongodb';

function getBaseUrl(request: NextRequest) {
  return (
    process.env.CURRENT_URL ||
    process.env.NEXTAUTH_URL ||
    request.headers.get('origin') ||
    ''
  );
}

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

  const client = await clientPromise;
  const db = client.db();
  const teacherId = new ObjectId(token.sub as string);
  const teacher = await db.collection('users').findOne(
    { _id: teacherId },
    { projection: { inviteToken: 1, inviteCreatedAt: 1 } }
  );
  let inviteToken =
    typeof teacher?.inviteToken === 'string' ? teacher.inviteToken : '';
  if (!inviteToken) {
    inviteToken = randomBytes(32).toString('hex');
    const now = new Date();
    await db.collection('users').updateOne(
      { _id: teacherId },
      { $set: { inviteToken, inviteCreatedAt: now } }
    );
  } else if (!teacher?.inviteCreatedAt) {
    await db.collection('users').updateOne(
      { _id: teacherId },
      { $set: { inviteCreatedAt: new Date() } }
    );
  }

  const baseUrl = getBaseUrl(request);
  const inviteLink = `${baseUrl.replace(/\/$/, '')}/register?invite=${inviteToken}`;

  return NextResponse.json({ inviteLink });
}

export async function GET(request: NextRequest) {
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

  const client = await clientPromise;
  const db = client.db();
  const teacherId = new ObjectId(token.sub as string);
  const teacher = await db.collection('users').findOne(
    { _id: teacherId },
    { projection: { inviteToken: 1, inviteCreatedAt: 1 } }
  );

  const baseUrl = getBaseUrl(request).replace(/\/$/, '');
  const items = teacher?.inviteToken
    ? [
        {
          id: String(teacher.inviteToken),
          token: String(teacher.inviteToken),
          createdAt: teacher.inviteCreatedAt
            ? new Date(teacher.inviteCreatedAt as string | number | Date).toISOString()
            : null,
          inviteLink: `${baseUrl}/register?invite=${teacher.inviteToken}`,
        },
      ]
    : [];

  return NextResponse.json({ invitations: items });
}
