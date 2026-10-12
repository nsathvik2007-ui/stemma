import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { teacherApi } from '../../api/teacher';
import type { Assignment, Course, RosterEntry } from '../../api/types';
import { Empty, Shell, Skeleton } from '../../components/Shell';
import { dateAndTime, relativeDeadline } from '../../lib/dates';

/* One class: its work set and its roster, as two tabs over the same header.

   /api/courses/ returns every course this teacher owns and /api/assignments/
   every assignment across them, so both are filtered to this id — the same
   shape the student Classroom uses. The roster is a separate call and is only
   made when that tab is first opened; most visits here are about the work set.

   The join code is displayed rather than actioned. It is the one thing a
   teacher reads aloud to a room, so it is set in mono at a size that survives
   being read off a projector. */

type Tab = 'work' | 'roster';

export default function TeacherCourse() {
  const { courseId } = useParams();
  const id = Number(courseId);

  const [course, setCourse] = useState<Course | null>(null);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('work');
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([teacherApi.courses(), teacherApi.assignments()])
      .then(([cs, as]) => {
        if (cancelled) return;
        setCourse(cs.find((c) => c.id === id) ?? null);
        setAssignments(as.filter((a) => a.course === id));
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this class.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  /* Fetched on first open of the tab, not on mount. */
  useEffect(() => {
    if (tab !== 'roster' || roster || rosterError) return;
    let cancelled = false;
    teacherApi
      .roster(id)
      .then((r) => {
        if (!cancelled) setRoster(r);
      })
      .catch(() => {
        if (!cancelled) setRosterError('Could not load the roster.');
      });
    return () => {
      cancelled = true;
    };
  }, [tab, id, roster, rosterError]);

  if (error) {
    return (
      <Shell id="t-course">
        <p className="error">{error}</p>
      </Shell>
    );
  }

  return (
    <Shell id="t-course">
      <Link to="/teacher" className="backlink" style={{ color: 'var(--bone-55)', fontSize: 13.5 }}>
        ← All courses
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'end', margin: '14px 0 26px', flexWrap: 'wrap' }}>
        <div>
          <span className="eyebrow">Class</span>
          <h1 style={{ fontSize: 'var(--text-page)', margin: '8px 0 0' }}>
            {course ? course.name : 'Loading…'}
          </h1>
        </div>
        {course && (
          <div style={{ textAlign: 'right' }}>
            <span className="field-label">Join code</span>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, letterSpacing: '0.14em', marginTop: 4 }}>
              {course.join_code}
            </div>
          </div>
        )}
      </div>

      <div role="tablist" aria-label="Class sections" style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(
          [
            ['work', 'Work set'],
            ['roster', 'Roster'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className="btn"
            style={{
              padding: '9px 18px',
              minHeight: 0,
              background: tab === key ? 'var(--bone)' : 'transparent',
              color: tab === key ? 'var(--ink)' : 'var(--bone-66)',
              border: `1px solid ${tab === key ? 'transparent' : 'var(--bone-18)'}`,
            }}
          >
            {label}
          </button>
        ))}
        <Link
          to={`/teacher/course/${id}/new-assignment`}
          className="btn btn-primary"
          style={{ marginLeft: 'auto', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
        >
          New assignment
        </Link>
      </div>

      {tab === 'work' && (
        <>
          {!assignments && <Skeleton />}
          {assignments?.length === 0 && (
            <Empty title="No work set yet" hint="Create an assignment and it will appear here for every enrolled student." />
          )}
          {assignments && assignments.length > 0 && (
            <div style={{ display: 'grid', gap: 12 }}>
              {assignments.map((a) => (
                <Link
                  key={a.id}
                  to={`/teacher/assignment/${a.id}`}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center',
                    background: 'var(--card)', border: '1px solid var(--bone-18)',
                    borderRadius: 'var(--radius-card)', padding: '20px 24px',
                    textDecoration: 'none', color: 'inherit', backdropFilter: 'blur(12px)',
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: 19 }}>{a.title}</h2>
                    <p style={{ margin: '6px 0 0', color: 'var(--bone-55)', fontSize: 13.5 }}>
                      {dateAndTime(a.due_at)} · out of {a.max_score}
                    </p>
                  </div>
                  <span className="eyebrow" style={{ whiteSpace: 'nowrap' }}>
                    {relativeDeadline(a.due_at)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'roster' && (
        <>
          {rosterError && <p className="error">{rosterError}</p>}
          {!roster && !rosterError && <Skeleton rows={4} />}
          {roster?.length === 0 && (
            <Empty title="Nobody has joined yet" hint={`Share the join code ${course?.join_code ?? ''} with your class.`} />
          )}
          {roster && roster.length > 0 && (
            <div style={{ border: '1px solid var(--bone-18)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
              {roster.map((r, i) => (
                <div
                  key={r.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
                    padding: '16px 24px', background: 'var(--rail)',
                    borderTop: i === 0 ? 'none' : '1px solid var(--bone-18)',
                  }}
                >
                  <span>{r.name}</span>
                  <span style={{ color: 'var(--bone-55)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                    {r.email || '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
