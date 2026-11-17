import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { teacherApi } from '../../api/teacher';
import type { AddStudentsError, AddStudentsResult, RosterEntry } from '../../api/types';
import { Empty, Skeleton } from '../../components/Shell';

/* The class list, and how students get accounts.

   Accounts are institution-issued (design/CLAUDE.md): there is no sign-up
   page. The teacher pastes the class — straight from a spreadsheet works —
   and each new student gets a temporary password to hand out. Those passwords
   are shown here once; the server keeps no readable copy, and each student
   must choose their own on first sign-in. A forgotten password comes back
   here too: Reset issues a new temporary one.

   Students who already have an account can still join with the code. */

const EMAIL = /[^\s<>,;"]+@[^\s<>,;"]+/;

/* One student per line, in whatever shape a spreadsheet or email client
   produces: "Name, email", "email, Name", "Name<TAB>email", "Name <email>",
   or a bare email. A header row ("Name, Email") is skipped. */
function parseClassList(text: string) {
  const rows: { name: string; email: string }[] = [];
  const problems: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const match = line.match(EMAIL);
    if (!match) {
      if (!/e-?mail/i.test(line)) problems.push(`Line ${i + 1} has no email address.`);
      return;
    }
    const name = line.replace(match[0], ' ').replace(/[<>\t,;"]/g, ' ').replace(/\s+/g, ' ').trim();
    rows.push({ name, email: match[0] });
  });
  return { rows, problems };
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

const mono = { fontFamily: 'var(--font-mono)', fontSize: 13 } as const;
const card = {
  border: '1px solid var(--bone-18)', borderRadius: 'var(--radius-card)',
  background: 'var(--rail)', backdropFilter: 'blur(12px)',
} as const;

export default function RosterTab({ courseId, joinCode }: { courseId: number; joinCode?: string }) {
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [result, setResult] = useState<AddStudentsResult | null>(null);
  const [copied, setCopied] = useState(false);

  /* Reset is two clicks: the first arms it, the second issues the password.
     A reset immediately stops the student's current password working. */
  const [armed, setArmed] = useState<number | null>(null);
  const [resetting, setResetting] = useState<number | null>(null);
  const [issued, setIssued] = useState<Record<number, string>>({});
  const [resetError, setResetError] = useState<string | null>(null);

  const load = useCallback(() => {
    teacherApi
      .roster(courseId)
      .then(setRoster)
      .catch(() => setLoadError('Could not load the roster.'));
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addClass() {
    const { rows, problems: parseProblems } = parseClassList(text);
    if (parseProblems.length || rows.length === 0) {
      setProblems(parseProblems.length ? parseProblems : ['Paste at least one name and email.']);
      return;
    }
    setProblems([]);
    setBusy(true);
    try {
      const res = await teacherApi.addStudents(courseId, rows);
      setResult(res);
      setCopied(false);
      setText('');
      setAdding(false);
      load();
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { errors?: AddStudentsError[] } | null) : null;
      setProblems(
        body?.errors?.length
          ? [
              ...body.errors.map((e) => (e.email ? `${e.email}: ${e.detail}` : e.detail)),
              'Nothing was added. Fix these and try again.',
            ]
          : ['The class was not added. Try again.'],
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyPasswords() {
    if (!result) return;
    const lines = result.created.map((a) => `${a.name}\t${a.email}\t${a.temporary_password}`);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function reset(studentId: number) {
    setResetting(studentId);
    setResetError(null);
    try {
      const account = await teacherApi.resetPassword(courseId, studentId);
      setIssued((m) => ({ ...m, [studentId]: account.temporary_password }));
    } catch {
      setResetError('The password was not reset. Try again.');
    } finally {
      setArmed(null);
      setResetting(null);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: 'var(--bone-66)' }}>
          {roster ? plural(roster.length, 'student') : ' '}
          {joinCode && (
            <span style={{ color: 'var(--bone-55)' }}>
              {' '}· anyone who already has an account can also join with <span style={mono}>{joinCode}</span>
            </span>
          )}
        </p>
        {!adding && (
          <button className="btn btn-secondary" onClick={() => setAdding(true)}>
            Add students
          </button>
        )}
      </div>

      {adding && (
        <div style={{ ...card, padding: 24, display: 'grid', gap: 14 }}>
          <label className="field-label" htmlFor="class-list">Add students</label>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--bone-66)', textWrap: 'pretty' }}>
            One student per line: their name and college email. You can paste two columns straight from a
            spreadsheet. Anyone without an account gets one, with a temporary password for you to hand out.
          </p>
          <textarea
            id="class-list"
            className="input"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Priya Sharma, priya.s@college.edu\nArjun Rao, arjun.rao@college.edu'}
            style={{ ...mono, fontSize: 14, resize: 'vertical' }}
            aria-describedby={problems.length ? 'class-list-problems' : undefined}
          />
          {problems.length > 0 && (
            <ul id="class-list-problems" className="error" role="alert" style={{ margin: 0, paddingLeft: 18 }}>
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={addClass} disabled={busy}>
              {busy ? 'Adding…' : 'Add to class'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setAdding(false);
                setProblems([]);
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <div style={{ ...card, padding: 24, display: 'grid', gap: 14, borderColor: 'var(--vermilion)' }}>
          <div>
            <span className="eyebrow">Added</span>
            <p style={{ margin: '8px 0 0', textWrap: 'pretty' }}>
              {[
                result.created.length && `${plural(result.created.length, 'new account')} created`,
                result.enrolled.length && `${plural(result.enrolled.length, 'existing student')} enrolled`,
                result.already_enrolled.length && `${result.already_enrolled.length} already in this class`,
              ]
                .filter(Boolean)
                .join(' · ')}
              .
            </p>
          </div>

          {result.created.length > 0 && (
            <>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--bone-66)', textWrap: 'pretty' }}>
                <strong style={{ color: 'var(--bone)' }}>These passwords are shown only now.</strong> Give each
                student theirs; they will choose their own the first time they sign in.
              </p>
              <div style={{ border: '1px solid var(--bone-18)', borderRadius: 'var(--radius-input)', overflow: 'hidden' }}>
                {result.created.map((a, i) => (
                  <div
                    key={a.email}
                    style={{
                      display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr) auto', gap: 16,
                      padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--bone-18)',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
                    <span style={{ ...mono, color: 'var(--bone-55)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.email}</span>
                    <span style={{ ...mono, fontSize: 15, letterSpacing: '0.04em' }}>{a.temporary_password}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {result.created.length > 0 && (
              <button className="btn btn-secondary" onClick={copyPasswords}>
                {copied ? 'Copied' : 'Copy all'}
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => setResult(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {loadError && <p className="error">{loadError}</p>}
      {resetError && <p className="error" role="alert">{resetError}</p>}
      {!roster && !loadError && <Skeleton rows={4} />}
      {roster?.length === 0 && (
        <Empty
          title="Nobody is in this class yet"
          hint={`Add students above, or share the join code ${joinCode ?? ''} with anyone who already has an account.`}
        />
      )}
      {roster && roster.length > 0 && (
        <div style={{ border: '1px solid var(--bone-18)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
          {roster.map((r, i) => (
            <div
              key={r.id}
              style={{
                display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto', gap: 16, alignItems: 'center',
                padding: '14px 24px', background: 'var(--rail)',
                borderTop: i === 0 ? 'none' : '1px solid var(--bone-18)',
              }}
            >
              <span>{r.name}</span>
              <span style={{ ...mono, color: 'var(--bone-55)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.email || '—'}
              </span>
              {issued[r.student_id] ? (
                <span style={{ textAlign: 'right' }}>
                  <span className="eyebrow" style={{ display: 'block' }}>New password</span>
                  <span style={{ ...mono, fontSize: 15 }}>{issued[r.student_id]}</span>
                </span>
              ) : armed === r.student_id ? (
                <span style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    style={{ padding: '7px 14px', minHeight: 0, fontSize: 14 }}
                    onClick={() => reset(r.student_id)}
                    disabled={resetting !== null}
                  >
                    {resetting === r.student_id ? 'Resetting…' : 'Confirm reset'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '7px 14px', minHeight: 0, fontSize: 14 }}
                    onClick={() => setArmed(null)}
                    disabled={resetting !== null}
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  className="btn btn-secondary"
                  style={{ padding: '7px 14px', minHeight: 0, fontSize: 14 }}
                  onClick={() => setArmed(r.student_id)}
                  title="Issue a new temporary password. Their current one stops working."
                >
                  Reset password
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
