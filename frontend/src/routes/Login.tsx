import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mark, Wordmark } from '../components/Mark';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';

/* Login keeps its own document-text field rather than the mesh used elsewhere
   — deliberate, not a gap (design/NEXT.md). Faint essay prose in Newsreader,
   two columns, bleeding past the top and bottom edges, with passages picked
   out in colour only, no underline.
   Built from design/artboards/Login.dc.html. */

/* Text between « » is a matched passage. */
const FIELD: string[] = [
  'The question of authorship in student writing is older than the tools used to police it. Long before text could be compared at scale, teachers relied on familiarity with a pupil’s voice, and that familiarity did most of the work.',
  'What changed was not the ethics but the arithmetic. «A single essay can now be measured against a corpus no reader could hold in memory, and the comparison returns in seconds rather than terms.» The judgement, however, remains a human one.',
  'Similarity is not the same as dishonesty. A shared quotation, a standard method section, a phrase both writers took from the same lecture: each produces a match that means very little on its own.',
  'This is why a percentage alone makes a poor verdict. The figure compresses many different kinds of overlap into one number, then invites the reader to treat that number as a grade.',
  'Passage-level reporting behaves differently. «It shows where the overlap sits, how long it runs, and what it was matched against, so the teacher argues from evidence instead of from a score.»',
  'Students given the same report tend to correct themselves. Most overlap in undergraduate work is careless citation rather than deliberate copying, and it is fixable in the hours before a deadline.',
  'Transparency also changes the relationship. A tool that reports only to the institution is an instrument of surveillance; one that reports to both parties is an instrument of teaching.',
  'The remaining difficulty is generated text, which leaves no source to match against. «Here the honest answer is a probability, clearly labelled as one, and never a verdict standing on its own.»',
  'Any claim stronger than that misrepresents what the method can support, and a system that overstates its certainty will eventually be disbelieved on the occasions when it is right.',
  'The useful posture is therefore a modest one. Report what was found, cite where it came from, and leave the conclusion to the person who actually knows the student.',
  'None of this is new pedagogy. It is the same practice a careful marker has always followed, with the reading done at a scale a marker cannot reach alone.',
  'There is a practical objection worth taking seriously. Reports of this kind take time to read, and a marker with two hundred scripts will not read two hundred of them closely.',
  'The answer is triage rather than automation. «A report that surfaces the three longest matches first lets a marker spend attention where it is likely to matter» and skim the rest without pretending to have read them.',
  'Ordering by length is imperfect. A short match on an unusual phrase can be more telling than a long one on a common definition, and no ranking captures that reliably.',
  'Still, an imperfect order beats an arbitrary one. The alternative in practice is a single figure at the top of the page and no reading at all, which is how most disputes begin.',
  'Disputes are the real test of any such system. When a student contests a finding, the question is whether the report can be examined, not whether the score can be defended.',
  'A system that cannot show its working has no answer at that point. It can only repeat its number, more loudly, to a reader who has already stopped believing it.',
  'This is the argument for keeping the evidence visible at every stage: not transparency as a virtue, but transparency as the only thing that survives being questioned.',
];

function Paragraph({ source }: { source: string }) {
  return (
    <p style={{ margin: '0 0 17px' }}>
      {source.split(/(«[^»]*»)/).map((chunk, i) =>
        chunk.startsWith('«') ? (
          <span key={i} style={{ color: 'rgba(255,122,80,0.40)' }}>
            {chunk.slice(1, -1)}
          </span>
        ) : (
          chunk
        ),
      )}
    </p>
  );
}

const STEPS = [
  ['01', 'Join your class', 'Enter the code your teacher gives you. It links your account to that class and its assignments.'],
  ['02', 'Submit your work', 'Upload a file or paste your text before the deadline. You can resubmit until the assignment closes.'],
  ['03', 'Read the report', 'Matches come back passage by passage, with sources. You and your teacher see the same report.'],
] as const;

function StepBadge({ n }: { n: string }) {
  return (
    <div
      style={{
        width: 40, height: 40, borderRadius: 'var(--radius-pill)',
        position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid var(--bone-18)',
        background: 'linear-gradient(150deg, rgba(247,244,238,0.16), rgba(247,244,238,0.05) 48%, rgba(247,244,238,0.11))',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -1px 0 rgba(255,255,255,0.07), inset 0 0 24px rgba(0,0,0,0.20)',
        flexShrink: 0,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, backdropFilter: 'blur(18px) saturate(180%)', WebkitBackdropFilter: 'blur(18px) saturate(180%)' }} />
      <span style={{ position: 'relative', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.06em', color: 'var(--vermilion-light)' }}>
        {n}
      </span>
    </div>
  );
}

export default function Login() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reachable, setReachable] = useState(true);
  const fieldRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLFormElement>(null);

  /* The field advances once and accelerates upward: the scan actually running. */
  function runScan() {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const field = fieldRef.current;
    const card = cardRef.current;
    if (field) {
      field.style.transition = 'transform 1250ms cubic-bezier(0.42, 0, 0.88, 0.24), opacity 1250ms ease-in';
      field.style.transform = 'translateY(-300px)';
      field.style.opacity = '0.5';
    }
    if (card) {
      card.style.transition = 'opacity 620ms ease 120ms, transform 620ms cubic-bezier(0.22,0.61,0.36,1) 120ms';
      card.style.opacity = '0.62';
      card.style.transform = 'translateY(-6px)';
    }
  }

  function settle() {
    const field = fieldRef.current;
    const card = cardRef.current;
    if (field) {
      field.style.transition = 'transform 900ms cubic-bezier(0.22,0.61,0.36,1), opacity 900ms ease';
      field.style.transform = '';
      field.style.opacity = '';
    }
    if (card) {
      card.style.transition = 'opacity 520ms ease, transform 520ms cubic-bezier(0.22,0.61,0.36,1)';
      card.style.opacity = '';
      card.style.transform = '';
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(false);
    setReachable(true);
    setBusy(true);
    runScan();
    try {
      const { role } = await signIn(username, password);
      nav(role === 'teacher' ? '/teacher' : '/student', { replace: true });
    } catch (err) {
      /* 401 on this route means bad credentials — accounts are institution-
         issued, so the recovery path is IT, not a reset link. */
      if (err instanceof ApiError && err.status === 401) setError(true);
      else setReachable(false);
      setBusy(false);
      settle();
    }
  }

  return (
    <div className="login">
      <section className="login-left">
        <div className="login-head">
          <Wordmark context="login" />
        </div>
        <div className="login-steps">
          <span className="eyebrow">How it works</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
            {STEPS.map(([n, title, body], i) => (
              <div key={n} style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <StepBadge n={n} />
                  {i < STEPS.length - 1 && (
                    <div style={{ width: 1, height: 48, background: 'linear-gradient(180deg, rgba(255,107,61,0.55), rgba(247,244,238,0.12))' }} />
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <h2 style={{ fontSize: 'var(--text-section)', lineHeight: 1.18, letterSpacing: '-0.012em' }}>{title}</h2>
                  <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--bone-66)', textWrap: 'pretty' }}>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="login-right">
        <div ref={fieldRef} className="login-field" aria-hidden="true">
          {FIELD.map((p, i) => <Paragraph key={i} source={p} />)}
        </div>
        <div className="login-vscrim" aria-hidden="true" />
        <div className="login-rscrim" aria-hidden="true" />

        <form ref={cardRef} onSubmit={onSubmit} className="login-card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h1 style={{ fontSize: 'var(--text-page)', lineHeight: 1.08, letterSpacing: '-0.018em' }}>Sign in</h1>
            <p style={{ margin: 0, fontSize: 16.5, lineHeight: 1.55, color: 'rgba(247,244,238,0.68)', textWrap: 'pretty' }}>
              Sign in with the college email your institution issued you. Teachers and students both sign in here.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <label className="field-label" htmlFor="stemma-username">College email</label>
              <input
                id="stemma-username" className="login-input" type="email" autoComplete="email"
                value={username} onChange={(e) => setUsername(e.target.value)} required
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <label className="field-label" htmlFor="stemma-password">Password</label>
              <input
                id="stemma-password" className="login-input" type="password" autoComplete="current-password"
                style={{ letterSpacing: '0.16em' }}
                value={password} onChange={(e) => setPassword(e.target.value)} required
              />
            </div>
          </div>

          {error && (
            <div className="login-error" role="alert">
              <span style={{ fontSize: 'var(--text-body)', fontWeight: 600 }}>That didn't match</span>
              <span style={{ fontSize: 14.5, lineHeight: 1.5, color: 'rgba(247,244,238,0.74)', textWrap: 'pretty' }}>
                Check the email and password. The password is case-sensitive.
              </span>
            </div>
          )}
          {!reachable && (
            <div className="login-error" role="alert">
              <span style={{ fontSize: 'var(--text-body)', fontWeight: 600 }}>Can't reach the server</span>
              <span style={{ fontSize: 14.5, lineHeight: 1.5, color: 'rgba(247,244,238,0.74)', textWrap: 'pretty' }}>
                Check that Django is running on port 8000.
              </span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {busy ? (
              <button type="button" disabled className="login-submit login-submit-busy">
                <Mark size={22} stroke={8} base="rgba(247,244,238,0.55)" accent="var(--vermilion)" />
                Signing in
              </button>
            ) : (
              <button className="login-submit">Sign in</button>
            )}
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: 'rgba(247,244,238,0.62)', textWrap: 'pretty' }}>
              Can't get in? Your teacher or school IT can reset it. There's no self-service reset.
            </p>
          </div>
        </form>
      </section>
    </div>
  );
}
