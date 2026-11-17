import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { teacherApi } from '../../api/teacher';
import type { TeacherSummaryRow } from '../../api/types';
import { Empty, Shell, Skeleton } from '../../components/Shell';

/* POST /api/courses/ is teacher-only server-side and sets the teacher from
   the token, so the form sends just the name. A new course lands on its own
   page, where the join code and Add students are. */
function NewCourseForm({ onCancel }: { onCancel: () => void }) {
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const course = await teacherApi.createCourse(name.trim());
      nav(`/teacher/course/${course.id}`);
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { name?: unknown } | null) : null;
      setError(
        Array.isArray(body?.name) && typeof body.name[0] === 'string'
          ? body.name.join(' ')
          : 'The course was not created. Try again.',
      );
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        display: 'grid', gap: 14, padding: 24, marginBottom: 24,
        background: 'var(--rail)', border: '1px solid var(--bone-18)',
        borderRadius: 'var(--radius-card)', backdropFilter: 'blur(12px)',
      }}
    >
      <label className="field-label" htmlFor="course-name">Course name</label>
      <input
        id="course-name" className="input" value={name} maxLength={200} required autoFocus
        onChange={(e) => setName(e.target.value)}
        placeholder="Environmental Science 101"
        aria-invalid={!!error} aria-describedby={error ? 'course-name-error' : undefined}
      />
      {error && <span id="course-name-error" className="error" role="alert">{error}</span>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create course'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function TeacherHome() {
  const [rows, setRows] = useState<TeacherSummaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/teacher/queue" className="btn btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            Integrity queue
            {awaiting > 0 && (
              <span style={{ marginLeft: 10, fontFamily: 'var(--font-mono)', color: 'var(--vermilion)' }}>{awaiting}</span>
            )}
          </Link>
          {!creating && (
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              New course
            </button>
          )}
        </div>
      </div>

      {creating && <NewCourseForm onCancel={() => setCreating(false)} />}

      {error && <p className="error">{error}</p>}
      {!rows && !error && <Skeleton />}
      {rows?.length === 0 && !creating && (
        <Empty
          title="No courses yet"
          hint="Create one with New course, then add your class from its Roster tab or share its join code."
        />
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
