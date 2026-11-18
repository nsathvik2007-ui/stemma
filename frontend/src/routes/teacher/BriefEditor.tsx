import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { teacherApi } from '../../api/teacher';
import type { Assignment } from '../../api/types';
import { ATTACHMENT_ACCEPT, attachmentProblem, fileSize } from '../../lib/attachments';

/* Editing an assignment's instructions and handout after it is set: the
   description, plus keep, replace or remove the file. The server deletes a
   replaced or removed file, so there is nothing to clean up here. */

export default function BriefEditor({
  assignment,
  onSaved,
  onCancel,
}: {
  assignment: Assignment;
  onSaved: (updated: Assignment) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState(assignment.description);
  const [file, setFile] = useState<File | null>(null);
  const [remove, setRemove] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickFile(picked: File | null) {
    const problem = picked ? attachmentProblem(picked) : null;
    setFileError(problem);
    setFile(picked && !problem ? picked : null);
    if (picked && !problem) setRemove(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await teacherApi.updateBrief(assignment.id, {
        description: description.trim(),
        file,
        removeAttachment: remove,
      });
      onSaved(updated);
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as Record<string, unknown> | null) : null;
      if (Array.isArray(body?.attachment)) setFileError(String(body.attachment[0]));
      setError('The changes were not saved. Try again.');
      setBusy(false);
    }
  }

  const link = {
    background: 'none', border: 'none', color: 'var(--bone-66)', cursor: 'pointer', fontSize: 14, padding: 0,
  } as const;
  const row = {
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
    border: '1px solid var(--bone-18)', borderRadius: 'var(--radius-input)',
  } as const;

  return (
    <form
      onSubmit={onSubmit}
      style={{
        display: 'grid', gap: 18, padding: 22, marginBottom: 28,
        background: 'var(--rail)', border: '1px solid var(--bone-18)',
        borderRadius: 'var(--radius-card)', backdropFilter: 'blur(12px)',
      }}
    >
      <div style={{ display: 'grid', gap: 8 }}>
        <label className="field-label" htmlFor="brief-description">Instructions</label>
        <textarea
          id="brief-description" className="input" rows={6} maxLength={10000} value={description}
          onChange={(e) => setDescription(e.target.value)} style={{ resize: 'vertical', lineHeight: 1.55 }}
        />
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <span className="field-label">Attachment</span>
        {file ? (
          <div style={row}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file.name}
            </span>
            <span style={{ color: 'var(--bone-55)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>{fileSize(file.size)}</span>
            <button type="button" style={link} onClick={() => pickFile(null)}>Don't replace</button>
          </div>
        ) : assignment.has_attachment && !remove ? (
          <div style={row}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {assignment.attachment_name}
            </span>
            <label style={{ ...link, color: 'var(--bone)' }}>
              Replace
              <input
                type="file" accept={ATTACHMENT_ACCEPT} style={{ display: 'none' }}
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button type="button" style={link} onClick={() => setRemove(true)}>Remove</button>
          </div>
        ) : (
          <>
            {remove && (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--bone-66)' }}>
                {assignment.attachment_name} will be removed when you save.{' '}
                <button type="button" style={{ ...link, color: 'var(--bone)' }} onClick={() => setRemove(false)}>Undo</button>
              </p>
            )}
            <input
              type="file" accept={ATTACHMENT_ACCEPT} aria-label="Attach a file"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)} style={{ color: 'var(--bone-66)' }}
            />
          </>
        )}
        {fileError && <span className="error">{fileError}</span>}
        <span style={{ fontSize: 13, color: 'var(--bone-55)' }}>PDF, JPG or PNG, up to 10 MB.</span>
      </div>

      {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}
