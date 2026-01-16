import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { ObjectId } from 'mongodb';
import clientPromise from '../../../../lib/mongodb';

const MAX_DISPLAY_NAME_LENGTH = 80;

type AuthResult = {
  userId: ObjectId;
  isTeacher: boolean;
};

async function getAuthUser(request: NextRequest): Promise<AuthResult | null> {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token || !ObjectId.isValid(token.sub ?? '')) {
    return null;
  }
  return {
    userId: new ObjectId(token.sub as string),
    isTeacher: token.isTeacher === true,
  };
}

function normalizeDisplayName(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function toObjectId(value: unknown): ObjectId | null {
  if (value instanceof ObjectId) {
    return value;
  }
  if (typeof value === 'string' && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await clientPromise;
  const db = client.db();

  if (auth.isTeacher) {
    const user = await db.collection('users').findOne(
      { _id: auth.userId },
      { projection: { studentDisplayName: 1 } }
    );
    return NextResponse.json({
      studentDisplayName:
        typeof user?.studentDisplayName === 'string'
          ? user.studentDisplayName
          : '',
    });
  }

  const studentLink = await db
    .collection('students')
    .findOne({ studentId: auth.userId }, { projection: { teacherId: 1 } });

  const teacherId = toObjectId(studentLink?.teacherId);
  if (!teacherId) {
    return NextResponse.json({ teacherName: '' });
  }

  const teacher = await db.collection('users').findOne(
    { _id: teacherId },
    { projection: { name: 1, email: 1, studentDisplayName: 1 } }
  );
  const resolvedName =
    [
      teacher?.studentDisplayName,
      teacher?.name,
      teacher?.email,
    ].find((value) => typeof value === 'string' && value.trim()) ?? '';

  return NextResponse.json({ teacherName: resolvedName });
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!auth.isTeacher) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    studentDisplayName?: unknown;
  };
  const studentDisplayName = normalizeDisplayName(body.studentDisplayName);
  if (studentDisplayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return NextResponse.json({ error: 'Name too long' }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db();
  if (studentDisplayName) {
    await db.collection('users').updateOne(
      { _id: auth.userId },
      { $set: { studentDisplayName } }
    );
  } else {
    await db.collection('users').updateOne(
      { _id: auth.userId },
      { $unset: { studentDisplayName: '' } }
    );
  }

  return NextResponse.json({ studentDisplayName });
}
