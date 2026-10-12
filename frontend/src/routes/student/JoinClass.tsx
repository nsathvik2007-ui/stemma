import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AppBar } from '../../components/AppBar';
import { MeshField } from '../../components/MeshField';
import { useAuth } from '../../auth/AuthContext';
import { studentApi } from '../../api/student';
import { ApiError } from '../../api/client';
import type { Course } from '../../api/types';

/* Built from Join Class.dc.html.

   Two calls:
     GET  /api/my-courses/      the "Already in" rail
     POST /api/courses/join/    { code }

   The POST has three distinct outcomes, and they are not all errors:
     200 already_enrolled:false → joined
     200 already_enrolled:true  → no-op, say so plainly
     400 { detail }             → unusable code, show the server's reason

   Joining twice is deliberately not an error server-side — get_or_create means
   a double-submit is harmless. */

type Result =
  | { kind: 'idle' }
  | { kind: 'bad'; message: string }
  | { kind: 'already'; courseName: string }
  | { kind: 'joined'; courseId: number; courseName: string };

export default function JoinClass() {
  const { signOut, email } = useAuth();

  const [courses, setCourses] = useState<Course[] | null>(null);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<Result>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);

  function loadCourses() {
    studentApi.myCourses().then(setCourses).catch(() => setCourses([]));
  }

  useEffect(loadCourses, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const clean = code.trim().toUpperCase();

    /* Caught here so a three-character code never becomes a request. The
       server checks this too — client-side validation is a courtesy, never
       the guarantee. */
    if (clean.length !== 6) {
      setResult({ kind: 'bad', message: 'A class code is six characters. Check you have all of it.' });
      return;
    }

    setBusy(true);
    try {
      const res = await studentApi.join(clean);
      if (res.already_enrolled) {
        setResult({ kind: 'already', courseName: res.course_name });
      } else {
        setResult({ kind: 'joined', courseId: res.course, courseName: res.course_name });
        setCode('');
        loadCourses();   /* the rail is now out of date */
      }
    } catch (err) {
      const detail =
        err instanceof ApiError && typeof (err.body as { detail?: string })?.detail === 'string'
          ? (err.body as { detail: string }).detail
          : 'Could not reach the server. Try again.';
      setResult({ kind: 'bad', message: detail });
    } finally {
      setBusy(false);
    }
  }

  const isBad = result.kind === 'bad';

  return (
    <div className="screen">
      <MeshField id="join" />
      <AppBar name={email ?? ''} role="Student" onSignOut={signOut} />

      <div className="join-body">
        <Link to="/student" className="backlink">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M8.5 3 L4.5 7 L8.5 11" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          All classes
        </Link>

        <div className="join-grid">
          <div className="join-main">
            <div className="stack-12">
              <h1 className="h-37">Join a class</h1>
              <p className="join-lede">
                Your teacher gives out a six-character code for each class. Enter one and its
                assignments appear on your list.
              </p>
            </div>

            <form onSubmit={onSubmit} className="join-form">
              <label className="field-label" htmlFor="jc-code">Class code</label>
              <div className="join-input-row">
                <input
                  id="jc-code"
                  className={isBad ? 'joincode-input joincode-input-bad' : 'joincode-input'}
                  type="text"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    /* Clear the last verdict as soon as they start correcting it —
                       a stale error next to an edited field reads as a new one. */
                    if (result.kind !== 'idle') setResult({ kind: 'idle' });
                  }}
                  placeholder="K7M2QX"
                  maxLength={6}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
                <button className="btn-solid btn-xl" disabled={busy}>
                  {busy ? 'Joining' : 'Join class'}
                </button>
              </div>

              {result.kind === 'idle' && (
                <span className="join-hint">
                  Codes are not case-sensitive. A wrong code will say so rather than joining you
                  to the wrong class.
                </span>
              )}

              {result.kind === 'bad' && (
                <div className="join-note" role="alert">
                  <span className="join-dot join-dot-accent" />
                  <span className="join-note-accent">{result.message}</span>
                </div>
              )}

              {result.kind === 'already' && (
                <div className="join-note" role="status">
                  <span className="join-dot" />
                  <span className="join-note-muted">
                    You are already in {result.courseName}. Nothing changed.
                  </span>
                </div>
              )}
            </form>

            {result.kind === 'joined' && (
              <div className="join-success" role="status">
                <div className="join-success-head">
                  <div className="join-check">
                    <div className="join-check-blur" />
                    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
                      <path d="M14 22.5 L19.5 28 L30 17" stroke="var(--vermilion-light)" strokeWidth="2.4" />
                    </svg>
                  </div>
                  <div className="stack-4">
                    <span className="join-success-title">You are in {result.courseName}</span>
                    <span className="join-success-meta">It now appears in your class list.</span>
                  </div>
                </div>
                <div className="join-success-actions">
                  <Link to={`/student/classroom/${result.courseId}`} className="btn-solid btn-lg">
                    Open the class
                  </Link>
                  <Link to="/student" className="join-textlink">Back to all classes</Link>
                </div>
              </div>
            )}
          </div>

          <aside className="join-rail">
            <h2 className="h-24">Already in</h2>
            {courses === null ? (
              <p className="join-hint">Loading…</p>
            ) : courses.length === 0 ? (
              <p className="join-hint">You have not joined a class yet.</p>
            ) : (
              <div className="rows">
                {courses.map((c) => (
                  <Link key={c.id} to={`/student/classroom/${c.id}`} className="row">
                    <span className="row-title">{c.name}</span>
                    <span className="joincode">{c.join_code}</span>
                  </Link>
                ))}
                <div className="row-rule" />
              </div>
            )}
            <p className="join-rail-note">
              Leaving a class is not something you can do here. Ask your teacher — it removes your
              enrolment, not your submitted work.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
