import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { ObjectId } from 'mongodb';
import clientPromise from '../../../../lib/mongodb';
import { DEFAULT_VOCAL_RANGE, VOCAL_RANGES, type VocalRangeKey } from '../../../../lib/constants';

const vocalRangeKeys = new Set(Object.keys(VOCAL_RANGES) as VocalRangeKey[]);

function getVocalRangeValue(value?: string | null): VocalRangeKey {
  if (value && vocalRangeKeys.has(value as VocalRangeKey)) {
    return value as VocalRangeKey;
  }
  return DEFAULT_VOCAL_RANGE;
}

async function getUserId(request: NextRequest): Promise<ObjectId | null> {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !ObjectId.isValid(token.sub ?? '')) {
    return null;
  }
  return new ObjectId(token.sub as string);
}

export async function GET(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await clientPromise;
  const db = client.db();
  const user = await db
    .collection('users')
    .findOne({ _id: userId }, { projection: { vocalRange: 1 } });
  const resolvedRange = getVocalRangeValue(user?.vocalRange);
  if (!user?.vocalRange || user.vocalRange !== resolvedRange) {
    await db.collection('users').updateOne(
      { _id: userId },
      { $set: { vocalRange: resolvedRange } }
    );
  }

  return NextResponse.json({ vocalRange: resolvedRange });
}

export async function PUT(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { vocalRange?: string };
  if (!body.vocalRange || !vocalRangeKeys.has(body.vocalRange as VocalRangeKey)) {
    return NextResponse.json({ error: 'Invalid vocal range' }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db();
  await db.collection('users').updateOne(
    { _id: userId },
    { $set: { vocalRange: body.vocalRange } }
  );

  return NextResponse.json({ vocalRange: body.vocalRange });
}
