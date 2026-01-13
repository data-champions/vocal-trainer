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
  const teacher = await db
    .collection('users')
    .findOne({ inviteToken: invite, isTeacher: true });
  if (!teacher) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  }
  const studentId = new ObjectId(token.sub as string);
  if ((teacher._id as ObjectId).equals(studentId)) {
    return NextResponse.json(
      { error: 'Cannot accept your own invite' },
      { status: 409 }
    );
  }
  await db.collection('students').updateOne(
    { teacherId: teacher._id, studentId },
    { $setOnInsert: { teacherId: teacher._id, studentId, createdAt: new Date() } },
    { upsert: true }
  );
  await db.collection('users').updateOne(
    { _id: studentId },
    { $set: { isTeacher: false } }
  );

  return NextResponse.json({ ok: true });
}
