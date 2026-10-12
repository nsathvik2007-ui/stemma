import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppBar } from '../../components/AppBar';
import { MeshField } from '../../components/MeshField';
import { useAuth } from '../../auth/AuthContext';
import { studentApi } from '../../api/student';
import type { Assignment, Course, Submission } from '../../api/types';

/* Built from Classroom.dc.html.

   Three calls, scoped to one class:

     GET /api/my-courses/   → .find(c => c.id === id)      the class itself
     GET /api/assignments/  → .filter(a => a.course === id) its assignments
     GET /api/submissions/  → matched on assignment id

   Both filters matter: each endpoint returns data for ALL the student's
   classes, so without them this page would show another class's work. The id
   comes from the URL (/student/classroom/:courseId), which is why the effect
   depends on it rather than running once. */

/* ---- date helpers ------------------------------------------------------ */

/* "29 AUG" — the big line in the left column.
   en-GB returns a four-letter "Sept" for September and three letters for every
   other month, so clamp it: the column should not jitter between widths. */
function monthAbbr(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'short' }).slice(0, 3).toUpperCase();
}

function shortDate(iso: string | null): string {
  if (!iso) return 'TBC';
  const d = new Date(iso);
  return `${d.getDate()} ${monthAbbr(d)}`;
}

/* "Friday · 5:00 pm" — the small line under it. */
function dayAndTime(iso: string | null): string {
  if (!iso) return 'no deadline';
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { weekday: 'long' });
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${day} · ${time}`;
}

function onDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate()} ${monthAbbr(d)}`;
}

/* ---- derivation -------------------------------------------------------- */

function derive(assignments: Assignment[], submissions: Submission[]) {
  const byAssignment = new Map(submissions.map((s) => [s.assignment, s]));

  const due = assignments
    .filter((a) => !byAssignment.get(a.id)?.submitted_at)
    .sort((x, y) => (x.due_at ?? '').localeCompare(y.due_at ?? ''));

  const handedIn = assignments
    .filter((a) => byAssignment.get(a.id)?.submitted_at)
    .map((a) => ({ assignment: a, submission: byAssignment.get(a.id)! }))
    .sort((x, y) => (y.submission.submitted_at ?? '').localeCompare(x.submission.submitted_at ?? ''));

  return { due, handedIn };
}

/* ---- screen ------------------------------------------------------------ */

export default function Classroom() {
  const { signOut, email } = useAuth();
  const { courseId } = useParams<{ courseId: string }>();
  const id = Number(courseId);

  const [course, setCourse] = useState<Course | null>(null);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  /* `loaded` is separate from `course` because a null course is a real
     answer — "you are not in this class" — not a loading state. */
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    Promise.all([
      studentApi.myCourses(),
      studentApi.assignments(),
      studentApi.submissions(),
    ])
      .then(([courses, a, s]) => {
        if (cancelled) return;
        setCourse(courses.find((c) => c.id === id) ?? null);
        setAssignments(a.filter((x) => x.course === id));
        setSubmissions(s);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this class.');
      });
    return () => { cancelled = true; };
  }, [id]);

  if (error) {
    return (
      <div className="screen">
        <MeshField id="class" />
        <AppBar name={email ?? ''} role="Student" onSignOut={signOut} />
        <div className="class-body"><p className="error">{error}</p></div>
      </div>
    );
  }

  if (!loaded || !assignments || !submissions) {
    return (
      <div className="screen">
        <MeshField id="class" />
        <AppBar name={email ?? ''} role="Student" onSignOut={signOut} />
        <div className="class-body"><p>Loading…</p></div>
      </div>
    );
  }

  /* Loaded, but this class is not one of theirs. Says so plainly rather than
     rendering an empty shell with a blank title. */
  if (!course) {
    return (
      <div className="screen">
        <MeshField id="class" />
        <AppBar name={email ?? ''} role="Student" onSignOut={signOut} />
        <div className="class-body">
          <Link to="/student" className="backlink">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M8.5 3 L4.5 7 L8.5 11" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            All classes
          </Link>
          <div className="class-empty">
            <div>
              <h2 className="h-26">You are not in this class</h2>
              <p className="class-empty-body">
                Either the link is wrong, or you have not joined it yet. Ask your teacher
                for the six-character join code.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { due, handedIn } = derive(assignments, submissions);

  return (
    <div className="screen">
      <MeshField id="class" />
      <AppBar name={email ?? ''} role="Student" onSignOut={signOut} />

      <div className="class-body">
        <div className="class-head">
          <Link to="/student" className="backlink">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M8.5 3 L4.5 7 L8.5 11" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            All classes
          </Link>

          <div className="class-title-row">
            <div className="title-pill">
              <div className="title-pill-blur" />
              <h1>{course.name}</h1>
            </div>
            <div className="joincode-block">
              <span className="eyebrow">Join code</span>
              <span className="joincode-pill">{course.join_code}</span>
            </div>
          </div>
        </div>

        {due.length === 0 && handedIn.length === 0 ? (
          <div className="class-empty">
            <div>
              <h2 className="h-26">Nothing set yet</h2>
              <p className="class-empty-body">
                You are in the class. When your teacher posts an assignment it appears here,
                with its due date and a way to hand it in.
              </p>
            </div>
          </div>
        ) : (
          <div className="class-sections">
            {due.length > 0 && (
              <section>
                <h2 className="h-26 mb-14">Due</h2>
                <div className="rows-tight">
                  {due.map((a, i) => (
                    <div key={a.id} className="class-row">
                      <div className="stack-4">
                        {/* Only the soonest deadline gets the accent. */}
                        <span className={i === 0 ? 'rowdate rowdate-accent' : 'rowdate'}>
                          {shortDate(a.due_at)}
                        </span>
                        <span className="rowsub">{dayAndTime(a.due_at)}</span>
                      </div>
                      <span className="class-row-title">{a.title}</span>
                      <Link
                        to={`/student/submit/${a.id}`}
                        className={i === 0 ? 'btn-solid btn-md' : 'btn-ghost btn-md'}
                      >
                        Submit work
                      </Link>
                    </div>
                  ))}
                  <div className="row-rule" />
                </div>
              </section>
            )}

            {handedIn.length > 0 && (
              <section>
                <h2 className="h-26 mb-14">Handed in</h2>
                <div className="rows-tight">
                  {handedIn.map(({ assignment, submission }) => (
                    <Link key={assignment.id} to={`/student/submission/${submission.id}`} className="class-row class-row-link">
                      <div className="stack-4">
                        <span className="rowdate rowdate-muted">
                          {onDate(submission.grade ? submission.grade.graded_at : submission.submitted_at)}
                        </span>
                        <span className="rowsub rowsub-dim">
                          {submission.grade ? 'Returned' : 'Submitted'}
                        </span>
                      </div>
                      <span className="class-row-title class-row-title-sm">{assignment.title}</span>
                      {submission.grade ? (
                        <span className="score score-lg">
                          {submission.grade.score}
                          <span className="score-max">/{submission.grade.max_score}</span>
                        </span>
                      ) : (
                        <span className="not-returned">Not returned yet</span>
                      )}
                    </Link>
                  ))}
                  <div className="row-rule" />
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
