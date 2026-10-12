import { Link } from 'react-router-dom';
import { AppBar } from '../../components/AppBar';
import { MeshField } from '../../components/MeshField';
import { useAuth } from '../../auth/AuthContext';
import { plural } from '../../lib/plural';
import type { Assignment, Course, Submission } from '../../api/types';
import { useEffect, useState } from 'react';
import { studentApi } from '../../api/student';

/* Built from Home.dc.html.

   ─────────────────────────────────────────────────────────────────────────
   PRESENTATION ONLY. The three consts below stand in for three API calls:

     COURSES     ←  GET /api/my-courses/
     ASSIGNMENTS ←  GET /api/assignments/
     SUBMISSIONS ←  GET /api/submissions/

   They are typed with the real response types and hold realistically shaped
   values, so wiring is a swap: delete the const, fetch into state of the same
   type. Everything below `derive()` keeps working unchanged.
   See frontend/WIRING.md for the step-by-step.
   ─────────────────────────────────────────────────────────────────────────

   Note there is no similarity score or AI verdict anywhere on this screen.
   That is deliberate: neither is reachable from a student token, and the
   screen respects that rather than leaving a gap to fill in later. */



/* ---- derivation: pure, and unchanged once the data is real ------------- */

interface Row {
  assignment: Assignment;
  courseName: string;
  submission: Submission | undefined;
}

function derive(courses: Course[], assignments: Assignment[], submissions: Submission[]) {
  const courseName = new Map(courses.map((c) => [c.id, c.name]));
  const byAssignment = new Map(submissions.map((s) => [s.assignment, s]));

  const rows: Row[] = assignments.map((a) => ({
    assignment: a,
    courseName: courseName.get(a.course) ?? 'Unknown class',
    submission: byAssignment.get(a.id),
  }));

  const returned = rows.filter((r) => r.submission?.grade);
  const open = rows.filter((r) => !r.submission?.grade);

  /* "Due next" is the soonest open assignment that is not yet handed in.
     Falls back to the soonest open one at all if everything is submitted. */
  const byDue = [...open].sort(
    (x, y) => (x.assignment.due_at ?? '').localeCompare(y.assignment.due_at ?? ''),
  );
  const dueNext = byDue.find((r) => !r.submission?.submitted_at) ?? byDue[0];
  const alsoOpen = byDue.filter((r) => r !== dueNext);

  return { dueNext, alsoOpen, returned };
}

function formatDue(iso: string | null): string {
  if (!iso) return 'no deadline set';
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `due ${day}, ${time}`;
}

/* ---- screen ------------------------------------------------------------ */

export default function StudentHome() {
  /* Sign-out is local state, not an API call, so it stays wired. */
  const { signOut, email } = useAuth();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      studentApi.myCourses(),
      studentApi.assignments(),
      studentApi.submissions(),
    ])
      .then(([c, a, s]) => {
        setCourses(c);
        setAssignments(a);
        setSubmissions(s);
      })
      .catch(() => setError('Could not load your classes.'));
  }, []);
  if (error) return <p className="error">{error}</p>;
  if (!courses || !assignments || !submissions) return <p>Loading…</p>;
  const { dueNext, alsoOpen, returned } = derive(courses, assignments, submissions);
  const assignmentCount = (courseId: number) =>
    assignments.filter((a) => a.course === courseId).length;

  return (
    <div className="screen">
      <MeshField id="home" />
      <AppBar name={email ?? ''} role="Student" onSignOut={signOut} />

      <div className="home-grid">
        <div className="home-main">
          {dueNext && (
            <section className="stack-18">
              <span className="eyebrow">Due next</span>
              <div className="card-raised">
                <div className="duenext">
                  <div className="stack-14">
                    <div className="stack-7">
                      <h1 className="h-33">{dueNext.assignment.title}</h1>
                      <span className="meta">
                        {dueNext.courseName} · {formatDue(dueNext.assignment.due_at)}
                      </span>
                    </div>
                    <span className={dueNext.submission?.submitted_at ? 'chip' : 'chip chip-accent'}>
                      {dueNext.submission?.submitted_at ? (
                        'Submitted'
                      ) : (
                        <>
                          <span className="chip-dot" />
                          Not submitted
                        </>
                      )}
                    </span>
                  </div>
                  <Link to={`/student/submit/${dueNext.assignment.id}`} className="btn-solid btn-lg">Submit work</Link>
                </div>
              </div>
            </section>
          )}

          {alsoOpen.length > 0 && (
            <section>
              <h2 className="h-26 mb-12">Also open</h2>
              <div className="rows">
                {alsoOpen.map((r) => (
                  <Link key={r.assignment.id} to={`/student/submit/${r.assignment.id}`} className="row">
                    <div className="stack-4">
                      <span className="row-title">{r.assignment.title}</span>
                      <span className="row-meta">
                        {r.courseName} · {formatDue(r.assignment.due_at)}
                      </span>
                    </div>
                    <span className={r.submission?.submitted_at ? 'chip chip-outline' : 'chip chip-outline chip-accent'}>
                      {r.submission?.submitted_at ? 'Submitted' : 'Not submitted'}
                    </span>
                  </Link>
                ))}
                <div className="row-rule" />
              </div>
            </section>
          )}

          {returned.length > 0 && (
            <section>
              <h2 className="h-26 mb-12">Returned</h2>
              <div className="rows">
                {returned.map((r) => (
                  <Link key={r.assignment.id} to={`/student/submission/${r.submission!.id}`} className="row">
                    <div className="stack-4">
                      <span className="row-title">{r.assignment.title}</span>
                      <span className="row-meta">
                        {r.courseName} · returned{' '}
                        {new Date(r.submission!.grade!.graded_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'long',
                        })}
                      </span>
                    </div>
                    <span className="score">
                      {r.submission!.grade!.score}
                      <span className="score-max">/{r.submission!.grade!.max_score}</span>
                    </span>
                  </Link>
                ))}
                <div className="row-rule" />
              </div>
            </section>
          )}
        </div>

        <aside className="home-rail">
          <h2 className="h-26">Classes</h2>
          <div className="rows">
            {courses.map((c) => (
              <Link key={c.id} to={`/student/classroom/${c.id}`} className="row">
                <div className="stack-4">
                  <span className="row-title">{c.name}</span>
                  <span className="row-meta">{plural(assignmentCount(c.id), 'assignment')}</span>
                </div>
                <span className="joincode">{c.join_code}</span>
              </Link>
            ))}
            <div className="row-rule" />
          </div>
          <Link to="/student/join" className="btn-ghost">Join a class</Link>
        </aside>
      </div>
    </div>
  );
}
