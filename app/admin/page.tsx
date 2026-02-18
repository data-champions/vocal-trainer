import { notFound } from 'next/navigation';
import { ObjectId } from 'mongodb';
import clientPromise from '../../lib/mongodb';
import AdminAnalyticsClient from './AdminAnalyticsClient';

type SearchParams = {
  teacherId?: string;
  studentId?: string;
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
  const selectedStudentId =
    typeof resolvedSearchParams?.studentId === 'string'
      ? resolvedSearchParams.studentId
      : '';
  const hasStudentSelection = selectedStudentId.length > 0;
  const isValidStudentId =
    hasStudentSelection && ObjectId.isValid(selectedStudentId);

  let selectedTeacher:
    | { id: string; name: string; email: string }
    | null = null;
  let students: Array<{ id: string; name: string; email: string }> = [];
  let selectedStudent: { id: string; name: string; email: string } | null =
    null;
  let assignedExercises: Array<{
    id: string;
    patternName: string;
    message: string;
  }> = [];

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

    if (isValidStudentId) {
      selectedStudent =
        students.find((student) => student.id === selectedStudentId) ?? null;
      if (selectedStudent) {
        const studentObjectId = new ObjectId(selectedStudentId);
        const exerciseRows = await db
          .collection('exercises')
          .find({ teacherId: teacherObjectId, studentId: studentObjectId })
          .sort({ createdAt: -1 })
          .toArray();

        if (exerciseRows.length > 0) {
          const patternIds = Array.from(
            new Set(
              exerciseRows
                .map((exercise) => exercise.patternId)
                .filter((id) => ObjectId.isValid(id))
                .map((id) => (id instanceof ObjectId ? id : new ObjectId(id)))
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

          assignedExercises = exerciseRows.map((exercise) => {
            const pattern = patternMap.get(
              exercise.patternId?.toString?.() ?? String(exercise.patternId)
            );
            return {
              id: exercise._id.toString(),
              patternName: pattern?.name ?? 'Pattern',
              message: exercise.message ?? '',
            };
          });
        }
      }
    }
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
          <legend>Selezione studente</legend>
          <form method="get">
            <input type="hidden" name="teacherId" value={selectedTeacherId} />
            <label>
              <span>Studente</span>
              <select name="studentId" defaultValue={selectedStudentId}>
                <option value="">Seleziona</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name} - {student.email}
                  </option>
                ))}
              </select>
            </label>
            <div className="page-actions">
              <button type="submit" className="page-action-button">
                Mostra esercizi
              </button>
            </div>
          </form>
        </fieldset>
      ) : null}

      <fieldset>
        <legend>📈 Analitica (DEV)</legend>
        <AdminAnalyticsClient
          teachers={teacherOptions}
          initialTeacherId={selectedTeacherId}
        />
      </fieldset>

      {selectedTeacher && hasStudentSelection && !isValidStudentId ? (
        <p>Student id non valido.</p>
      ) : null}

      {selectedTeacher && isValidStudentId && hasStudentSelection && !selectedStudent ? (
        <p>Studente non collegato a questo docente.</p>
      ) : null}

      {selectedTeacher && selectedStudent ? (
        <fieldset>
          <legend>Esercizi assegnati</legend>
          <p>
            Studente: {selectedStudent.name} ({selectedStudent.email})
          </p>
          {assignedExercises.length > 0 ? (
            <ul className="exercise-list">
              {assignedExercises.map((exercise) => (
                <li key={exercise.id} className="exercise-list__item">
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <strong>{exercise.patternName}</strong>
                    {exercise.message ? (
                      <span>Messaggio: {exercise.message}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>Nessun esercizio assegnato.</p>
          )}
        </fieldset>
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
