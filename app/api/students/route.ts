import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { ObjectId } from 'mongodb';
import clientPromise from '../../../lib/mongodb';

export async function GET(request: NextRequest) {
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

  const client = await clientPromise;
  const db = client.db();
  const teacherId = new ObjectId(token.sub as string);
  const studentLinks = await db
    .collection('students')
    .find({ teacherId })
    .toArray();
  const studentIds = studentLinks
    .map((link) => link.studentId)
    .filter((id) => ObjectId.isValid(id));
  if (studentIds.length === 0) {
    return NextResponse.json({ students: [] });
  }

  const students = await db
    .collection('users')
    .find({ _id: { $in: studentIds.map((id) => new ObjectId(id)) } })
    .project({ name: 1, email: 1 })
    .toArray();

  return NextResponse.json({
    students: students.map((student) => ({
      id: student._id.toString(),
      name: student.name ?? 'Studente',
      email: student.email ?? '—',
    })),
  });
}
