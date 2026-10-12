import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { teacherApi } from '../../api/teacher';
import type { SubmissionPair, TeacherSummaryRow } from '../../api/types';
import { Empty, Shell, Skeleton } from '../../components/Shell';

/* Every flagged pair this teacher owns, across all their classes.

   Sorted by overlap server-side. The filters map to ?status= and ?course= on
   /api/pairs/ rather than filtering client-side, because the queue is the one
   list that spans classes and could grow past what is reasonable to ship whole.

   "Awaiting you" is ai_review.confirmed === null — a verdict exists and nobody
   has signed it. That is the state the queue is really for, so it leads. */

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

type Filter = 'awaiting' | 'all' | 'pending';

export default function IntegrityQueue() {
  const [pairs, setPairs] = useState<SubmissionPair[] | null>(null);
  const [courses, setCourses] = useState<TeacherSummaryRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<Filter>('awaiting');
  const [courseId, setCourseId] = useState<number | 'all'>('all');

  useEffect(() => {
    teacherApi.summary().then(setCourses).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPairs(null);
    teacherApi
      .pairs({
        status: filter === 'pending' ? 'pending' : undefined,
        course: courseId === 'all' ? undefined : courseId,
      })
      .then((rows) => {
        if (!cancelled) setPairs(rows);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the queue.');
      });
    return () => {
      cancelled = true;
    };
  }, [filter, courseId]);

  /* "Awaiting you" is a property of the nested verdict, not a status value the
     API can filter on, so this one narrowing happens here. */
  const rows =
    pairs && filter === 'awaiting'
      ? pairs.filter((p) => p.ai_review && p.ai_review.confirmed === null)
      : pairs;

  return (
    <Shell id="t-queue">
      <Link to="/teacher" className="backlink" style={{ color: 'var(--bone-55)', fontSize: 13.5 }}>
        ← All courses
      </Link>

      <span className="eyebrow" style={{ display: 'block', marginTop: 14 }}>Across your classes</span>
      <h1 style={{ fontSize: 'var(--text-page)', margin: '8px 0 24px' }}>Integrity queue</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        {(
          [
            ['awaiting', 'Awaiting you'],
            ['all', 'All flagged'],
            ['pending', 'Not yet reviewed'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className="btn"
            aria-pressed={filter === key}
            style={{
              padding: '9px 18px', minHeight: 0,
              background: filter === key ? 'var(--bone)' : 'transparent',
              color: filter === key ? 'var(--ink)' : 'var(--bone-66)',
              border: `1px solid ${filter === key ? 'transparent' : 'var(--bone-18)'}`,
            }}
          >
            {label}
          </button>
        ))}

        <select
          className="input"
          value={courseId}
          onChange={(e) => setCourseId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          style={{ width: 'auto', marginLeft: 'auto', minHeight: 44 }}
          aria-label="Filter by class"
        >
          <option value="all">All classes</option>
          {courses.map((c) => (
            <option key={c.course} value={c.course}>{c.name}</option>
          ))}
        </select>
      </div>

      {error && <p className="error">{error}</p>}
      {!rows && !error && <Skeleton rows={4} />}
      {rows?.length === 0 && (
        <Empty
          title="Nothing waiting"
          hint="Run a scan on an assignment, then review what it flags. Anything needing your decision lands here."
        />
      )}

      {rows && rows.length > 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map((p) => (
            <Link
              key={p.id}
              to={`/teacher/pair/${p.id}`}
              style={{
                display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 20, alignItems: 'center',
                background: 'var(--card)', border: '1px solid var(--bone-18)',
                borderRadius: 'var(--radius-card)', padding: '20px 24px',
                textDecoration: 'none', color: 'inherit', backdropFilter: 'blur(12px)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 26,
                  color: p.jaccard_similarity >= 0.6 ? 'var(--vermilion)' : 'var(--bone)',
                  minWidth: 62,
                }}
              >
                {pct(p.jaccard_similarity)}
              </span>

              <div>
                <h2 style={{ fontSize: 18 }}>
                  {p.submission_a_name} · {p.submission_b_name}
                </h2>
                <p style={{ margin: '5px 0 0', color: 'var(--bone-55)', fontSize: 13.5 }}>
                  {p.course_name} · {p.assignment_title} · {p.overlap_count} shared phrases
                </p>
              </div>

              <span
                className="glass"
                style={{
                  ['--glass-blur' as string]: 'var(--glass-blur-pill)',
                  borderRadius: 'var(--radius-pill)', padding: '6px 14px',
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                {!p.ai_review
                  ? 'Not reviewed'
                  : p.ai_review.confirmed === null
                    ? p.ai_review.verdict
                    : p.ai_review.confirmed
                      ? 'Confirmed'
                      : 'Dismissed'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
}
