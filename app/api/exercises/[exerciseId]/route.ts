import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import clientPromise from '../../../../lib/mongodb';
import { getAuthContext } from '../../../../lib/api/auth';

const normalizeMessage = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ exerciseId: string }> }
) {
  const { exerciseId } = await context.params;
  const auth = await getAuthContext(request);
  if ('error' in auth) {
    return NextResponse.json(
      { error: auth.error.message },
      { status: auth.error.status }
    );
  }
  if (!auth.isTeacher) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!ObjectId.isValid(exerciseId)) {
    return NextResponse.json({ error: 'Invalid exercise id' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    message?: unknown;
  };
  if (typeof body.message !== 'string') {
    return NextResponse.json({ error: 'Invalid message' }, { status: 400 });
  }
  const message = normalizeMessage(body.message);

  const client = await clientPromise;
  const db = client.db();
  const now = new Date();
  const result = await db.collection('exercises').findOneAndUpdate(
    { _id: new ObjectId(exerciseId), teacherId: auth.userId },
    { $set: { message, updatedAt: now } },
    { returnDocument: 'after' }
  );
  const updated = result?.value;
  if (!updated) {
    return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
  }

  return NextResponse.json({
    exercise: {
      id: updated._id.toString(),
      message,
      updatedAt: now.toISOString(),
    },
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ exerciseId: string }> }
) {
  const { exerciseId } = await context.params;
  const auth = await getAuthContext(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }
  if (!auth.isTeacher) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!ObjectId.isValid(exerciseId)) {
    return NextResponse.json({ error: 'Invalid exercise id' }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db();
  const result = await db.collection('exercises').deleteOne({
    _id: new ObjectId(exerciseId),
    teacherId: auth.userId,
  });
  if (!result.deletedCount) {
    return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
