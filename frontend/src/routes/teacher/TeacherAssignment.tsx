import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { teacherApi } from '../../api/teacher';
import type { Assignment, Submission, SubmissionPair } from '../../api/types';
import { Empty, Shell, Skeleton } from '../../components/Shell';
import { AssignmentBrief } from '../../components/AssignmentBrief';
import { dateAndTime } from '../../lib/dates';
import BriefEditor from './BriefEditor';
import PaperUpload from './PaperUpload';

/* One assignment: who handed in, and what the scan found.

   The integrity rail is the reason this screen exists. Two buttons, two stages,
   deliberately separate:

     Scan    POST /analyze/  SQL candidates then Jaccard. Free, local, fast.
     Review  POST /review/   Groq, and only on pairs over the threshold.

   Keeping them apart is the architecture, not a UI accident: the cheap pass
   runs over everything, the paid one over a handful. Both are synchronous, so
   both buttons are disabled while in flight rather than optimistic — a second
   scan mid-scan would double the work for the same answer. */

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export default function TeacherAssignment() {
  const { assignmentId } = useParams();
  const id = Number(assignmentId);

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [pairs, setPairs] = useState<SubmissionPair[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [busy, setBusy] = useState<null | 'scan' | 'review'>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingBrief, setEditingBrief] = useState(false);

  const load = useCallback(() => {
    return Promise.all([teacherApi.assignments(), teacherApi.submissions(), teacherApi.assignmentPairs(id)])
      .then(([as, subs, prs]) => {
        setAssignment(as.find((a) => a.id === id) ?? null);
        setSubmissions(subs.filter((s) => s.assignment === id));
        setPairs(prs);
      })
      .catch(() => setError('Could not load this assignment.'));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function scan() {
    setBusy('scan');
    setNotice(null);
    try {
      const res = await teacherApi.analyze(id);
      await load();
      setNotice(`Scan complete. ${res.pairs_computed} pair${res.pairs_computed === 1 ? '' : 's'} compared.`);
    } catch {
      setNotice('The scan did not finish.');
    } finally {
      setBusy(null);
    }
  }

  async function review() {
    setBusy('review');
    setNotice(null);
    try {
      const res = await teacherApi.review(id);
      await load();
      const n = res.reviewed.length;
      setNotice(
        n === 0
          ? 'Nothing over the threshold to review.'
          : `${n} pair${n === 1 ? '' : 's'} reviewed${res.failed.length ? `, ${res.failed.length} failed` : ''}.`,
      );
    } catch {
      setNotice('The review did not finish.');
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <Shell id="t-assign">
        <p className="error">{error}</p>
      </Shell>
    );
  }

  const handedIn = submissions?.filter((s) => s.submitted_at) ?? [];
  const drafts = submissions?.filter((s) => !s.submitted_at) ?? [];
  const flagged = pairs?.filter((p) => p.ai_review) ?? [];

  return (
    <Shell id="t-assign">
      <Link
        to={assignment ? `/teacher/course/${assignment.course}` : '/teacher'}
        className="backlink"
        style={{ color: 'var(--bone-55)', fontSize: 13.5 }}
      >
        ← Back to class
      </Link>

      <span className="eyebrow" style={{ display: 'block', marginTop: 14 }}>Assignment</span>
      <h1 style={{ fontSize: 'var(--text-page)', margin: '8px 0 6px' }}>
        {assignment ? assignment.title : 'Loading…'}
      </h1>
      {assignment && (
        <p style={{ margin: '0 0 22px', color: 'var(--bone-55)' }}>
          {dateAndTime(assignment.due_at)} · out of {assignment.max_score} · flags above{' '}
          {pct(assignment.similarity_threshold)}
        </p>
      )}

      {assignment && editingBrief && (
        <BriefEditor
          assignment={assignment}
          onSaved={(updated) => {
            setAssignment(updated);
            setEditingBrief(false);
          }}
          onCancel={() => setEditingBrief(false)}
        />
      )}
      {assignment && !editingBrief && (
        <div style={{ display: 'grid', gap: 12, marginBottom: 28, maxWidth: 760 }}>
          <AssignmentBrief
            key={assignment.attachment_name ?? 'none'}
            description={assignment.description}
            attachment={
              assignment.attachment_name && assignment.attachment_type
                ? { name: assignment.attachment_name, type: assignment.attachment_type }
                : null
            }
            load={() => teacherApi.attachment(id)}
          />
          <button className="btn btn-secondary" style={{ justifySelf: 'start' }} onClick={() => setEditingBrief(true)}>
            {assignment.description || assignment.has_attachment ? 'Edit instructions' : 'Add instructions or a file'}
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 24, alignItems: 'start' }}>
        <section>
          <h2 style={{ fontSize: 'var(--text-section)', marginBottom: 16 }}>
            Handed in {submissions && <span style={{ color: 'var(--bone-55)' }}>({handedIn.length})</span>}
          </h2>

          {!submissions && <Skeleton />}
          {submissions && handedIn.length === 0 && (
            <Empty title="Nothing handed in yet" hint="Submissions appear here as students hand their work in." />
          )}

          {handedIn.length > 0 && (
            <div style={{ border: '1px solid var(--bone-18)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
              {handedIn.map((s, i) => (
                <Link
                  key={s.id}
                  to={`/teacher/submission/${s.id}`}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 16, alignItems: 'center',
                    padding: '16px 20px', background: 'var(--rail)', textDecoration: 'none', color: 'inherit',
                    borderTop: i === 0 ? 'none' : '1px solid var(--bone-18)',
                  }}
                >
                  <span>
                    {s.student_name}
                    {s.late && (
                      <span className="eyebrow" style={{ color: 'var(--vermilion)', marginLeft: 10 }}>Late</span>
                    )}
                  </span>
                  <span className="eyebrow">{s.source_type === 'handwritten' ? 'Photo' : 'Typed'}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, minWidth: 74, textAlign: 'right' }}>
                    {s.grade ? `${s.grade.score}/${s.grade.max_score}` : <span style={{ color: 'var(--bone-55)' }}>Ungraded</span>}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {drafts.length > 0 && (
            <p style={{ marginTop: 14, color: 'var(--bone-55)', fontSize: 13.5 }}>
              {drafts.length} draft{drafts.length === 1 ? '' : 's'} in progress, not yet handed in. Drafts are not scanned.
            </p>
          )}

          {assignment && submissions && (
            <PaperUpload
              assignmentId={id}
              courseId={assignment.course}
              submissions={submissions}
              onUploaded={(name) => {
                load();
                setNotice(`Paper added for ${name}. Scan again to include it.`);
              }}
            />
          )}
        </section>

        <aside
          style={{
            background: 'var(--rail)', border: '1px solid var(--bone-18)',
            borderRadius: 'var(--radius-card)', padding: 22, display: 'grid', gap: 16,
            backdropFilter: 'blur(12px)', position: 'sticky', top: 24,
          }}
        >
          <div>
            <span className="eyebrow">Integrity</span>
            <p style={{ margin: '10px 0 0', fontFamily: 'var(--font-mono)', fontSize: 30 }}>
              {pairs ? flagged.length : '—'}
            </p>
            <p style={{ margin: '2px 0 0', color: 'var(--bone-55)', fontSize: 13.5 }}>
              flagged of {pairs?.length ?? 0} compared
            </p>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <button className="btn btn-secondary" onClick={scan} disabled={busy !== null}>
              {busy === 'scan' ? 'Scanning…' : 'Scan for overlap'}
            </button>
            <button className="btn btn-primary" onClick={review} disabled={busy !== null || !pairs?.length}>
              {busy === 'review' ? 'Reviewing…' : 'Review flagged'}
            </button>
          </div>

          {notice && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--bone-66)' }}>{notice}</p>}

          {flagged.length > 0 && (
            <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--bone-18)', paddingTop: 14 }}>
              {flagged.slice(0, 5).map((p) => (
                <Link
                  key={p.id}
                  to={`/teacher/pair/${p.id}`}
                  style={{ textDecoration: 'none', color: 'inherit', display: 'grid', gap: 2 }}
                >
                  <span style={{ fontSize: 14 }}>
                    {p.submission_a_name} · {p.submission_b_name}
                  </span>
                  <span className="eyebrow">
                    {pct(p.jaccard_similarity)} · {p.ai_review?.verdict}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </aside>
      </div>
    </Shell>
  );
}
