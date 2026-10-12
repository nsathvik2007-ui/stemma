import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { teacherApi } from '../../api/teacher';
import type { Assignment, PairOverlap, Submission, SubmissionPair } from '../../api/types';
import { Shell, Skeleton } from '../../components/Shell';
import { SubmissionPhoto } from '../../components/SubmissionPhoto';

/* The decision screen: verdict pinned left, the two texts scrolling right.

   Everything a teacher needs for this pair is on this page, because the
   alternative is three screens for one judgement — read here, ask for a
   verdict on the assignment page, mark on a third. So:

   - Review now       POST /pairs/{id}/review/   one pair, ignores the threshold
   - Confirm/Dismiss  POST /reviews/{id}/feedback/  moves similarity_threshold
   - Mark             POST /submissions/{id}/grade/ per submission, inline

   The explanation is rendered here and nowhere a student can reach: it names
   the other student. That is why the student and teacher route trees import
   different API modules. */

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/* Wraps each shared phrase where it appears. Case-insensitive because the
   scorer lowercases before shingling, so a phrase can come back in different
   case than the source. Longest first, so a short phrase nested inside a longer
   one does not split the longer match. */
function highlight(text: string, phrases: string[]): ReactNode[] {
  if (phrases.length === 0) return [text];

  const escaped = [...phrases]
    .sort((a, b) => b.length - a.length)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');

  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark
        key={i}
        style={{
          background: 'rgba(255, 90, 43, 0.22)',
          color: 'var(--bone)',
          borderBottom: '1px solid var(--vermilion)',
          padding: '1px 0',
        }}
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

/* The comparison is made on transcripts, and OCR is where transcripts go
   wrong — on sloped handwriting it can move whole words. So the page itself is
   one click away, fetched only when opened. */
function PhotoToggle({ submissionId, name }: { submissionId: number; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ justifySelf: 'start', padding: '8px 16px', minHeight: 0, fontSize: 14 }}
      >
        {open ? 'Hide handwritten page' : 'Show handwritten page'}
      </button>
      {open && (
        <SubmissionPhoto
          load={() => teacherApi.photo(submissionId)}
          caption="As handed in"
          alt={`Handwritten submission from ${name}`}
        />
      )}
    </div>
  );
}

/* Marking one of the two, without leaving the comparison. Same endpoint and
   the same bounds as the full marking screen. */
function GradeBox({
  submission,
  maxScore,
  onSaved,
}: {
  submission: Submission;
  maxScore: number;
  onSaved: () => void;
}) {
  const [score, setScore] = useState(submission.grade ? String(submission.grade.score) : '');
  const [comment, setComment] = useState(submission.grade?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    const n = Number(score);
    if (!Number.isFinite(n) || score.trim() === '') return setError('Enter a mark.');
    if (n < 0 || n > maxScore) return setError(`Mark must be between 0 and ${maxScore}.`);

    setBusy(true);
    setError(null);
    try {
      await teacherApi.grade(submission.id, n, comment);
      setSaved(true);
      onSaved();
    } catch {
      setError('Could not save that mark.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 12, padding: '16px 18px', background: 'var(--card)',
        border: '1px solid var(--bone-18)', borderRadius: 'var(--radius-card)',
        display: 'grid', gap: 12, backdropFilter: 'blur(12px)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: 12, alignItems: 'end' }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="field-label" htmlFor={`score-${submission.id}`}>
            Mark / {maxScore}
          </label>
          <input
            id={`score-${submission.id}`} type="number" step="0.5" min="0" max={maxScore}
            className="input" value={score}
            onChange={(e) => { setScore(e.target.value); setSaved(false); }}
          />
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="field-label" htmlFor={`comment-${submission.id}`}>
            Comment to the student
          </label>
          <input
            id={`comment-${submission.id}`} className="input" value={comment}
            onChange={(e) => { setComment(e.target.value); setSaved(false); }}
          />
        </div>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : submission.grade ? 'Update' : 'Save'}
        </button>
      </div>

      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
      {saved && !error && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--bone-66)' }}>
          Mark saved. The student sees this with their comment.
        </p>
      )}
      {!saved && !error && submission.grade && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--bone-55)' }}>
          Already marked {submission.grade.score}/{submission.grade.max_score}.
        </p>
      )}
    </div>
  );
}

export default function PairReview() {
  const { pairId } = useParams();
  const id = Number(pairId);

  const [pair, setPair] = useState<SubmissionPair | null>(null);
  const [overlap, setOverlap] = useState<PairOverlap | null>(null);
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [busy, setBusy] = useState<null | 'review' | 'decide'>(null);
  const [decided, setDecided] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const [rows, ov, subs, assigns] = await Promise.all([
      teacherApi.pairs(),
      teacherApi.overlap(id),
      teacherApi.submissions(),
      teacherApi.assignments(),
    ]);
    const found = rows.find((p) => p.id === id) ?? null;
    setPair(found);
    setOverlap(ov);
    setSubmissions(subs);
    setAssignment(found ? assigns.find((a) => a.id === found.assignment) ?? null : null);
    if (found?.ai_review) setDecided(found.ai_review.confirmed);
  }, [id]);

  useEffect(() => {
    load().catch(() => setError('Could not load this comparison.'));
  }, [load]);

  async function runReview() {
    setBusy('review');
    try {
      await teacherApi.reviewPair(id);
      await load();
    } catch {
      setError('The review did not finish.');
    } finally {
      setBusy(null);
    }
  }

  async function decide(confirmed: boolean) {
    if (!pair?.ai_review) return;
    setBusy('decide');
    try {
      await teacherApi.feedback(pair.ai_review.id, confirmed);
      setDecided(confirmed);
    } catch {
      setError('Could not record that decision.');
    } finally {
      setBusy(null);
    }
  }

  const phrases = useMemo(() => overlap?.shared_phrases ?? [], [overlap]);

  if (error) {
    return (
      <Shell id="t-pair">
        <p className="error">{error}</p>
      </Shell>
    );
  }
  if (!pair || !overlap || !submissions) {
    return (
      <Shell id="t-pair">
        <Skeleton rows={3} />
      </Shell>
    );
  }

  const review = pair.ai_review;
  const maxScore = assignment?.max_score ?? 20;
  const subA = submissions.find((s) => s.id === pair.submission_a);
  const subB = submissions.find((s) => s.id === pair.submission_b);

  return (
    <Shell id="t-pair">
      <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
        <Link to="/teacher/queue" className="backlink" style={{ color: 'var(--bone-55)', fontSize: 13.5 }}>
          ← Integrity queue
        </Link>
        <Link
          to={`/teacher/assignment/${pair.assignment}`}
          className="backlink"
          style={{ color: 'var(--bone-55)', fontSize: 13.5 }}
        >
          This assignment
        </Link>
      </div>

      <span className="eyebrow" style={{ display: 'block', marginTop: 14 }}>Comparison</span>
      <h1 style={{ fontSize: 'var(--text-page)', margin: '8px 0 6px' }}>
        {pair.submission_a_name} · {pair.submission_b_name}
      </h1>
      <p style={{ margin: '0 0 28px', color: 'var(--bone-55)' }}>
        {pair.course_name} · {pair.assignment_title}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
        <aside
          style={{
            background: 'var(--card)', border: '1px solid var(--bone-18)',
            borderRadius: 'var(--radius-card)', padding: 24, display: 'grid', gap: 20,
            backdropFilter: 'blur(12px)', position: 'sticky', top: 24,
          }}
        >
          <div>
            <span className="field-label">Overlap</span>
            <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-mono)', fontSize: 34 }}>
              {pct(pair.jaccard_similarity)}
            </p>
            <p style={{ margin: '2px 0 0', color: 'var(--bone-55)', fontSize: 13.5 }}>
              {pair.overlap_count} shared phrases
            </p>
          </div>

          {review ? (
            <>
              <div style={{ borderTop: '1px solid var(--bone-18)', paddingTop: 18 }}>
                <span className="field-label">Verdict</span>
                <p style={{ margin: '8px 0 0', fontSize: 20, fontFamily: 'var(--font-heading)', textTransform: 'capitalize' }}>
                  {review.verdict}
                </p>
                <p style={{ margin: '4px 0 0', color: 'var(--bone-55)', fontSize: 13.5 }}>
                  {Math.round(review.confidence * 100)}% confidence
                </p>
                <p style={{ margin: '14px 0 0', color: 'var(--bone-66)', fontSize: 14, lineHeight: 1.55 }}>
                  {review.explanation}
                </p>
              </div>

              <div style={{ borderTop: '1px solid var(--bone-18)', paddingTop: 18, display: 'grid', gap: 10 }}>
                {decided === null ? (
                  <>
                    <p style={{ margin: '0 0 4px', color: 'var(--bone-55)', fontSize: 13 }}>
                      Dismissing raises this class's flag threshold so the same overlap is not raised again.
                    </p>
                    <button className="btn btn-primary" onClick={() => decide(true)} disabled={busy !== null}>
                      {busy === 'decide' ? 'Saving…' : 'Confirm copying'}
                    </button>
                    <button className="btn btn-secondary" onClick={() => decide(false)} disabled={busy !== null}>
                      Dismiss as coincidence
                    </button>
                  </>
                ) : (
                  <>
                    <p style={{ margin: 0, fontSize: 14 }}>
                      {decided ? 'You confirmed this as copying.' : 'You dismissed this flag.'}
                    </p>
                    <button className="btn btn-secondary" onClick={() => decide(!decided)} disabled={busy !== null}>
                      {busy === 'decide' ? 'Saving…' : decided ? 'Change to dismissed' : 'Change to confirmed'}
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <div style={{ borderTop: '1px solid var(--bone-18)', paddingTop: 18, display: 'grid', gap: 12 }}>
              <span className="field-label">Verdict</span>
              <p style={{ margin: 0, color: 'var(--bone-66)', fontSize: 14, lineHeight: 1.55 }}>
                Not read yet. The overlap score alone cannot tell copying from two
                people writing the same required answer.
              </p>
              <button className="btn btn-primary" onClick={runReview} disabled={busy !== null}>
                {busy === 'review' ? 'Reading…' : 'Review now'}
              </button>
            </div>
          )}
        </aside>

        <section style={{ display: 'grid', gap: 28 }}>
          {(
            [
              [pair.submission_a_name, overlap.text_a, subA],
              [pair.submission_b_name, overlap.text_b, subB],
            ] as const
          ).map(([name, text, sub]) => (
            <article key={name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <span className="field-label">{name}</span>
                {sub && (
                  <Link
                    to={`/teacher/submission/${sub.id}`}
                    style={{ color: 'var(--bone-55)', fontSize: 13, textDecoration: 'none' }}
                  >
                    Open full submission →
                  </Link>
                )}
              </div>

              <div
                style={{
                  marginTop: 8, padding: '22px 26px', background: 'var(--rail)',
                  border: '1px solid var(--bone-18)', borderRadius: 'var(--radius-card)',
                  fontFamily: 'var(--font-doc)', fontSize: 'var(--text-doc)',
                  lineHeight: 'var(--leading-doc)', whiteSpace: 'pre-wrap',
                }}
              >
                {highlight(text, phrases)}
              </div>

              {sub?.has_image && <PhotoToggle submissionId={sub.id} name={name} />}

              {sub && (
                <GradeBox
                  key={`${sub.id}-${sub.grade?.score ?? 'none'}`}
                  submission={sub}
                  maxScore={maxScore}
                  onSaved={() => { load().catch(() => undefined); }}
                />
              )}
            </article>
          ))}
        </section>
      </div>
    </Shell>
  );
}
