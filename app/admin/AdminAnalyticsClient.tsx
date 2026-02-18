'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Pattern } from '../../lib/types';

type TeacherOption = {
  id: string;
  name: string;
  email: string;
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

export default function AdminAnalyticsClient({
  teachers,
  initialTeacherId,
}: {
  teachers: TeacherOption[];
  initialTeacherId?: string;
}): JSX.Element {
  const [teacherId, setTeacherId] = useState<string>(
    initialTeacherId && teachers.some((teacher) => teacher.id === initialTeacherId)
      ? initialTeacherId
      : teachers[0]?.id ?? ''
  );
  const [patterns, setPatterns] = useState<Pattern[]>([]);
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

  useEffect(() => {
    if (!teacherId && teachers.length > 0) {
      setTeacherId(teachers[0]?.id ?? '');
    }
  }, [teacherId, teachers]);

  const loadPatterns = useCallback(async () => {
    if (!teacherId) {
      setPatterns([]);
      return;
    }
    const response = await fetch(`/api/patterns?teacherId=${teacherId}`);
    if (!response.ok) {
      setPatterns([]);
      return;
    }
    const data = (await response.json().catch(() => ({}))) as {
      patterns?: Pattern[];
    };
    setPatterns(Array.isArray(data.patterns) ? data.patterns : []);
  }, [teacherId]);

  const loadAnalytics = useCallback(async () => {
    if (!teacherId) {
      return;
    }
    setAnalyticsStatus('loading');
    setAnalyticsError('');
    const params = new URLSearchParams();
    params.set('teacherId', teacherId);
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
    teacherId,
  ]);

  useEffect(() => {
    void loadPatterns();
    setAnalyticsStudentId('all');
    setAnalyticsPatternId('all');
  }, [loadPatterns]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const analyticsStudents = analyticsData?.students ?? [];
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

  const formatShortDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
  };

  const formatSemitoneShift = (value: number) =>
    value > 0 ? `+${value}` : `${value}`;

  if (teachers.length === 0) {
    return <p>Nessun docente disponibile.</p>;
  }

  return (
    <>
      <div className="analytics-filters">
        <label className="stacked-label">
          Docente
          <select
            value={teacherId}
            onChange={(event) => setTeacherId(event.target.value)}
          >
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.name} ({teacher.email})
              </option>
            ))}
          </select>
        </label>
        <label className="stacked-label">
          Intervallo
          <select
            value={analyticsInterval}
            onChange={(event) =>
              setAnalyticsInterval(event.target.value as 'day' | 'total')
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
            onChange={(event) => setAnalyticsStudentId(event.target.value)}
          >
            <option value="all">Tutti gli studenti</option>
            {analyticsStudents.map((student) => (
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
            onChange={(event) => setAnalyticsPatternId(event.target.value)}
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
              <p className="analytics-value">{analyticsData.range.label}</p>
            </div>
            <div className="analytics-card">
              <p className="analytics-label">Studenti mostrati</p>
              <p className="analytics-value">{selectedStudents.length}</p>
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
                      <span className="analytics-bar-value">{item.count}</span>
                      <span className="analytics-bar-label">{item.label}</span>
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
                      {formatShortDate(dayLabels[Math.floor(dayLabels.length / 2)])}
                    </span>
                  ) : null}
                  {dayLabels.length > 1 ? (
                    <span>
                      {formatShortDate(dayLabels[dayLabels.length - 1])}
                    </span>
                  ) : null}
                </div>
                <div className="analytics-legend">
                  {lineSeries.map((series) => (
                    <span key={series.id} className="analytics-legend-item">
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
                Mostrati ultimi {analyticsData.rawLimit} ascolti. Restringi il
                periodo per vedere di più.
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <p>Nessun dato disponibile.</p>
      )}
    </>
  );
}
