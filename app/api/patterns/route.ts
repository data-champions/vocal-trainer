import { NextResponse, type NextRequest } from 'next/server';
import clientPromise from '../../../lib/mongodb';
import { getAuthContext } from '../../../lib/api/auth';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }
  if (!auth.isTeacher) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const client = await clientPromise;
  const db = client.db();
  const patterns = await db
    .collection('patterns')
    .find({ teacherId: auth.userId })
    .sort({ updatedAt: -1, createdAt: -1 })
    .toArray();

  return NextResponse.json({
    patterns: patterns.map((pattern) => ({
      id: pattern._id.toString(),
      name: pattern.name ?? 'Pattern',
      score: pattern.score ?? null,
      createdAt: pattern.createdAt ? new Date(pattern.createdAt).toISOString() : null,
      updatedAt: pattern.updatedAt ? new Date(pattern.updatedAt).toISOString() : null,
    })),
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
    name?: string;
    score?: unknown;
  };
  const trimmedName = typeof body.name === 'string' ? body.name.trim() : '';
  if (!trimmedName) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  if (!isRecord(body.score)) {
    return NextResponse.json({ error: 'Invalid score' }, { status: 400 });
  }

  const now = new Date();
  const score = { ...body.score, name: body.score?.name ?? trimmedName };
  const doc = {
    teacherId: auth.userId,
    name: trimmedName,
    score,
    createdAt: now,
    updatedAt: now,
  };

  const client = await clientPromise;
  const db = client.db();
  const result = await db.collection('patterns').insertOne(doc);

  return NextResponse.json({
    pattern: {
      id: result.insertedId.toString(),
      name: trimmedName,
      score,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  });
}
