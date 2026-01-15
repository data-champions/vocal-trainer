import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import clientPromise from '../../../../lib/mongodb';
import { getAuthContext } from '../../../../lib/api/auth';

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
