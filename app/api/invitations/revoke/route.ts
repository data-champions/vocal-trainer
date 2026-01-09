import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { ObjectId } from 'mongodb';
import clientPromise from '../../../../lib/mongodb';

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!ObjectId.isValid(token.sub ?? '')) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }
  if (!token.isTeacher) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { inviteId } = (await request.json().catch(() => ({}))) as { inviteId?: string };
  if (!inviteId || !ObjectId.isValid(inviteId)) {
    return NextResponse.json({ error: 'Invalid invite id' }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db();
  const teacherId = new ObjectId(token.sub as string);
  const result = await db.collection('invitations').updateOne(
    { _id: new ObjectId(inviteId), teacherId },
    { $set: { revokedAt: new Date() } }
  );

  if (result.matchedCount === 0) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
