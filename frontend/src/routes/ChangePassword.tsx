import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { accountApi } from '../api/account';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Shell } from '../components/Shell';

/* Both roles, two situations.

   Forced: the account is on a password a teacher issued (adding the class, or
   a reset). The teacher has seen it, so nothing else opens until the student
   chooses their own — App.tsx routes everything here.

   Voluntary: reached from the app bar at any time.

   The rules shown are Django's validators, which the server applies; the
   client checks only that the two new entries match. */

type FieldErrors = { current?: string; next?: string; confirm?: string; form?: string };

function firstMessage(value: unknown): string | undefined {
  return Array.isArray(value) && typeof value[0] === 'string' ? value.join(' ') : undefined;
}

export default function ChangePassword() {
  const { mustChangePassword, passwordChanged } = useAuth();
  const nav = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setErrors({ confirm: 'The two new passwords are different.' });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await accountApi.changePassword(current, next);
      passwordChanged();
      nav('/', { replace: true });
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as Record<string, unknown> | null) : null;
      setErrors({
        current: firstMessage(body?.current_password),
        next: firstMessage(body?.new_password),
        form:
          body && typeof body.detail === 'string'
            ? body.detail
            : body?.current_password || body?.new_password
              ? undefined
              : 'The password was not changed. Try again.',
      });
      setBusy(false);
    }
  }

  return (
    <Shell id="password">
      {!mustChangePassword && (
        <Link to="/" className="backlink" style={{ color: 'var(--bone-55)', fontSize: 13.5 }}>
          ← Back
        </Link>
      )}

      <div style={{ maxWidth: 520, marginTop: 14 }}>
        <span className="eyebrow">Account</span>
        <h1 style={{ fontSize: 'var(--text-page)', margin: '8px 0 10px' }}>
          {mustChangePassword ? 'Choose your own password' : 'Change password'}
        </h1>
        <p style={{ margin: '0 0 28px', color: 'var(--bone-66)', textWrap: 'pretty' }}>
          {mustChangePassword
            ? 'You signed in with a temporary password from your teacher. Choose one only you know before you continue.'
            : 'You will stay signed in on this device.'}
        </p>

        <form
          onSubmit={onSubmit}
          style={{
            display: 'grid', gap: 20, padding: 28, background: 'var(--rail)',
            border: '1px solid var(--bone-18)', borderRadius: 'var(--radius-card)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div style={{ display: 'grid', gap: 8 }}>
            <label className="field-label" htmlFor="pw-current">
              {mustChangePassword ? 'Temporary password' : 'Current password'}
            </label>
            <input
              id="pw-current" className="input" type="password" autoComplete="current-password"
              value={current} onChange={(e) => setCurrent(e.target.value)} required
              aria-invalid={!!errors.current} aria-describedby={errors.current ? 'pw-current-error' : undefined}
            />
            {errors.current && <span id="pw-current-error" className="error">{errors.current}</span>}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <label className="field-label" htmlFor="pw-new">New password</label>
            <input
              id="pw-new" className="input" type="password" autoComplete="new-password"
              value={next} onChange={(e) => setNext(e.target.value)} required
              aria-invalid={!!errors.next} aria-describedby="pw-new-hint"
            />
            <span id="pw-new-hint" style={{ fontSize: 13.5, color: 'var(--bone-55)' }}>
              At least 8 characters. Not a common password, not all numbers, and not close to your email.
            </span>
            {errors.next && <span className="error">{errors.next}</span>}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <label className="field-label" htmlFor="pw-confirm">New password, again</label>
            <input
              id="pw-confirm" className="input" type="password" autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} required
              aria-invalid={!!errors.confirm}
            />
            {errors.confirm && <span className="error">{errors.confirm}</span>}
          </div>

          {errors.form && <p className="error" role="alert" style={{ margin: 0 }}>{errors.form}</p>}

          <button className="btn btn-primary" disabled={busy} style={{ justifySelf: 'start' }}>
            {busy ? 'Saving…' : mustChangePassword ? 'Save and continue' : 'Change password'}
          </button>
        </form>
      </div>
    </Shell>
  );
}
