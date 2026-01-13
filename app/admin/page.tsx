import { notFound } from 'next/navigation';
import { ObjectId } from 'mongodb';
import clientPromise from '../../lib/mongodb';

type SearchParams = {
  teacherId?: string;
};

const isAdminEnabled = () =>
  process.env.NODE_ENV === 'development' && process.env.IS_DEV === 'true';

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}): Promise<JSX.Element> {
  if (!isAdminEnabled()) {
    notFound();
  }

  const resolvedSearchParams = await Promise.resolve(searchParams);
  const client = await clientPromise;
  const db = client.db();
  const teachers = await db
    .collection('users')
    .find({ isTeacher: true })
    .project({ name: 1, email: 1 })
    .sort({ name: 1 })
    .toArray();

  const teacherOptions = teachers.map((teacher) => ({
    id: teacher._id.toString(),
    name: teacher.name ?? 'Docente',
    email: teacher.email ?? '-',
  }));

  const selectedTeacherId =
    typeof resolvedSearchParams?.teacherId === 'string'
      ? resolvedSearchParams.teacherId
      : '';
  const hasSelection = selectedTeacherId.length > 0;
  const isValidTeacherId = hasSelection && ObjectId.isValid(selectedTeacherId);

  let selectedTeacher:
    | { id: string; name: string; email: string }
    | null = null;
  let students: Array<{ id: string; name: string; email: string }> = [];

  if (isValidTeacherId) {
    const teacherObjectId = new ObjectId(selectedTeacherId);
    const teacherRecord = await db
      .collection('users')
      .findOne({ _id: teacherObjectId }, { projection: { name: 1, email: 1 } });
    if (teacherRecord) {
      selectedTeacher = {
        id: teacherRecord._id.toString(),
        name: teacherRecord.name ?? 'Docente',
        email: teacherRecord.email ?? '-',
      };
    }

    const studentRows = await db
      .collection('students')
      .aggregate<{ studentId: ObjectId; name?: string; email?: string }>([
        { $match: { teacherId: teacherObjectId } },
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: 'users',
            localField: 'studentId',
            foreignField: '_id',
            as: 'student',
          },
        },
        { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
        { $project: { studentId: 1, name: '$student.name', email: '$student.email' } },
      ])
      .toArray();

    students = studentRows
      .map((row) => ({
        id: row.studentId?.toString?.() ?? '',
        name: row.name ?? 'Studente',
        email: row.email ?? '-',
      }))
      .filter((row) => row.id);
  }

  return (
    <main>
      <div className="page-header">
        <h1>Admin</h1>
      </div>

      <fieldset>
        <legend>Selezione docente</legend>
        <form method="get">
          <label>
            <span>Docente</span>
            <select name="teacherId" defaultValue={selectedTeacherId}>
              <option value="">Seleziona</option>
              {teacherOptions.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name} - {teacher.email}
                </option>
              ))}
            </select>
          </label>
          <div className="page-actions">
            <button type="submit" className="page-action-button">
              Mostra studenti
            </button>
          </div>
        </form>
      </fieldset>

      {hasSelection && !isValidTeacherId ? (
        <p>Teacher id non valido.</p>
      ) : null}

      {selectedTeacher ? (
        <fieldset>
          <legend>Studenti collegati</legend>
          <p>
            Docente: {selectedTeacher.name} ({selectedTeacher.email})
          </p>
          {students.length > 0 ? (
            <ul className="student-list">
              {students.map((student) => (
                <li key={student.id} className="student-list__item">
                  <span className="student-list__name">{student.name}</span>
                  <span className="student-list__email">{student.email}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Nessuno studente collegato.</p>
          )}
        </fieldset>
      ) : null}
    </main>
  );
}
