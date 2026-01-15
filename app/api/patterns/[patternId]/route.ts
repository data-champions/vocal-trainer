import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import clientPromise from '../../../../lib/mongodb';
import { getAuthContext } from '../../../../lib/api/auth';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ patternId: string }> }
) {
  const { patternId } = await context.params;
  const auth = await getAuthContext(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }
  if (!auth.isTeacher) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!ObjectId.isValid(patternId)) {
    return NextResponse.json({ error: 'Invalid pattern id' }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db();
  const pattern = await db.collection('patterns').findOne({
    _id: new ObjectId(patternId),
    teacherId: auth.userId,
  });
  if (!pattern) {
    return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });
  }

  return NextResponse.json({
    pattern: {
      id: pattern._id.toString(),
      name: pattern.name ?? 'Pattern',
      score: pattern.score ?? null,
      createdAt: pattern.createdAt ? new Date(pattern.createdAt).toISOString() : null,
      updatedAt: pattern.updatedAt ? new Date(pattern.updatedAt).toISOString() : null,
    },
  });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ patternId: string }> }
) {
  const { patternId } = await context.params;
  const auth = await getAuthContext(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }
  if (!auth.isTeacher) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!ObjectId.isValid(patternId)) {
    return NextResponse.json({ error: 'Invalid pattern id' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    score?: unknown;
  };

  const client = await clientPromise;
  const db = client.db();
  const pattern = await db.collection('patterns').findOne({
    _id: new ObjectId(patternId),
    teacherId: auth.userId,
  });
  if (!pattern) {
    return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });
  }

  const trimmedName =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim()
      : (pattern.name ?? 'Pattern');
  let nextScore = pattern.score ?? null;
  if (body.score !== undefined) {
    if (!isRecord(body.score)) {
      return NextResponse.json({ error: 'Invalid score' }, { status: 400 });
    }
    nextScore = { ...body.score, name: body.score?.name ?? trimmedName };
  } else if (pattern.score) {
    nextScore = { ...pattern.score, name: pattern.score?.name ?? trimmedName };
  }

  const updatedAt = new Date();
  await db.collection('patterns').updateOne(
    { _id: pattern._id },
    {
      $set: {
        name: trimmedName,
        score: nextScore,
        updatedAt,
      },
    }
  );

  return NextResponse.json({
    pattern: {
      id: pattern._id.toString(),
      name: trimmedName,
      score: nextScore,
      createdAt: pattern.createdAt
        ? new Date(pattern.createdAt).toISOString()
        : null,
      updatedAt: updatedAt.toISOString(),
    },
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ patternId: string }> }
) {
  const { patternId } = await context.params;
  const auth = await getAuthContext(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }
  if (!auth.isTeacher) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!ObjectId.isValid(patternId)) {
    return NextResponse.json({ error: 'Invalid pattern id' }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db();
  const patternObjectId = new ObjectId(patternId);
  const result = await db.collection('patterns').findOneAndDelete({
    _id: patternObjectId,
    teacherId: auth.userId,
  });
  if (!result) {
    return NextResponse.json({ error: 'Pattern not found' }, { status: 404 });
  }

  await db.collection('exercises').deleteMany({
    teacherId: auth.userId,
    patternId: patternObjectId,
  });

  return NextResponse.json({ ok: true });
}
