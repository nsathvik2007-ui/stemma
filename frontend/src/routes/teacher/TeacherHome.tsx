import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { teacherApi } from '../../api/teacher';
import type { TeacherSummaryRow } from '../../api/types';
import { Empty, Shell, Skeleton } from '../../components/Shell';

export default function TeacherHome() {
  const [rows, setRows] = useState<TeacherSummaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    teacherApi.summary().then(setRows).catch(() => setError('Could not load your courses.'));
  }, []);

  const awaiting = rows?.reduce((n, c) => n + c.awaiting_teacher, 0) ?? 0;

  return (
    <Shell id="t-home">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 20, margin: '0 0 28px', flexWrap: 'wrap' }}>
        <div>
          <span className="eyebrow">Your courses</span>
          <h1 style={{ fontSize: 'var(--text-page)', margin: '10px 0 0' }}>Overview</h1>
        </div>
        <Link to="/teacher/queue" className="btn btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
          Integrity queue
          {awaiting > 0 && (
            <span style={{ marginLeft: 10, fontFamily: 'var(--font-mono)', color: 'var(--vermilion)' }}>{awaiting}</span>
          )}
        </Link>
      </div>

      {error && <p className="error">{error}</p>}
      {!rows && !error && <Skeleton />}
      {rows?.length === 0 && (
        <Empty title="No courses yet" hint="Create a course, then share its join code with your class." />
      )}

      {rows && rows.length > 0 && (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {rows.map((c) => (
            <Link
              key={c.course}
              to={`/teacher/course/${c.course}`}
              style={{
                textDecoration: 'none', color: 'inherit',
                background: 'var(--card)', border: '1px solid var(--bone-18)',
                borderRadius: 'var(--radius-card)', padding: 24,
                backdropFilter: 'blur(12px)', display: 'grid', gap: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                <h2 style={{ fontSize: 20 }}>{c.name}</h2>
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--bone-55)', letterSpacing: '0.06em' }}>
                  {c.join_code}
                </code>
              </div>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                {([
                  ['Handed in', c.handed_in],
                  ['Ungraded', c.ungraded],
                  ['Flagged', c.pending_pairs],
                ] as const).map(([label, n]) => (
                  <div key={label}>
                    <dt className="field-label" style={{ marginBottom: 4 }}>{label}</dt>
                    <dd style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 22 }}>{n}</dd>
                  </div>
                ))}
              </dl>
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
}
