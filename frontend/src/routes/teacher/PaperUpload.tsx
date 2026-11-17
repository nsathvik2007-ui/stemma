import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { teacherApi } from '../../api/teacher';
import type { RosterEntry, Submission } from '../../api/types';

/* A paper handed in on paper: the teacher photographs it and it goes through
   the same OCR as a student's own photo.

   Picking the student from the roster links the submission to their account,
   so they see the grade and comment exactly as if they had uploaded it. The
   free-text name is only for someone with no account; their work is scanned
   and graded, but there is nobody to show it to. Students who have already
   handed in are left out of the list — the server refuses a second one. */

const NOT_ON_ROSTER = 'other';

export default function PaperUpload({
  assignmentId,
  courseId,
  submissions,
  onUploaded,
}: {
  assignmentId: number;
  courseId: number;
  submissions: Submission[];
  onUploaded: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [who, setWho] = useState('');
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || roster) return;
    teacherApi.roster(courseId).then(setRoster).catch(() => setRoster([]));
  }, [open, roster, courseId]);

  const handedIn = new Set(submissions.map((s) => s.student).filter((s): s is number => s !== null));
  const remaining = roster?.filter((r) => !handedIn.has(r.student_id)) ?? [];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file || !who) return;
    setBusy(true);
    setError(null);
    try {
      const onRoster = who !== NOT_ON_ROSTER;
      const sub = await teacherApi.upload(
        assignmentId,
        file,
        onRoster ? { studentId: Number(who) } : { studentName: name.trim() },
      );
      setOpen(false);
      setWho('');
      setName('');
      setFile(null);
      onUploaded(sub.student_name);
    } catch (err) {
      const detail = err instanceof ApiError ? (err.body as { detail?: unknown } | null)?.detail : null;
      setError(typeof detail === 'string' ? detail : 'The paper was not uploaded. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-secondary" onClick={() => setOpen(true)} style={{ marginTop: 14 }}>
        Upload a paper copy
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        marginTop: 14, padding: 22, display: 'grid', gap: 16,
        border: '1px solid var(--bone-18)', borderRadius: 'var(--radius-card)',
        background: 'var(--rail)', backdropFilter: 'blur(12px)',
      }}
    >
      <span className="eyebrow">Paper copy</span>

      <div style={{ display: 'grid', gap: 8 }}>
        <label className="field-label" htmlFor="paper-student">Whose work</label>
        <select
          id="paper-student" className="input" value={who} required
          onChange={(e) => setWho(e.target.value)} disabled={!roster}
        >
          <option value="" disabled>{roster ? 'Choose a student' : 'Loading the roster…'}</option>
          {remaining.map((r) => (
            <option key={r.student_id} value={r.student_id}>{r.name}</option>
          ))}
          <option value={NOT_ON_ROSTER}>Someone not on the roster</option>
        </select>
        {roster && remaining.length === 0 && roster.length > 0 && (
          <span style={{ fontSize: 13.5, color: 'var(--bone-55)' }}>Everyone on the roster has handed in.</span>
        )}
      </div>

      {who === NOT_ON_ROSTER && (
        <div style={{ display: 'grid', gap: 8 }}>
          <label className="field-label" htmlFor="paper-name">Their name</label>
          <input
            id="paper-name" className="input" value={name} required
            onChange={(e) => setName(e.target.value)}
          />
          <span style={{ fontSize: 13.5, color: 'var(--bone-55)' }}>
            Without an account they won't see the grade. Add them to the roster first if they should.
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        <label className="field-label" htmlFor="paper-photo">Photo of the page</label>
        <input
          id="paper-photo" type="file" accept="image/*" required
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ color: 'var(--bone-66)' }}
        />
      </div>

      {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" disabled={busy || !file || !who}>
          {busy ? 'Reading the photo…' : 'Upload'}
        </button>
        <button
          type="button" className="btn btn-secondary" disabled={busy}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
