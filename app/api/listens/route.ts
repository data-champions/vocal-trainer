import { NextResponse, type NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import clientPromise from '../../../lib/mongodb';
import { getAuthContext } from '../../../lib/api/auth';

type ListenEventDocument = {
  _id?: ObjectId;
  teacherId: ObjectId;
  studentId: ObjectId;
  exerciseId: ObjectId;
  patternId?: ObjectId;
  semitoneShift: number;
  createdAt: Date;
};

type AnalyticsTotalsRow = {
  studentId: string;
  count: number;
};

type AnalyticsDayRow = {
  date: string;
  totals: AnalyticsTotalsRow[];
};

type AnalyticsStudent = {
  id: string;
  name: string;
  email: string;
};

type AnalyticsRawRow = {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  exerciseId: string;
  patternId: string | null;
  patternName: string;
  semitoneShift: number;
  createdAt: string;
};

type AnalyticsResponse = {
  interval: 'day' | 'total';
  range: { from: string | null; to: string | null; label: string };
  students: AnalyticsStudent[];
  totals?: AnalyticsTotalsRow[];
  days?: AnalyticsDayRow[];
  raw: AnalyticsRawRow[];
  rawLimit: number;
};

const MAX_RAW_LIMIT = 500;
const DEFAULT_RAW_LIMIT = 200;

const RANGE_OPTIONS: Record<string, { days: number | null; label: string }> = {
  '7d': { days: 7, label: 'Ultimi 7 giorni' },
  '30d': { days: 30, label: 'Ultimi 30 giorni' },
  '90d': { days: 90, label: 'Ultimi 90 giorni' },
  all: { days: null, label: 'Tutto il periodo' },
};

const toObjectId = (value: unknown): ObjectId | null => {
  if (value instanceof ObjectId) {
    return value;
  }
  if (typeof value === 'string' && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }
  return null;
};

const parseInterval = (value: string | null): 'day' | 'total' => {
  if (value === 'total' || value === 'day') {
    return value;
  }
  return 'day';
};

const parseRange = (value: string | null) => {
  if (value && RANGE_OPTIONS[value]) {
    return RANGE_OPTIONS[value];
  }
  return RANGE_OPTIONS['30d'];
};

const parseRawLimit = (value: string | null) => {
  if (!value) {
    return DEFAULT_RAW_LIMIT;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_RAW_LIMIT;
  }
  return Math.min(Math.floor(parsed), MAX_RAW_LIMIT);
};

const isDevOverrideEnabled = () =>
  process.env.NODE_ENV === 'development' && process.env.IS_DEV === 'true';

export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }
  if (auth.isTeacher) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    exerciseId?: string;
    semitoneShift?: number;
  };

  if (!ObjectId.isValid(body.exerciseId ?? '')) {
    return NextResponse.json({ error: 'Invalid exercise id' }, { status: 400 });
  }

  const exerciseId = new ObjectId(body.exerciseId);
  const semitoneShift = Number.isFinite(body.semitoneShift)
    ? Math.round(body.semitoneShift as number)
    : 0;

  const client = await clientPromise;
  const db = client.db();

  const exercise = await db.collection('exercises').findOne({
    _id: exerciseId,
    studentId: auth.userId,
  });

  if (!exercise) {
    return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
  }

  const teacherId = toObjectId(exercise.teacherId);
  if (!teacherId) {
    return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
  }

  const patternId = toObjectId(exercise.patternId);

  const listenDoc: ListenEventDocument = {
    teacherId,
    studentId: auth.userId,
    exerciseId,
    patternId: patternId ?? undefined,
    semitoneShift,
    createdAt: new Date(),
  };

  await db.collection('listening_events').insertOne(listenDoc);

  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const { searchParams } = new URL(request.url);
  const teacherIdParam = searchParams.get('teacherId');
  const devOverride = isDevOverrideEnabled();

  if (teacherIdParam && !devOverride) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!auth.isTeacher && !devOverride) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!auth.isTeacher && devOverride && !teacherIdParam) {
    return NextResponse.json({ error: 'Teacher id required' }, { status: 400 });
  }
  if (teacherIdParam && !ObjectId.isValid(teacherIdParam)) {
    return NextResponse.json({ error: 'Invalid teacher id' }, { status: 400 });
  }

  const effectiveTeacherId =
    teacherIdParam && devOverride
      ? new ObjectId(teacherIdParam)
      : auth.userId;

  const interval = parseInterval(searchParams.get('interval'));
  const rangeSetting = parseRange(searchParams.get('range'));
  const rawLimit = parseRawLimit(searchParams.get('rawLimit'));
  const studentIdParam = searchParams.get('studentId');
  const exerciseIdParam = searchParams.get('exerciseId');
  const patternIdParam = searchParams.get('patternId');

  if (studentIdParam && !ObjectId.isValid(studentIdParam)) {
    return NextResponse.json({ error: 'Invalid student id' }, { status: 400 });
  }
  if (exerciseIdParam && !ObjectId.isValid(exerciseIdParam)) {
    return NextResponse.json({ error: 'Invalid exercise id' }, { status: 400 });
  }
  if (patternIdParam && !ObjectId.isValid(patternIdParam)) {
    return NextResponse.json({ error: 'Invalid pattern id' }, { status: 400 });
  }

  const now = new Date();
  const fromDate =
    rangeSetting.days === null
      ? null
      : new Date(now.getTime() - rangeSetting.days * 24 * 60 * 60 * 1000);

  const match: Record<string, unknown> = {
    teacherId: effectiveTeacherId,
  };

  if (studentIdParam) {
    match.studentId = new ObjectId(studentIdParam);
  }
  if (exerciseIdParam) {
    match.exerciseId = new ObjectId(exerciseIdParam);
  }
  if (patternIdParam) {
    match.patternId = new ObjectId(patternIdParam);
  }
  if (fromDate) {
    match.createdAt = { $gte: fromDate, $lte: now };
  }

  const client = await clientPromise;
  const db = client.db();

  const studentLinks = await db
    .collection('students')
    .find({ teacherId: effectiveTeacherId })
    .project({ studentId: 1 })
    .toArray();

  const linkedStudentIds = studentLinks
    .map((link) => toObjectId(link.studentId))
    .filter((id): id is ObjectId => Boolean(id));
  const linkedStudentIdSet = new Set(
    linkedStudentIds.map((id) => id.toString())
  );

  const studentIds = studentIdParam
    ? linkedStudentIdSet.has(studentIdParam)
      ? [new ObjectId(studentIdParam)]
      : []
    : linkedStudentIds;

  const students = studentIds.length
    ? await db
        .collection('users')
        .find({ _id: { $in: studentIds } })
        .project({ name: 1, email: 1 })
        .toArray()
    : [];

  const studentList: AnalyticsStudent[] = students.map((student) => ({
    id: student._id.toString(),
    name: student.name ?? 'Studente',
    email: student.email ?? '—',
  }));

  const studentMap = new Map(
    studentList.map((student) => [student.id, student])
  );

  let totals: AnalyticsTotalsRow[] | undefined;
  let days: AnalyticsDayRow[] | undefined;

  if (interval === 'total') {
    const rows = await db
      .collection('listening_events')
      .aggregate<{
        studentId: string;
        count: number;
      }>([
        { $match: match },
        { $group: { _id: '$studentId', count: { $sum: 1 } } },
        {
          $project: {
            _id: 0,
            studentId: { $toString: '$_id' },
            count: 1,
          },
        },
        { $sort: { count: -1 } },
      ])
      .toArray();

    totals = rows;
  } else {
    const rows = await db
      .collection('listening_events')
      .aggregate<{
        day: string;
        studentId: string;
        count: number;
      }>([
        { $match: match },
        {
          $group: {
            _id: {
              day: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
              },
              studentId: '$studentId',
            },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            day: '$_id.day',
            studentId: { $toString: '$_id.studentId' },
            count: 1,
          },
        },
        { $sort: { day: 1 } },
      ])
      .toArray();

    const dayMap = new Map<string, Map<string, number>>();
    rows.forEach((row) => {
      const existing = dayMap.get(row.day) ?? new Map<string, number>();
      existing.set(row.studentId, row.count);
      dayMap.set(row.day, existing);
    });

    days = Array.from(dayMap.entries()).map(([date, totalsMap]) => ({
      date,
      totals: Array.from(totalsMap.entries()).map(([studentId, count]) => ({
        studentId,
        count,
      })),
    }));
  }

  const rawDocs = await db
    .collection('listening_events')
    .find(match)
    .sort({ createdAt: -1 })
    .limit(rawLimit)
    .toArray();

  const patternIds = Array.from(
    new Set(
      rawDocs
        .map((doc) => toObjectId(doc.patternId))
        .filter((id): id is ObjectId => Boolean(id))
        .map((id) => id.toString())
    )
  ).map((id) => new ObjectId(id));

  const patterns = patternIds.length
    ? await db
        .collection('patterns')
        .find({ _id: { $in: patternIds } })
        .project({ name: 1 })
        .toArray()
    : [];

  const patternMap = new Map(
    patterns.map((pattern) => [pattern._id.toString(), pattern])
  );

  const raw: AnalyticsRawRow[] = rawDocs.map((doc) => {
    const studentId = doc.studentId?.toString?.() ?? String(doc.studentId);
    const student = studentMap.get(studentId);
    const patternId = doc.patternId?.toString?.() ?? null;
    const pattern = patternId ? patternMap.get(patternId) : null;
    return {
      id: doc._id?.toString?.() ?? '',
      studentId,
      studentName: student?.name ?? 'Studente',
      studentEmail: student?.email ?? '—',
      exerciseId: doc.exerciseId?.toString?.() ?? String(doc.exerciseId),
      patternId,
      patternName: pattern?.name ?? 'Pattern',
      semitoneShift:
        typeof doc.semitoneShift === 'number' && Number.isFinite(doc.semitoneShift)
          ? doc.semitoneShift
          : 0,
      createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : '',
    };
  });

  const response: AnalyticsResponse = {
    interval,
    range: {
      from: fromDate ? fromDate.toISOString() : null,
      to: now.toISOString(),
      label: rangeSetting.label,
    },
    students: studentList,
    totals,
    days,
    raw,
    rawLimit,
  };

  return NextResponse.json(response);
}
