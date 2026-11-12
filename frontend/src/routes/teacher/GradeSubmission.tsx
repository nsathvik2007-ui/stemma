import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { teacherApi } from '../../api/teacher';
import { ApiError } from '../../api/client';
import type { Assignment, Submission } from '../../api/types';
import { Shell, Skeleton } from '../../components/Shell';
import { SubmissionPhoto } from '../../components/SubmissionPhoto';
import { dateAndTime } from '../../lib/dates';

/* Marking, with the photo beside the transcription.

   Both are shown for a handwritten submission on purpose. OCR reads cursive
   well enough to compare but not perfectly — it misreads names and characters,
   and some engines move whole words out of order on sloped lines. Marking from the
   transcription alone would mark the OCR rather than the student, so the
   original page sits next to it.

   The score is validated against assignment.max_score before the request. The
   backend enforces the same bound; this is only so the teacher hears about it
   without a round trip. */

export default function GradeSubmission() {
  const { submissionId } = useParams();
  const id = Number(submissionId);

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [score, setScore] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([teacherApi.submissions(), teacherApi.assignments()])
      .then(([subs, as]) => {
        if (cancelled) return;
        const s = subs.find((x) => x.id === id) ?? null;
        setSubmission(s);
        setAssignment(s ? as.find((a) => a.id === s.assignment) ?? null : null);
        if (s?.grade) {
          setScore(String(s.grade.score));
          setComment(s.grade.comment);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this submission.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !assignment) return;

    const n = Number(score);
    if (!Number.isFinite(n)) return setFormError('Enter a mark.');
    if (n < 0 || n > assignment.max_score) {
      return setFormError(`Mark must be between 0 and ${assignment.max_score}.`);
    }

    setBusy(true);
    setFormError(null);
    try {
      await teacherApi.grade(id, n, comment);
      setSaved(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? 'The server rejected this mark.' : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <Shell id="t-grade">
        <p className="error">{error}</p>
      </Shell>
    );
  }
  if (!submission) {
    return (
      <Shell id="t-grade">
        <Skeleton rows={2} />
      </Shell>
    );
  }

  return (
    <Shell id="t-grade">
      <Link
        to={`/teacher/assignment/${submission.assignment}`}
        className="backlink"
        style={{ color: 'var(--bone-55)', fontSize: 13.5 }}
      >
        ← Back to assignment
      </Link>

      <span className="eyebrow" style={{ display: 'block', marginTop: 14 }}>Marking</span>
      <h1 style={{ fontSize: 'var(--text-page)', margin: '8px 0 6px' }}>{submission.student_name}</h1>
      <p style={{ margin: '0 0 28px', color: 'var(--bone-55)' }}>
        {assignment?.title} · handed in {dateAndTime(submission.submitted_at)}
        {submission.late && <span style={{ color: 'var(--vermilion)' }}> · late</span>}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 24, alignItems: 'start' }}>
        <section style={{ display: 'grid', gap: 20 }}>
          {submission.has_image && (
            <SubmissionPhoto
              load={() => teacherApi.photo(submission.id)}
              caption="The page as handed in"
              alt={`Handwritten submission from ${submission.student_name}`}
            />
          )}

          <div>
            <span className="field-label">
              {submission.source_type === 'handwritten' ? 'Transcription' : 'Submitted text'}
            </span>
            <div
              style={{
                marginTop: 8, padding: '20px 24px', background: 'var(--rail)',
                border: '1px solid var(--bone-18)', borderRadius: 'var(--radius-card)',
                fontFamily: 'var(--font-doc)', fontSize: 'var(--text-doc)',
                lineHeight: 'var(--leading-doc)', whiteSpace: 'pre-wrap',
              }}
            >
              {submission.raw_text}
            </div>
            {submission.source_type === 'handwritten' && (
              <p style={{ margin: '8px 0 0', color: 'var(--bone-55)', fontSize: 13 }}>
                {submission.has_image
                  ? 'Read by OCR. Check it against the page above before marking.'
                  : 'Read by OCR. No photo was kept for this submission, so this transcription is all there is.'}
              </p>
            )}
          </div>
        </section>

        <form
          onSubmit={onSubmit}
          style={{
            background: 'var(--card)', border: '1px solid var(--bone-18)',
            borderRadius: 'var(--radius-card)', padding: 22, display: 'grid', gap: 18,
            backdropFilter: 'blur(12px)', position: 'sticky', top: 24,
          }}
        >
          <div style={{ display: 'grid', gap: 8 }}>
            <label className="field-label" htmlFor="score">
              Mark {assignment && `(out of ${assignment.max_score})`}
            </label>
            <input
              id="score" type="number" step="0.5" min="0" max={assignment?.max_score}
              className="input" value={score}
              onChange={(e) => { setScore(e.target.value); setSaved(false); }}
            />
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <label className="field-label" htmlFor="comment">Comment</label>
            <textarea
              id="comment" className="input" rows={5} value={comment}
              onChange={(e) => { setComment(e.target.value); setSaved(false); }}
              style={{ resize: 'vertical', fontFamily: 'var(--font-body)' }}
            />
            <p style={{ margin: 0, color: 'var(--bone-55)', fontSize: 13 }}>
              The student sees this with their mark.
            </p>
          </div>

          {formError && <p className="error">{formError}</p>}
          {saved && !formError && (
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--bone-66)' }}>Mark saved.</p>
          )}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : submission.grade ? 'Update mark' : 'Save mark'}
          </button>
        </form>
      </div>
    </Shell>
  );
}
