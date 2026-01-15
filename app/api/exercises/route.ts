import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import clientPromise from '../../../lib/mongodb';
import { getAuthContext } from '../../../lib/api/auth';

const normalizeMessage = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const { searchParams } = new URL(request.url);
  const studentFilter = searchParams.get('studentId');
  if (studentFilter && !ObjectId.isValid(studentFilter)) {
    return NextResponse.json({ error: 'Invalid student id' }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db();
  const baseQuery = auth.isTeacher
    ? { teacherId: auth.userId }
    : { studentId: auth.userId };
  const query = studentFilter && auth.isTeacher
    ? { ...baseQuery, studentId: new ObjectId(studentFilter) }
    : baseQuery;

  const exercises = await db
    .collection('exercises')
    .find(query)
    .sort({ createdAt: -1 })
    .toArray();

  if (exercises.length === 0) {
    return NextResponse.json({ exercises: [] });
  }

  const patternIds = Array.from(
    new Set(
      exercises
        .map((exercise) => exercise.patternId)
        .filter((id) => ObjectId.isValid(id))
        .map((id) => (id instanceof ObjectId ? id : new ObjectId(id)))
        .map((id) => id.toString())
    )
  ).map((id) => new ObjectId(id));

  const studentIds = Array.from(
    new Set(
      exercises
        .map((exercise) => exercise.studentId)
        .filter((id) => ObjectId.isValid(id))
        .map((id) => (id instanceof ObjectId ? id : new ObjectId(id)))
        .map((id) => id.toString())
    )
  ).map((id) => new ObjectId(id));

  const patterns = await db
    .collection('patterns')
    .find({ _id: { $in: patternIds } })
    .project({ name: 1, score: 1 })
    .toArray();
  const patternMap = new Map(
    patterns.map((pattern) => [pattern._id.toString(), pattern])
  );

  const students = studentIds.length
    ? await db
        .collection('users')
        .find({ _id: { $in: studentIds } })
        .project({ name: 1, email: 1 })
        .toArray()
    : [];
  const studentMap = new Map(
    students.map((student) => [student._id.toString(), student])
  );

  return NextResponse.json({
    exercises: exercises.map((exercise) => {
      const pattern = patternMap.get(exercise.patternId?.toString?.() ?? String(exercise.patternId));
      const student = studentMap.get(exercise.studentId?.toString?.() ?? String(exercise.studentId));
      return {
        id: exercise._id.toString(),
        patternId: exercise.patternId?.toString?.() ?? String(exercise.patternId),
        patternName: pattern?.name ?? 'Pattern',
        score: pattern?.score ?? null,
        message: exercise.message ?? '',
        studentId: exercise.studentId?.toString?.() ?? String(exercise.studentId),
        studentName: student?.name ?? 'Studente',
        studentEmail: student?.email ?? '—',
        createdAt: exercise.createdAt ? new Date(exercise.createdAt).toISOString() : null,
        updatedAt: exercise.updatedAt ? new Date(exercise.updatedAt).toISOString() : null,
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }
  if (!auth.isTeacher) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    patternId?: string;
    studentId?: string;
    message?: string;
  };
  if (!ObjectId.isValid(body.patternId ?? '')) {
    return NextResponse.json({ error: 'Invalid pattern id' }, { status: 400 });
  }
  if (!ObjectId.isValid(body.studentId ?? '')) {
    return NextResponse.json({ error: 'Invalid student id' }, { status: 400 });
  }

  const patternId = new ObjectId(body.patternId);
  const studentId = new ObjectId(body.studentId);
  const message = normalizeMessage(body.message);

  const client = await clientPromise;
  const db = client.db();

  const pattern = await db.collection('patterns').findOne({
    _id: patternId,
    teacherId: auth.userId,
  });
  if (!pattern) {
    return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });
  }

  const studentLink = await db.collection('students').findOne({
    teacherId: auth.userId,
    studentId,
  });
  if (!studentLink) {
    return NextResponse.json({ error: 'Student not linked' }, { status: 404 });
  }

  const now = new Date();
  const result = await db.collection('exercises').findOneAndUpdate(
    { teacherId: auth.userId, studentId, patternId },
    {
      $set: { message, updatedAt: now },
      $setOnInsert: { teacherId: auth.userId, studentId, patternId, createdAt: now },
    },
    { upsert: true, returnDocument: 'after' }
  );
  const saved = result?.value;

  return NextResponse.json({
    exercise: {
      id: saved?._id?.toString?.() ?? '',
      patternId: patternId.toString(),
      patternName: pattern.name ?? 'Pattern',
      score: pattern.score ?? null,
      message,
      studentId: studentId.toString(),
      createdAt: saved?.createdAt ? new Date(saved.createdAt).toISOString() : now.toISOString(),
      updatedAt: now.toISOString(),
    },
  });
}
