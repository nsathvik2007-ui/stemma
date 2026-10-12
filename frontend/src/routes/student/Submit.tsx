import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppBar } from '../../components/AppBar';
import { MeshField } from '../../components/MeshField';
import { Mark } from '../../components/Mark';
import { useAuth } from '../../auth/AuthContext';
import { studentApi } from '../../api/student';
import { ApiError } from '../../api/client';
import { plural } from '../../lib/plural';
import type { Assignment, Course, Submission } from '../../api/types';

/* Built from Submit.dc.html.

   POST /api/assignments/:id/submit/  — raw_text, or a multipart image.
   POST /api/assignments/:id/draft/   — raw_text only; 409 once submitted.

   submit/ is update_or_create on (assignment, student), so resubmitting
   replaces rather than duplicates. Photo mode sends the image; the server
   OCRs it and stores only the text. */

type Mode = 'type' | 'photo';

function countWords(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

const VERDICTS = [
  ['copied', 'Copied', 'The same sentences, in the same order.'],
  ['paraphrased', 'Paraphrased', 'Reworded, with the same argument underneath.'],
  ['coincidental', 'Coincidental', 'Shared terminology and nothing more.'],
] as const;

export default function Submit() {
  const { signOut, email } = useAuth();
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const id = Number(assignmentId);

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>('type');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [draftState, setDraftState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [replacing, setReplacing] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([studentApi.assignments(), studentApi.myCourses(), studentApi.submissions()])
      .then(([assignments, courses, subs]) => {
        if (cancelled) return;
        const a = assignments.find((x) => x.id === id) ?? null;
        setAssignment(a);
        setCourse(a ? courses.find((c) => c.id === a.course) ?? null : null);
        const mine = subs.find((s) => s.assignment === id) ?? null;
        setSubmission(mine);
        if (mine) setText(mine.raw_text);
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) setLoadError('Could not load this assignment.'); });
    return () => { cancelled = true; };
  }, [id]);

  const handedIn = submission?.submitted_at != null;

  /* Debounced draft save. Only while unsubmitted — the endpoint answers 409
     once the work is handed in, and there is nothing to autosave over. */
  const saveDraft = useCallback(
    (value: string) => {
      setDraftState('saving');
      studentApi
        .draft(id, value)
        .then(() => setDraftState('saved'))
        .catch(() => setDraftState('idle'));
    },
    [id],
  );

  useEffect(() => {
    if (!loaded || handedIn || replacing) return;
    if (text.trim() === '') return;
    if (submission && text === submission.raw_text) return;
    const t = setTimeout(() => saveDraft(text), 1200);
    return () => clearTimeout(t);
  }, [text, loaded, handedIn, replacing, submission, saveDraft]);

  async function onSubmitText() {
    if (!text.trim()) return;
    setBusy(true);
    setProblem(null);
    try {
      const s = await studentApi.submit(id, { raw_text: text });
      setSubmission(s);
      setReplacing(false);
      setDraftState('idle');
    } catch (err) {
      setProblem(detailOf(err, 'Could not submit. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function onPickFile(file: File) {
    setBusy(true);
    setProblem(null);
    try {
      const form = new FormData();
      form.append('image', file);
      const s = await studentApi.submit(id, form);
      setSubmission(s);
      setText(s.raw_text);
      setReplacing(false);
    } catch (err) {
      /* 502 is the OCR failing, which is the common one and is the student's
         problem to fix — bad light, curled paper. */
      setProblem(
        detailOf(
          err,
          'We could not read that photo. Retake it flat with more light, or type your answer instead. Nothing was submitted.',
        ),
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function detailOf(err: unknown, fallback: string): string {
    if (err instanceof ApiError) {
      const d = (err.body as { detail?: string })?.detail;
      if (typeof d === 'string') return d;
    }
    return fallback;
  }

  const shell = (children: React.ReactNode) => (
    <div className="screen">
      <MeshField id="submit" />
      <AppBar name={email ?? ''} role="Student" onSignOut={signOut} />
      {children}
    </div>
  );

  if (loadError) return shell(<div className="submit-main"><p className="error">{loadError}</p></div>);
  if (!loaded) return shell(<div className="submit-main"><p>Loading…</p></div>);
  if (!assignment) {
    return shell(
      <div className="submit-main">
        <Link to="/student" className="backlink">All classes</Link>
        <h1 className="h-37">Assignment not found</h1>
        <p className="join-hint">It may belong to a class you are not in.</p>
      </div>,
    );
  }

  const showComposer = !handedIn || replacing;
  const words = countWords(text);

  return shell(
    <div className="submit-grid">
      <div className="submit-main">
        <div className="stack-14">
          <Link to={course ? `/student/classroom/${course.id}` : '/student'} className="backlink">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M8.5 3 L4.5 7 L8.5 11" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            {course?.name ?? 'All classes'}
          </Link>
          <div className="title-pill">
            <div className="title-pill-blur" />
            <h1>{assignment.title}</h1>
          </div>
        </div>

        {showComposer ? (
          <div className="composer">
            <div className="tabs">
              <button
                type="button"
                className={mode === 'type' ? 'tab tab-on' : 'tab'}
                onClick={() => setMode('type')}
              >
                Type it
              </button>
              <button
                type="button"
                className={mode === 'photo' ? 'tab tab-on' : 'tab'}
                onClick={() => setMode('photo')}
              >
                Photograph it
              </button>
            </div>

            {mode === 'type' ? (
              <div className="field-block">
                <label className="field-label" htmlFor="stemma-answer">Your answer</label>
                <div className="editor">
                  <textarea
                    id="stemma-answer"
                    spellCheck={false}
                    placeholder="Write or paste your answer here."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <div className="editor-foot">
                    <span className="editor-meta">{plural(words, 'word')}</span>
                    <span className="editor-meta">
                      {handedIn
                        ? 'Plain text only'
                        : draftState === 'saving'
                          ? 'Saving draft…'
                          : draftState === 'saved'
                            ? 'Draft saved'
                            : 'Plain text only'}
                    </span>
                  </div>
                </div>
                <span className="join-hint">
                  {handedIn
                    ? 'Your teacher already has the previous version. Nothing changes until you submit again.'
                    : 'Your work is saved as a draft as you type. Nothing reaches your teacher until you submit.'}
                </span>
              </div>
            ) : (
              <div className="field-block">
                <span className="field-label">Photo of your work</span>
                <div className={problem ? 'dropzone dropzone-bad' : 'dropzone'}>
                  <div className="dropzone-copy">
                    <span className="dropzone-title">Drop a photo of your handwritten pages</span>
                    <span className="dropzone-body">
                      JPG or PNG, one page per photo. Flat paper and even light read best.
                      Stemma keeps the photo and a transcription of it.
                    </span>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    hidden
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); }}
                  />
                  <button
                    type="button"
                    className="btn-ghost btn-md"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    {busy ? 'Reading photo…' : 'Choose a photo'}
                  </button>
                </div>
                {problem ? (
                  <div className="join-note" role="alert">
                    <span className="join-dot join-dot-accent" />
                    <span className="join-note-accent">{problem}</span>
                  </div>
                ) : (
                  <span className="join-hint">
                    Only the transcribed text is checked. Sending a photo submits it directly —
                    you can correct the text afterwards and submit again.
                  </span>
                )}
              </div>
            )}

            {mode === 'type' && (
              <div className="submit-actions">
                <button className="btn-solid btn-lg" disabled={busy || !text.trim()} onClick={onSubmitText}>
                  {busy ? 'Submitting' : handedIn ? 'Replace submission' : 'Submit work'}
                </button>
                <span className="join-hint">
                  {problem ?? 'You can replace this until the due date.'}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="composer">
            <div className="submitted-card">
              <div className="join-success-head">
                <div className="join-check">
                  <div className="join-check-blur" />
                  <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
                    <path d="M14 22.5 L19.5 28 L30 17" stroke="var(--vermilion-light)" strokeWidth="2.4" />
                  </svg>
                </div>
                <div className="stack-4">
                  <span className="h-26">Submitted</span>
                  <span className="submitted-meta">
                    {new Date(submission!.submitted_at!)
                      .toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                      .toUpperCase()}
                    {' · '}{submission!.source_type.toUpperCase()}
                    {' · '}{plural(countWords(submission!.raw_text), 'WORD').toUpperCase()}
                    {submission!.late && ' · LATE'}
                  </span>
                </div>
              </div>
              <div className="row-rule" />
              <p className="submitted-body">
                {submission!.grade
                  ? 'Your teacher has marked this and returned it. The grade and any comment are on the submission page.'
                  : 'Your teacher has it. You can replace it any time before the deadline; the newest version is the one that counts.'}
              </p>
              <div className="join-success-actions">
                {submission!.grade ? (
                  <span className="join-hint">
                    This work has been marked, so it can no longer be replaced.
                  </span>
                ) : (
                  <button className="btn-ghost btn-md" onClick={() => setReplacing(true)}>
                    Replace submission
                  </button>
                )}
                {course && (
                  <Link to={`/student/classroom/${course.id}`} className="join-textlink">
                    Back to {course.name}
                  </Link>
                )}
              </div>
            </div>

            <div className="stack-12">
              <h2 className="h-20">What you sent</h2>
              <p className="sent-text">{submission!.raw_text}</p>
            </div>
          </div>
        )}
      </div>

      <aside className="submit-rail">
        <div className="status-card">
          <div className="status-line">
            <span className="join-dot join-dot-accent" />
            <span className="status-label">{handedIn ? 'Submitted' : 'Not submitted'}</span>
          </div>
          <div className="stack-5">
            <span className="status-headline">
              {handedIn
                ? submission?.grade
                  ? 'Marked and returned'
                  : "In your teacher's hands"
                : 'Not handed in yet'}
            </span>
            <span className="status-detail">
              {handedIn
                ? submission?.grade
                  ? 'Marked and returned. It can no longer be replaced.'
                  : 'Replace it any time before the deadline; the newest version is the one that counts.'
                : assignment.due_at
                  ? `Due ${new Date(assignment.due_at).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true })}. Late work still uploads, but it is flagged as late.`
                  : 'No deadline has been set for this assignment.'}
            </span>
          </div>
        </div>

        <div className="stack-16">
          <h2 className="h-20">If something matches</h2>
          <div className="verdicts">
            {VERDICTS.map(([phase, title, body]) => (
              <div key={phase} className="verdict">
                <div className="verdict-glow" />
                <div className="verdict-disc">
                  <div className="verdict-disc-blur" />
                  <Mark size={64} phase={phase} stroke={2.6} base="var(--bone)" accent="var(--vermilion-light)" />
                </div>
                <div className="stack-3">
                  <span className="verdict-title">{title}</span>
                  <span className="verdict-body">{body}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>,
  );
}
