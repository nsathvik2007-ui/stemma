import type { Verdict } from '../api/types';

/* The mark is an m laid over a flipped copy of itself: two identical strands
   in phase. The same drawing renders AIReview.verdict by changing the phase of
   the accent strand — never by introducing a second hue.

   The drawing carries the category only. Confidence is a number shown beside
   it; the mark is never asked to imply both. */

type Phase = 'aligned' | Verdict;

const BONE = 'M4 40 L15 16 L26 40 L37 16 L48 40';

const ACCENT: Record<Phase, string> = {
  aligned: 'M4 16 L15 40 L26 16 L37 40 L48 16',
  copied: 'M4 16 L15 40 L26 16 L37 40 L48 16',      /* in phase — every crossing lands */
  paraphrased: 'M2 19 L14 42 L27 17 L39 41 L51 18', /* drifting out of step */
  coincidental: 'M4 46 L15 24 L26 46 L37 24 L48 46',/* parallel, never crossing */
};

const BASE: Record<Phase, string> = {
  aligned: BONE,
  copied: BONE,
  paraphrased: BONE,
  coincidental: 'M4 34 L15 12 L26 34 L37 12 L48 34',
};

export function Mark({
  size = 48,
  phase = 'aligned',
  stroke,
  base = 'var(--bone)',
  accent = 'var(--vermilion-light)',
}: {
  size?: number;
  phase?: Phase;
  stroke?: number;
  base?: string;
  accent?: string;
}) {
  /* Stroke thickens as the mark shrinks so it still reads at 16px. */
  const w = stroke ?? (size <= 16 ? 11 : size <= 24 ? 8.5 : size <= 44 ? 6.5 : 5.5);
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-hidden="true" className="mark">
      <path d={BASE[phase]} stroke={base} strokeWidth={w} />
      <path d={ACCENT[phase]} stroke={accent} strokeWidth={w} />
    </svg>
  );
}

/* The wordmark sits inside a glass pill — mark and word together on one
   full-radius surface. Login uses a 94px mark against 78px type; the app bar
   inverts that so the mark leads. Capital S: it is "Stemma", not "stemma".
   (design/artboards/Login.dc.html)

   Sizing lives in CSS, not inline, so the media queries can shrink it — the
   login pill is ~545px at full size and overflows a phone otherwise. */
export function Wordmark({ context = 'bar' }: { context?: 'login' | 'bar' }) {
  return (
    <div className={`wordmark wordmark--${context}`}>
      <div className="wordmark-blur" />
      <div className="wordmark-row">
        <Mark phase="aligned" stroke={6} base="#FFFFFF" accent="var(--vermilion-light)" />
        <span className="wordmark-text">Stemma</span>
      </div>
    </div>
  );
}
