'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useSession } from 'next-auth/react';
// import { UserTabs } from '../components/UserTabs';
import { useUserRole } from '../../lib/hooks/useUserRole';
import { getAllowedRoles, getDefaultRoleForEmail } from '../../lib/userRole';
import type { AssignedExercise, Pattern } from '../../lib/types';

const getInviteMessage = (inviteLink: string): string =>
  `Ciao! Per usare cantami, clicca qui: ${inviteLink}`;

const getWhatsAppShareUrl = (message: string): string => {
  const encodedMessage = encodeURIComponent(message);
  if (typeof navigator === 'undefined') {
    return `https://wa.me/?text=${encodedMessage}`;
  }
  const userAgent = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const isAndroid = /Android/i.test(userAgent);
  if (isIOS) {
    return `https://api.whatsapp.com/send?text=${encodedMessage}`;
  }
  if (isAndroid) {
    return `https://wa.me/?text=${encodedMessage}`;
  }
  return `https://web.whatsapp.com/send?text=${encodedMessage}`;
};

type ListenTotalsRow = {
  studentId: string;
  count: number;
};

type ListenDayRow = {
  date: string;
  totals: ListenTotalsRow[];
};

type ListenStudent = {
  id: string;
  name: string;
  email: string;
};

type ListenRawRow = {
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

type ListenAnalyticsResponse = {
  interval: 'day' | 'total';
  range: { from: string | null; to: string | null; label: string };
  students: ListenStudent[];
  totals?: ListenTotalsRow[];
  days?: ListenDayRow[];
  raw: ListenRawRow[];
  rawLimit: number;
};

const CHART_COLORS = [
  '#38bdf8',
  '#f97316',
  '#22c55e',
  '#e879f9',
  '#facc15',
  '#f43f5e',
  '#a3e635',
  '#0ea5e9',
];

export default function StudentsPage(): JSX.Element {
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? null;
  const allowedRoles = useMemo(() => getAllowedRoles(email), [email]);
  const defaultRole = useMemo(() => getDefaultRoleForEmail(email), [email]);
  const { role } = useUserRole(defaultRole, allowedRoles);
  const isTeacherAllowed = allowedRoles.includes('teacher');
  const isTeacher =
    typeof session?.user?.isTeacher === 'boolean'
      ? session.user.isTeacher
      : role === 'teacher';
  const [inviteLink, setInviteLink] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showCopyNotice, setShowCopyNotice] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'loading'>('idle');
  const [students, setStudents] = useState<
    Array<{ id: string; name: string; email: string }>
  >([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [exercises, setExercises] = useState<AssignedExercise[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedPatternId, setSelectedPatternId] = useState('');
  const [assignmentMessage, setAssignmentMessage] = useState('');
  const [assignmentStatus, setAssignmentStatus] = useState<'idle' | 'loading'>(
    'idle'
  );
  const [actionPopup, setActionPopup] = useState<string | null>(null);
  const popupTimeoutRef = useRef<number | null>(null);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(
    null
  );
  const [editingMessage, setEditingMessage] = useState('');
  const [editingMessageInitial, setEditingMessageInitial] = useState('');
  const [messageEditStatus, setMessageEditStatus] = useState<
    'idle' | 'saving' | 'error'
  >('idle');
  const [messageEditError, setMessageEditError] = useState('');
  const [activeView, setActiveView] = useState<'manage' | 'analytics'>(
    'manage'
  );
  const [analyticsInterval, setAnalyticsInterval] = useState<'day' | 'total'>(
    'day'
  );
  const [analyticsRange, setAnalyticsRange] = useState<
    '7d' | '30d' | '90d' | 'all'
  >('30d');
  const [analyticsStudentId, setAnalyticsStudentId] = useState<string>('all');
  const [analyticsPatternId, setAnalyticsPatternId] = useState<string>('all');
  const [analyticsStatus, setAnalyticsStatus] = useState<
    'idle' | 'loading' | 'loaded' | 'error'
  >('idle');
  const [analyticsError, setAnalyticsError] = useState('');
  const [analyticsData, setAnalyticsData] =
    useState<ListenAnalyticsResponse | null>(null);

  const loadStudents = useCallback(async () => {
    const response = await fetch('/api/students');
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as {
      students: Array<{ id: string; name: string; email: string }>;
    };
    const nextStudents = data.students ?? [];
    setStudents(nextStudents);
    setSelectedStudentId((prev) => {
      if (prev && nextStudents.some((student) => student.id === prev)) {
        return prev;
      }
      return nextStudents[0]?.id ?? '';
    });
  }, []);

  const loadPatterns = useCallback(async () => {
    const response = await fetch('/api/patterns');
    if (!response.ok) {
      return;
    }
    const data = (await response.json().catch(() => ({}))) as {
      patterns?: Pattern[];
    };
    const nextPatterns = Array.isArray(data.patterns) ? data.patterns : [];
    setPatterns(nextPatterns);
    setSelectedPatternId((prev) => {
      if (prev && nextPatterns.some((pattern) => pattern.id === prev)) {
        return prev;
      }
      return nextPatterns[0]?.id ?? '';
    });
  }, []);

  const loadExercises = useCallback(async () => {
    const response = await fetch('/api/exercises');
    if (!response.ok) {
      return;
    }
    const data = (await response.json().catch(() => ({}))) as {
      exercises?: AssignedExercise[];
    };
    setExercises(Array.isArray(data.exercises) ? data.exercises : []);
  }, []);

  const loadAnalytics = useCallback(async () => {
    if (!isTeacher) {
      return;
    }
    setAnalyticsStatus('loading');
    setAnalyticsError('');
    const params = new URLSearchParams();
    params.set('interval', analyticsInterval);
    params.set('range', analyticsRange);
    params.set('rawLimit', '200');
    if (analyticsStudentId !== 'all') {
      params.set('studentId', analyticsStudentId);
    }
    if (analyticsPatternId !== 'all') {
      params.set('patternId', analyticsPatternId);
    }
    try {
      const response = await fetch(`/api/listens?${params.toString()}`);
      if (!response.ok) {
        setAnalyticsStatus('error');
        setAnalyticsError('Impossibile caricare le analytics.');
        return;
      }
      const data = (await response.json()) as ListenAnalyticsResponse;
      setAnalyticsData(data);
      setAnalyticsStatus('loaded');
    } catch {
      setAnalyticsStatus('error');
      setAnalyticsError('Impossibile caricare le analytics.');
    }
  }, [
    analyticsInterval,
    analyticsPatternId,
    analyticsRange,
    analyticsStudentId,
    isTeacher,
  ]);

  const handleInvite = useCallback(async () => {
    setInviteStatus('loading');
    try {
      const response = await fetch('/api/invitations', { method: 'POST' });
      if (!response.ok) {
        return;
      }
      const data = (await response.json().catch(() => ({}))) as {
        inviteLink?: string;
      };
      if (typeof data.inviteLink === 'string' && data.inviteLink) {
        setInviteLink(data.inviteLink);
        setShowCopyNotice(false);
        setShowInviteModal(true);
      }
    } finally {
      setInviteStatus('idle');
    }
  }, []);

  const showActionPopup = useCallback((message: string) => {
    setActionPopup(message);
    if (popupTimeoutRef.current) {
      window.clearTimeout(popupTimeoutRef.current);
    }
    popupTimeoutRef.current = window.setTimeout(() => {
      setActionPopup(null);
    }, 1200);
  }, []);

  const handleAssignExercise = useCallback(async () => {
    if (!selectedStudentId) {
      window.alert('Seleziona uno studente.');
      return;
    }
    if (!selectedPatternId) {
      window.alert('Seleziona un pattern.');
      return;
    }
    setAssignmentStatus('loading');
    try {
      const response = await fetch('/api/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudentId,
          patternId: selectedPatternId,
          message: assignmentMessage,
        }),
      });
      if (!response.ok) {
        window.alert('Errore nell\'assegnazione dell\'esercizio.');
        return;
      }
      const assignedStudent =
        students.find((student) => student.id === selectedStudentId) ?? null;
      const assignedPattern =
        patterns.find((pattern) => pattern.id === selectedPatternId) ?? null;
      setAssignmentMessage('');
      showActionPopup(
        `✅ Esercizio ${assignedPattern?.name ?? ''} assegnato`,
      );
      await loadExercises();
    } finally {
      setAssignmentStatus('idle');
    }
  }, [
    assignmentMessage,
    loadExercises,
    patterns,
    selectedPatternId,
    selectedStudentId,
    showActionPopup,
    students,
  ]);

  const handleRemoveExercise = useCallback(
    async (exerciseId: string) => {
      const exercise =
        exercises.find((item) => item.id === exerciseId) ?? null;
      const confirmed = window.confirm(
        'Vuoi rimuovere questo esercizio dallo studente?'
      );
      if (!confirmed) {
        return;
      }
      const response = await fetch(`/api/exercises/${exerciseId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        window.alert('Errore nella rimozione dell\'esercizio.');
        return;
      }
      if (editingExerciseId === exerciseId) {
        setEditingExerciseId(null);
        setEditingMessage('');
        setEditingMessageInitial('');
        setMessageEditStatus('idle');
        setMessageEditError('');
      }
      await loadExercises();
      showActionPopup(
        `✅ 'Esercizio' ${exercise?.patternName ?? ''} rimosso`,
      );
    },
    [editingExerciseId, exercises, loadExercises, showActionPopup]
  );

  const handleStartEditMessage = useCallback(
    (exercise: AssignedExercise) => {
      setEditingExerciseId(exercise.id);
      const currentMessage =
        typeof exercise.message === 'string' ? exercise.message : '';
      setEditingMessage(currentMessage);
      setEditingMessageInitial(currentMessage);
      setMessageEditStatus('idle');
      setMessageEditError('');
    },
    []
  );

  const handleCancelEditMessage = useCallback(() => {
    setEditingExerciseId(null);
    setEditingMessage('');
    setEditingMessageInitial('');
    setMessageEditStatus('idle');
    setMessageEditError('');
  }, []);

  const handleSaveMessage = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!editingExerciseId) {
        return;
      }
      const trimmedMessage = editingMessage.trim();
      const trimmedInitial = editingMessageInitial.trim();
      if (trimmedMessage === trimmedInitial) {
        return;
      }
      setMessageEditStatus('saving');
      setMessageEditError('');
      const response = await fetch(`/api/exercises/${editingExerciseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmedMessage }),
      });
      if (!response.ok) {
        setMessageEditStatus('error');
        setMessageEditError('Impossibile aggiornare il messaggio.');
        return;
      }
      await loadExercises();
      setEditingExerciseId(null);
      setEditingMessage('');
      setEditingMessageInitial('');
      setMessageEditStatus('idle');
    },
    [editingExerciseId, editingMessage, editingMessageInitial, loadExercises]
  );

  const isEditingMessageDirty =
    editingMessage.trim() !== editingMessageInitial.trim();

  const handleWhatsAppShare = useCallback(() => {
    if (!inviteLink) {
      return;
    }
    const message = getInviteMessage(inviteLink);
    void navigator.clipboard.writeText(message).catch(() => {});
    const whatsappUrl = getWhatsAppShareUrl(message);
    window.location.href = whatsappUrl;
  }, [inviteLink]);

  const handleCopyForShare = useCallback(async () => {
    if (!inviteLink) {
      return;
    }
    const message = getInviteMessage(inviteLink);
    try {
      await navigator.clipboard.writeText(message);
    } catch {
    }
    setShowCopyNotice(true);
    window.setTimeout(() => setShowCopyNotice(false), 2500);
  }, [inviteLink]);

  const handleCloseInviteModal = useCallback(() => {
    setShowInviteModal(false);
    setShowCopyNotice(false);
  }, []);

  useEffect(() => {
    return () => {
      if (popupTimeoutRef.current) {
        window.clearTimeout(popupTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (status !== 'authenticated' || !isTeacher) {
      return;
    }
    void loadStudents();
    void loadPatterns();
    void loadExercises();
  }, [isTeacher, loadExercises, loadPatterns, loadStudents, status]);

  useEffect(() => {
    if (analyticsStudentId !== 'all') {
      const exists = students.some((student) => student.id === analyticsStudentId);
      if (!exists) {
        setAnalyticsStudentId('all');
      }
    }
  }, [analyticsStudentId, students]);

  useEffect(() => {
    if (analyticsPatternId !== 'all') {
      const exists = patterns.some((pattern) => pattern.id === analyticsPatternId);
      if (!exists) {
        setAnalyticsPatternId('all');
      }
    }
  }, [analyticsPatternId, patterns]);

  useEffect(() => {
    if (status !== 'authenticated' || !isTeacher || activeView !== 'analytics') {
      return;
    }
    void loadAnalytics();
  }, [
    activeView,
    analyticsInterval,
    analyticsPatternId,
    analyticsRange,
    analyticsStudentId,
    isTeacher,
    loadAnalytics,
    status,
  ]);

  const analyticsStudents = analyticsData?.students ?? [];
  const analyticsStudentOptions =
    analyticsStudents.length > 0 ? analyticsStudents : students;
  const selectedStudents = useMemo(() => {
    if (analyticsStudentId === 'all') {
      return analyticsStudents;
    }
    return analyticsStudents.filter((student) => student.id === analyticsStudentId);
  }, [analyticsStudentId, analyticsStudents]);
  const selectedStudentIds = useMemo(
    () => new Set(selectedStudents.map((student) => student.id)),
    [selectedStudents]
  );
  const totals = analyticsData?.totals ?? [];
  const totalsMap = useMemo(
    () => new Map(totals.map((row) => [row.studentId, row.count])),
    [totals]
  );
  const barData = useMemo(
    () =>
      selectedStudents.map((student, index) => ({
        id: student.id,
        label: student.name,
        count: totalsMap.get(student.id) ?? 0,
        color: CHART_COLORS[index % CHART_COLORS.length],
      })),
    [selectedStudents, totalsMap]
  );
  const days = analyticsData?.days ?? [];
  const dayLabels = useMemo(() => {
    if (!analyticsData || analyticsData.interval !== 'day') {
      return days.map((day) => day.date);
    }
    if (!analyticsData.range.from || !analyticsData.range.to) {
      return days.map((day) => day.date);
    }
    const from = new Date(analyticsData.range.from);
    const to = new Date(analyticsData.range.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return days.map((day) => day.date);
    }
    const labels: string[] = [];
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);
    while (cursor <= end) {
      labels.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    return labels;
  }, [analyticsData, days]);
  const dayTotalsMap = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    days.forEach((day) => {
      map.set(
        day.date,
        new Map(day.totals.map((row) => [row.studentId, row.count]))
      );
    });
    return map;
  }, [days]);
  const lineSeries = useMemo(
    () =>
      selectedStudents.map((student, index) => ({
        id: student.id,
        label: student.name,
        color: CHART_COLORS[index % CHART_COLORS.length],
        counts: dayLabels.map(
          (date) => dayTotalsMap.get(date)?.get(student.id) ?? 0
        ),
      })),
    [dayLabels, dayTotalsMap, selectedStudents]
  );
  const totalCount = useMemo(() => {
    if (!analyticsData) {
      return 0;
    }
    if (analyticsData.interval === 'total') {
      return totals
        .filter((row) => selectedStudentIds.has(row.studentId))
        .reduce((sum, row) => sum + row.count, 0);
    }
    return days.reduce((sum, day) => {
      const dayCount = day.totals
        .filter((row) => selectedStudentIds.has(row.studentId))
        .reduce((inner, row) => inner + row.count, 0);
      return sum + dayCount;
    }, 0);
  }, [analyticsData, days, selectedStudentIds, totals]);

  const formatDateTime = (value: string) => {
    if (!value) {
      return '—';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return date.toLocaleString('it-IT');
  };

  const formatSemitoneShift = (value: number) =>
    value > 0 ? `+${value}` : `${value}`;

  const rawRows = analyticsData?.raw ?? [];
  const barMax = barData.reduce((max, item) => Math.max(max, item.count), 1);
  const lineMax = lineSeries.reduce(
    (max, series) => Math.max(max, ...series.counts),
    1
  );
  const chartWidth = 640;
  const chartHeight = 240;
  const chartPadding = 28;
  const chartInnerWidth = chartWidth - chartPadding * 2;
  const chartInnerHeight = chartHeight - chartPadding * 2;

  const formatShortDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
  };

  const getLinePoint = (count: number, index: number, total: number) => {
    const xStep = total > 1 ? chartInnerWidth / (total - 1) : 0;
    const x = chartPadding + (total === 1 ? chartInnerWidth / 2 : index * xStep);
    const y = chartPadding + (1 - count / lineMax) * chartInnerHeight;
    return { x, y };
  };

  const buildLinePoints = (counts: number[]) =>
    counts
      .map((count, index) => {
        const { x, y } = getLinePoint(count, index, counts.length);
        return `${x},${y}`;
      })
      .join(' ');

  if (status === 'loading') {
    return (
      <main>
        <div className="page-header">
          <h1>Studenti</h1>
        </div>
        <p>Caricamento...</p>
      </main>
    );
  }

  if (status !== 'authenticated') {
    return (
      <main>
        <div className="page-header">
          <h1>Studenti</h1>
        </div>
        <p>Accedi come insegnante per gestire gli studenti.</p>
      </main>
    );
  }

  return (
    <main>
      <div className="page-header">
        <h1>Studenti</h1>
      </div>

      {/* <UserTabs /> */}

      <div className="toggle-row" style={{ marginBottom: '16px' }}>
        <p>Sezione</p>
        <div className="toggle-group" role="radiogroup" aria-label="Sezione studenti">
          <button
            type="button"
            className={`toggle-option${activeView === 'manage' ? ' active' : ''}`}
            aria-pressed={activeView === 'manage'}
            onClick={() => setActiveView('manage')}
          >
            Gestione studenti
          </button>
          <button
            type="button"
            className={`toggle-option${activeView === 'analytics' ? ' active' : ''}`}
            aria-pressed={activeView === 'analytics'}
            onClick={() => setActiveView('analytics')}
          >
            📈 Analitica
          </button>
        </div>
      </div>

      {activeView === 'manage' ? (
        <fieldset>
          <legend>Gestione studenti</legend>
          {isTeacher ? (
            <>
            <div className="invite-block">
              <div className="page-actions">
                <button
                  type="button"
                  className="page-action-button"
                  onClick={handleInvite}
                  disabled={inviteStatus === 'loading'}
                >
                  Invita nuovo studente
                </button>
              </div>
            </div>
            {showInviteModal ? (
              <div
                className="invite-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="invite-modal-title"
              >
                <div
                  className="invite-modal__backdrop"
                  onClick={handleCloseInviteModal}
                  aria-hidden="true"
                />
                <div className="invite-modal__content">
                  <h3 id="invite-modal-title" className="invite-modal__title">
                    Condividi invito
                  </h3>
                  <p className="invite-modal__subtitle">
                    Scegli come inviare il link.
                  </p>
                  <div className="invite-modal__actions">
                    <button
                      type="button"
                      className="invite-modal__action invite-modal__action--whatsapp"
                      onClick={handleWhatsAppShare}
                    >
                      <span className="invite-modal__icon" aria-hidden="true">
                        <svg
                          viewBox="0 0 24 24"
                          role="img"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path
                            d="M7 4h10a5 5 0 0 1 5 5v6a5 5 0 0 1-5 5H9l-5 4v-4H7a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M9.5 9.5c.4-1 .8-1 1.4-.4l1.1 1.1c.4.4.4 1 0 1.4l-.6.6c.6 1.1 1.5 2 2.6 2.6l.6-.6c.4-.4 1-.4 1.4 0l1.1 1.1c.6.6.6 1-.4 1.4-1.1.5-2.3.3-3.4-.4-1.6-1-3-2.4-4-4-0.7-1.1-0.9-2.3-0.4-3.4z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span>WhatsApp</span>
                    </button>
                    <button
                      type="button"
                      className="invite-modal__action invite-modal__action--copy"
                      onClick={handleCopyForShare}
                    >
                      <span className="invite-modal__icon" aria-hidden="true">
                        <svg
                          viewBox="0 0 24 24"
                          role="img"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path
                            d="M7 3h8l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M15 3v5h5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span>Copia testo</span>
                    </button>
                  </div>
                  {showCopyNotice ? (
                    <p className="invite-modal__notice">
                      ora puoi incollare questo messaggio su mail o altre
                      piattaforme
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="invite-modal__close"
                    onClick={handleCloseInviteModal}
                  >
                    Chiudi
                  </button>
                </div>
              </div>
            ) : null}
            <div style={{ marginTop: '20px' }}>
              <h3 style={{ margin: '0 0 12px' }}>Assegna esercizio</h3>
              {students.length === 0 ? (
                <p>Nessuno studente assegnato.</p>
              ) : patterns.length === 0 ? (
                <p>
                  Nessun pattern disponibile. Crea un pattern nel compositore.
                </p>
              ) : (
                <>
                  <label htmlFor="student-select">
                    Studente
                    <select
                      id="student-select"
                      value={selectedStudentId}
                      onChange={(event) =>
                        setSelectedStudentId(event.target.value)
                      }
                    >
                      {students.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.name} ({student.email})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor="pattern-select">
                    Pattern
                    <select
                      id="pattern-select"
                      value={selectedPatternId}
                      onChange={(event) =>
                        setSelectedPatternId(event.target.value)
                      }
                    >
                      {patterns.map((pattern) => (
                        <option key={pattern.id} value={pattern.id}>
                          {pattern.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor="assignment-message">
                    Messaggio
                    <input
                      id="assignment-message"
                      type="text"
                      value={assignmentMessage}
                      onChange={(event) =>
                        setAssignmentMessage(event.target.value)
                      }
                      placeholder="Messaggio per lo studente"
                    />
                  </label>
                  <div className="assignment-action-row">
                    <button
                      type="button"
                      className="page-action-button"
                      onClick={handleAssignExercise}
                      disabled={assignmentStatus === 'loading'}
                    >
                      {assignmentStatus === 'loading'
                        ? 'Assegnazione...'
                        : 'Assegna esercizio'}
                    </button>
                    {actionPopup ? (
                      <div
                        className="action-popup action-popup--success action-popup--inline"
                        role="status"
                        aria-live="polite"
                      >
                        {actionPopup}
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>

            <div style={{ marginTop: '24px' }}>
              <h3 style={{ margin: '0 0 12px' }}>Esercizi assegnati</h3>
              {exercises.length > 0 ? (
                <ul className="exercise-list">
                  {exercises.map((exercise) => (
                    <li key={exercise.id} className="exercise-list__item">
                      {editingExerciseId === exercise.id ? (
                        <form onSubmit={handleSaveMessage}>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px',
                            }}
                          >
                            <strong>{exercise.patternName}</strong>
                            <span>
                              Studente: {exercise.studentName} (
                              {exercise.studentEmail})
                            </span>
                            <label
                              className="stacked-label"
                              htmlFor={`exercise-message-${exercise.id}`}
                            >
                              Messaggio
                              <input
                                id={`exercise-message-${exercise.id}`}
                                type="text"
                                className="profile-input"
                                value={editingMessage}
                                onChange={(event) =>
                                  setEditingMessage(event.target.value)
                                }
                                placeholder="Messaggio per lo studente"
                                disabled={messageEditStatus === 'saving'}
                              />
                            </label>
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '8px',
                              }}
                            >
                              <button
                                type="submit"
                                className="text-button"
                                disabled={
                                  messageEditStatus === 'saving' ||
                                  !isEditingMessageDirty
                                }
                              >
                                {messageEditStatus === 'saving'
                                  ? 'Salvataggio...'
                                  : 'Salva messaggio'}
                              </button>
                              <button
                                type="button"
                                className="text-button"
                                onClick={handleCancelEditMessage}
                                disabled={messageEditStatus === 'saving'}
                              >
                                Annulla
                              </button>
                              <button
                                type="button"
                                className="text-button"
                                onClick={() =>
                                  handleRemoveExercise(exercise.id)
                                }
                                disabled={messageEditStatus === 'saving'}
                              >
                                Rimuovi
                              </button>
                            </div>
                            {messageEditStatus === 'error' ? (
                              <p>{messageEditError}</p>
                            ) : null}
                          </div>
                        </form>
                      ) : (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        <strong>{exercise.patternName}</strong>
                        <span>
                          Studente: {exercise.studentName} (
                          {exercise.studentEmail})
                        </span>
                        {exercise.message ? (
                          <span>Messaggio: {exercise.message}</span>
                        ) : null}
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '8px',
                          }}
                        >
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => handleStartEditMessage(exercise)}
                          >
                            Modifica messaggio
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() =>
                              handleRemoveExercise(exercise.id)
                            }
                          >
                            Rimuovi
                          </button>
                        </div>
                      </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nessun esercizio assegnato.</p>
              )}
            </div>

            <div style={{ marginTop: '24px' }}>
              <h3 style={{ margin: '0 0 12px' }}>Studenti</h3>
              {students.length > 0 ? (
                <ul className="student-list">
                  {students.map((student) => (
                    <li key={student.id} className="student-list__item">
                      <span className="student-list__name">{student.name}</span>
                      <span className="student-list__email">
                        {student.email}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nessuno studente assegnato.</p>
              )}
            </div>
          </>
        ) : isTeacherAllowed ? (
          <p>
            Passa al ruolo &quot;Insegnante&quot; dalla pagina Profilo per
            vedere gli studenti.
          </p>
        ) : (
          <p>
            Solo gli insegnanti autorizzati (email whitelist) possono accedere a
            questa sezione.
          </p>
        )}
        </fieldset>
      ) : (
        <fieldset>
          <legend>📈 Analitica</legend>
          {isTeacher ? (
            <>
              {students.length === 0 ? (
                <p>Nessuno studente assegnato.</p>
              ) : (
                <>
                  <div className="analytics-filters">
                    <label className="stacked-label">
                      Intervallo
                      <select
                        value={analyticsInterval}
                        onChange={(event) =>
                          setAnalyticsInterval(
                            event.target.value as 'day' | 'total'
                          )
                        }
                      >
                        <option value="day">Per giorno</option>
                        <option value="total">Totale</option>
                      </select>
                    </label>
                    <label className="stacked-label">
                      Periodo
                      <select
                        value={analyticsRange}
                        onChange={(event) =>
                          setAnalyticsRange(
                            event.target.value as '7d' | '30d' | '90d' | 'all'
                          )
                        }
                      >
                        <option value="7d">Ultimi 7 giorni</option>
                        <option value="30d">Ultimi 30 giorni</option>
                        <option value="90d">Ultimi 90 giorni</option>
                        <option value="all">Tutto</option>
                      </select>
                    </label>
                    <label className="stacked-label">
                      Studente
                      <select
                        value={analyticsStudentId}
                        onChange={(event) =>
                          setAnalyticsStudentId(event.target.value)
                        }
                      >
                        <option value="all">Tutti gli studenti</option>
                        {analyticsStudentOptions.map((student) => (
                          <option key={student.id} value={student.id}>
                            {student.name} ({student.email})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="stacked-label">
                      Esercizio
                      <select
                        value={analyticsPatternId}
                        onChange={(event) =>
                          setAnalyticsPatternId(event.target.value)
                        }
                      >
                        <option value="all">Tutti gli esercizi</option>
                        {patterns.map((pattern) => (
                          <option key={pattern.id} value={pattern.id}>
                            {pattern.name || 'Pattern'}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {analyticsStatus === 'loading' ? (
                    <p>Caricamento analitica...</p>
                  ) : analyticsStatus === 'error' ? (
                    <p>{analyticsError}</p>
                  ) : analyticsData ? (
                    <>
                      <div className="analytics-summary">
                        <div className="analytics-card">
                          <p className="analytics-label">Ascolti totali</p>
                          <p className="analytics-value">{totalCount}</p>
                        </div>
                        <div className="analytics-card">
                          <p className="analytics-label">Periodo</p>
                          <p className="analytics-value">
                            {analyticsData.range.label}
                          </p>
                        </div>
                        <div className="analytics-card">
                          <p className="analytics-label">Studenti mostrati</p>
                          <p className="analytics-value">
                            {selectedStudents.length}
                          </p>
                        </div>
                      </div>

                      <div className="analytics-chart">
                        {analyticsData.interval === 'total' ? (
                          barData.length > 0 ? (
                            <div className="analytics-bar-chart">
                              {barData.map((item) => (
                                <div key={item.id} className="analytics-bar">
                                  <div
                                    className="analytics-bar-fill"
                                    style={{
                                      height: `${(item.count / barMax) * 100}%`,
                                      background: item.color,
                                    }}
                                  />
                                  <span className="analytics-bar-value">
                                    {item.count}
                                  </span>
                                  <span className="analytics-bar-label">
                                    {item.label}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p>Nessun dato disponibile.</p>
                          )
                        ) : lineSeries.length > 0 && dayLabels.length > 0 ? (
                          <div className="analytics-line-chart">
                            <svg
                              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                              role="img"
                              aria-label="Grafico ascolti per giorno"
                            >
                              <line
                                x1={chartPadding}
                                y1={chartHeight - chartPadding}
                                x2={chartWidth - chartPadding}
                                y2={chartHeight - chartPadding}
                                stroke="rgba(148, 163, 184, 0.35)"
                                strokeWidth="1"
                              />
                              {lineSeries.map((series) => (
                                <polyline
                                  key={series.id}
                                  fill="none"
                                  stroke={series.color}
                                  strokeWidth="2"
                                  points={buildLinePoints(series.counts)}
                                />
                              ))}
                              {lineSeries.map((series) =>
                                series.counts.map((count, index) => {
                                  const point = getLinePoint(
                                    count,
                                    index,
                                    series.counts.length
                                  );
                                  return (
                                    <circle
                                      key={`${series.id}-${index}`}
                                      cx={point.x}
                                      cy={point.y}
                                      r="2.5"
                                      fill={series.color}
                                    />
                                  );
                                })
                              )}
                            </svg>
                            <div className="analytics-chart-labels">
                              <span>{formatShortDate(dayLabels[0])}</span>
                              {dayLabels.length > 2 ? (
                                <span>
                                  {formatShortDate(
                                    dayLabels[Math.floor(dayLabels.length / 2)]
                                  )}
                                </span>
                              ) : null}
                              {dayLabels.length > 1 ? (
                                <span>
                                  {formatShortDate(
                                    dayLabels[dayLabels.length - 1]
                                  )}
                                </span>
                              ) : null}
                            </div>
                            <div className="analytics-legend">
                              {lineSeries.map((series) => (
                                <span
                                  key={series.id}
                                  className="analytics-legend-item"
                                >
                                  <span
                                    className="analytics-legend-swatch"
                                    style={{ background: series.color }}
                                  />
                                  {series.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p>Nessun dato disponibile.</p>
                        )}
                      </div>

                      <div style={{ marginTop: '24px' }}>
                        <h3 style={{ margin: '0 0 12px' }}>Dati grezzi</h3>
                        {rawRows.length > 0 ? (
                          <div className="analytics-table-wrapper">
                            <table className="analytics-table">
                              <thead>
                                <tr>
                                  <th>Data</th>
                                  <th>Studente</th>
                                  <th>Esercizio</th>
                                  <th>Distanza (semitoni)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rawRows.map((row) => (
                                  <tr key={row.id}>
                                    <td>{formatDateTime(row.createdAt)}</td>
                                    <td>
                                      {row.studentName} ({row.studentEmail})
                                    </td>
                                    <td>{row.patternName}</td>
                                    <td>{formatSemitoneShift(row.semitoneShift)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p>Nessun ascolto registrato.</p>
                        )}
                        <p className="analytics-note">Ordine: più recenti.</p>
                        {rawRows.length >= analyticsData.rawLimit ? (
                          <p className="analytics-note">
                            Mostrati ultimi {analyticsData.rawLimit} ascolti.
                            Restringi il periodo per vedere di più.
                          </p>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <p>Nessun dato disponibile.</p>
                  )}
                </>
              )}
            </>
          ) : isTeacherAllowed ? (
            <p>
              Passa al ruolo &quot;Insegnante&quot; dalla pagina Profilo per
              vedere gli studenti.
            </p>
          ) : (
            <p>
              Solo gli insegnanti autorizzati (email whitelist) possono
              accedere a questa sezione.
            </p>
          )}
        </fieldset>
      )}
    </main>
  );
}
