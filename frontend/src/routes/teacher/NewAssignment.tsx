import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { teacherApi } from '../../api/teacher';
import { ApiError } from '../../api/client';
import { Shell } from '../../components/Shell';
import { ATTACHMENT_ACCEPT, attachmentProblem, fileSize } from '../../lib/attachments';
import { toIstIso } from '../../lib/dates';

/* Title, instructions and a handout, deadline, mark scheme, threshold.

   The deadline input is datetime-local, which yields a naive "2026-09-12T17:00"
   with no zone. Django reads a naive string as UTC, so sending it unchanged
   would move every deadline 5h30m earlier. toIstIso() appends +05:30 — this is
   the front-end half of the timezone decision in design/NEXT.md.

   similarity_threshold is shown because it is per-assignment and it moves on
   its own: confirming or dismissing a verdict raises it (never lowers it,
   capped at 0.8). A teacher who sets it once and sees it change later should
   have seen the field in the first place. */

export default function NewAssignment() {
  const { courseId } = useParams();
  const id = Number(courseId);
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dueAt, setDueAt] = useState('');
  const [maxScore, setMaxScore] = useState('20');
  const [threshold, setThreshold] = useState('0.25');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    const score = Number(maxScore);
    const thr = Number(threshold);
    if (!title.trim()) return setError('Give the assignment a title.');
    if (!Number.isFinite(score) || score <= 0) return setError('Marks must be a number above zero.');
    if (!Number.isFinite(thr) || thr <= 0 || thr >= 1) return setError('Threshold must be between 0 and 1.');

    setBusy(true);
    setError(null);
    try {
      const created = await teacherApi.createAssignment(
        {
          course: id,
          title: title.trim(),
          description: description.trim(),
          due_at: dueAt ? toIstIso(dueAt) : null,
          max_score: score,
          similarity_threshold: thr,
        },
        file,
      );
      navigate(`/teacher/assignment/${created.id}`, { replace: true });
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as Record<string, unknown> | null) : null;
      const attachmentError = Array.isArray(body?.attachment) ? String(body.attachment[0]) : null;
      if (attachmentError) setFileError(attachmentError);
      setError(
        attachmentError
          ? 'The assignment was not set. Fix the attachment and try again.'
          : err instanceof ApiError
            ? 'The server rejected this assignment.'
            : 'Could not reach the server.',
      );
      setBusy(false);
    }
  }

  function pickFile(picked: File | null) {
    setFileError(picked ? attachmentProblem(picked) : null);
    setFile(picked && !attachmentProblem(picked) ? picked : null);
  }

  return (
    <Shell id="t-newassign">
      <Link to={`/teacher/course/${id}`} className="backlink" style={{ color: 'var(--bone-55)', fontSize: 13.5 }}>
        ← Back to class
      </Link>

      <span className="eyebrow" style={{ display: 'block', marginTop: 14 }}>New work</span>
      <h1 style={{ fontSize: 'var(--text-page)', margin: '8px 0 28px' }}>Set an assignment</h1>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 22, maxWidth: 560 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <label className="field-label" htmlFor="title">Title</label>
          <input
            id="title" className="input" value={title} autoFocus
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <label className="field-label" htmlFor="description">Instructions (optional)</label>
          <textarea
            id="description" className="input" rows={6} maxLength={10000} value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ resize: 'vertical', lineHeight: 1.55 }}
          />
          <p style={{ margin: 0, color: 'var(--bone-55)', fontSize: 13 }}>
            Students see this above where they hand in. Line breaks are kept and links become clickable.
          </p>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <label className="field-label" htmlFor="attachment">Attachment (optional)</label>
          {file ? (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                border: '1px solid var(--bone-18)', borderRadius: 'var(--radius-input)',
              }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file.name}
              </span>
              <span style={{ color: 'var(--bone-55)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>{fileSize(file.size)}</span>
              <button
                type="button" onClick={() => pickFile(null)}
                style={{ background: 'none', border: 'none', color: 'var(--bone-66)', cursor: 'pointer', fontSize: 14, padding: 0 }}
              >
                Remove
              </button>
            </div>
          ) : (
            <input
              id="attachment" type="file" accept={ATTACHMENT_ACCEPT}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              style={{ color: 'var(--bone-66)' }}
            />
          )}
          {fileError && <span className="error">{fileError}</span>}
          <p style={{ margin: 0, color: 'var(--bone-55)', fontSize: 13 }}>
            A PDF, JPG or PNG up to 10 MB: the question sheet, notes or a photo of the board. Only this class can open it.
          </p>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <label className="field-label" htmlFor="due">Deadline (IST)</label>
          <input
            id="due" type="datetime-local" className="input" value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
          <p style={{ margin: 0, color: 'var(--bone-55)', fontSize: 13 }}>
            Leave empty for no deadline. Work handed in after this is marked late.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <label className="field-label" htmlFor="max">Out of</label>
            <input
              id="max" type="number" min="1" step="1" className="input" value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
            />
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <label className="field-label" htmlFor="thr">Flag above</label>
            <input
              id="thr" type="number" min="0.05" max="0.95" step="0.05" className="input" value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </div>
        </div>
        <p style={{ margin: '-8px 0 0', color: 'var(--bone-55)', fontSize: 13 }}>
          Pairs overlapping more than this go to review. It rises on its own as you
          dismiss false flags in this class.
        </p>

        {error && <p className="error">{error}</p>}

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Setting…' : 'Set assignment'}
          </button>
          <Link to={`/teacher/course/${id}`} className="btn btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            Cancel
          </Link>
        </div>
      </form>
    </Shell>
  );
}
