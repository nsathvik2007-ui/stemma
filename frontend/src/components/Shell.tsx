import type { ReactNode } from 'react';
import { AppBar } from './AppBar';
import { MeshField } from './MeshField';
import { useAuth } from '../auth/AuthContext';

/* The teacher shell. Same composition as the student screens — mesh field,
   92px app bar, content — rather than a second, plainer chrome for the other
   role. One app, one shell; only the role marker in the bar differs.

   `id` names this screen's grain filter. Reusing one id across screens makes
   the second instance render the first one's filter, so every caller passes a
   distinct one (see MeshField). */
export function Shell({ id = 'teacher', children }: { id?: string; children: ReactNode }) {
  const { role, email, signOut } = useAuth();
  return (
    <div className="screen">
      <MeshField id={id} />
      <AppBar
        name={email ?? ''}
        role={role === 'student' ? 'Student' : 'Teacher'}
        onSignOut={signOut}
      />
      <main className="page">{children}</main>
    </div>
  );
}

/* Skeletons are shaped like the result they replace, not spinners. */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ display: 'grid', gap: 12 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          style={{
            height: 92, borderRadius: 'var(--radius-card)',
            background: 'var(--card)', border: '1px solid var(--bone-18)',
          }}
        />
      ))}
    </div>
  );
}

/* Empty states say how to fill them. */
export function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--bone-18)', borderRadius: 'var(--radius-card)',
        padding: 40, background: 'var(--rail)', display: 'grid', gap: 8,
        backdropFilter: 'blur(12px)',
      }}
    >
      <h2 style={{ fontSize: 18 }}>{title}</h2>
      <p style={{ margin: 0, color: 'var(--bone-66)' }}>{hint}</p>
    </div>
  );
}
