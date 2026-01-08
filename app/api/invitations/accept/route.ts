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

  const { invite } = (await request.json().catch(() => ({}))) as { invite?: string };
  if (!invite || typeof invite !== 'string') {
    return NextResponse.json({ error: 'Invalid invite token' }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db();
  const invitation = await db
    .collection('invitations')
    .findOne({ token: invite });
  if (!invitation) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  }
  if (invitation.expiresAt && new Date(invitation.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Invite expired' }, { status: 410 });
  }
  if (invitation.usedAt) {
    return NextResponse.json({ error: 'Invite already used' }, { status: 409 });
  }

  const studentId = new ObjectId(token.sub as string);
  await db.collection('students').updateOne(
    { teacherId: invitation.teacherId, studentId },
    { $setOnInsert: { teacherId: invitation.teacherId, studentId, createdAt: new Date() } },
    { upsert: true }
  );
  await db.collection('users').updateOne(
    { _id: studentId },
    { $set: { isTeacher: false } }
  );
  await db.collection('invitations').updateOne(
    { _id: invitation._id },
    { $set: { usedAt: new Date(), usedBy: studentId } }
  );

  return NextResponse.json({ ok: true });
}
