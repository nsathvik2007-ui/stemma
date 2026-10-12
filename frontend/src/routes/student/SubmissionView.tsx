import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppBar } from '../../components/AppBar';
import { MeshField } from '../../components/MeshField';
import { Mark } from '../../components/Mark';
import { SubmissionPhoto } from '../../components/SubmissionPhoto';
import { useAuth } from '../../auth/AuthContext';
import { studentApi } from '../../api/student';
import { plural } from '../../lib/plural';
import type { Assignment, Course, StudentReview, Submission } from '../../api/types';

/* Built from Submission.dc.html — the read side of a piece of work.

   GET /api/submissions/:id/         the work, with `grade` nested (null until marked)
   GET /api/submissions/:id/review/  the AI verdict, or { review: null }

   The rail switches on `grade`: absent means with the teacher, present means
   returned.

   On the verdict: { review: null } is returned BOTH when no review exists and
   when one exists but the teacher has not confirmed it. Those two cases are
   deliberately indistinguishable, so null must render nothing at all — no
   "pending", no "being checked". Any such label would leak the fact that a
   pair was flagged. */

const VERDICT_COPY: Record<StudentReview['verdict'], { name: string; line: string }> = {
  coincidental: {
    name: 'Coincidental',
    line: 'Wording you share with another answer is the terminology the question required. Nothing was raised with your teacher.',
  },
  paraphrased: {
    name: 'Paraphrased',
    line: 'Reworded from another answer with the same argument underneath. Your teacher was asked to look at it.',
  },
  copied: {
    name: 'Copied',
    line: 'The same sentences in the same order as another answer. Your teacher was asked to look at it.',
  },
};

function countWords(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

function stamp(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const month = d.toLocaleDateString('en-GB', { month: 'short' }).slice(0, 3).toUpperCase();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${d.getDate()} ${month} · ${time}`;
}

export default function SubmissionView() {
  const { signOut, email } = useAuth();
  const { submissionId } = useParams<{ submissionId: string }>();
  const id = Number(submissionId);

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [review, setReview] = useState<StudentReview | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      studentApi.submission(id),
      studentApi.assignments(),
      studentApi.myCourses(),
      /* A failure here must not take the page down — the verdict is
         supplementary, and null is a valid answer anyway. */
      studentApi.review(id).catch(() => ({ review: null })),
    ])
      .then(([sub, assignments, courses, rev]) => {
        if (cancelled) return;
        setSubmission(sub);
        const a = assignments.find((x) => x.id === sub.assignment) ?? null;
        setAssignment(a);
        setCourse(a ? courses.find((c) => c.id === a.course) ?? null : null);
        setReview(rev.review);
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) setError('Could not load this submission.'); });
    return () => { cancelled = true; };
  }, [id]);

  const shell = (children: React.ReactNode) => (
    <div className="screen">
      <MeshField id="subm" />
      <AppBar name={email ?? ''} role="Student" onSignOut={signOut} />
      {children}
    </div>
  );

  if (error) return shell(<div className="subm-main"><p className="error">{error}</p></div>);
  if (!loaded || !submission) return shell(<div className="subm-main"><p>Loading…</p></div>);

  const grade = submission.grade;
  const verdict = review ? VERDICT_COPY[review.verdict] : null;

  return shell(
    <div className="subm-grid">
      <div className="subm-main">
        <div className="stack-16">
          <Link to={course ? `/student/classroom/${course.id}` : '/student'} className="backlink">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M8.5 3 L4.5 7 L8.5 11" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            {course?.name ?? 'All classes'}
          </Link>
          <div className="title-pill">
            <div className="title-pill-blur" />
            <h1>{assignment?.title ?? 'Submission'}</h1>
          </div>
        </div>

        <div className="subm-sectionbar">
          <span className="field-label">What you handed in</span>
          <span className="subm-rule" />
          <span className="subm-source">
            {submission.source_type === 'handwritten' ? 'Transcribed from a photo' : 'Typed'}
          </span>
        </div>

        {/* A handwritten submission shows the page itself first, then what the
            OCR read from it. The student can check the transcription against
            their own page, and knows the teacher sees both. */}
        {submission.has_image && (
          <SubmissionPhoto
            load={() => studentApi.photo(submission.id)}
            caption="Your photo"
            alt="The handwritten page you handed in"
          />
        )}

        {submission.has_image && (
          <div style={{ display: 'grid', gap: 4 }}>
            <span className="field-label">Transcription</span>
            <span style={{ color: 'var(--bone-55)', fontSize: 13 }}>
              Read from your photo automatically. Your teacher sees the photo alongside it.
            </span>
          </div>
        )}

        <div className="subm-prose">
          {submission.raw_text.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </div>

      <aside className="subm-rail">
        {grade ? (
          <div className="grade-card">
            <span className="field-label">Grade</span>
            <div className="grade-row">
              <span className="grade-score">{grade.score}</span>
              <span className="grade-out">/ {grade.max_score}</span>
              <span className="grade-pct">{Math.round((grade.score / grade.max_score) * 100)}%</span>
            </div>
            {grade.comment && (
              <>
                <div className="row-rule" />
                <p className="grade-comment">{grade.comment}</p>
              </>
            )}
            <span className="grade-by">{stamp(grade.graded_at)}</span>
          </div>
        ) : (
          <div className="status-card">
            <div className="status-line">
              <span className="join-dot join-dot-accent" />
              <span className="status-label">With your teacher</span>
            </div>
            <span className="status-headline">Not returned yet</span>
            <span className="status-detail">
              Your grade and your teacher's comment appear here once the class is marked.
              Nothing else about this work is shown until then.
            </span>
          </div>
        )}

        <div className="rows-tight">
          <div className="fact">
            <span className="fact-label">Handed in</span>
            <span className="fact-value">{stamp(submission.submitted_at)}</span>
          </div>
          <div className="fact">
            <span className="fact-label">Length</span>
            <span className="fact-value">{plural(countWords(submission.raw_text), 'word')}</span>
          </div>
          <div className="fact">
            <span className="fact-label">Due date</span>
            <span className="fact-value">{stamp(assignment?.due_at ?? null)}</span>
          </div>
          {submission.late && (
            <div className="fact">
              <span className="fact-label">Handed in late</span>
              <span className="fact-value fact-accent">Yes</span>
            </div>
          )}
          <div className="row-rule" />
        </div>

        {/* Renders only when a verdict actually came back. A null review says
            nothing — not even that a check happened. */}
        {verdict && review && (
          <div className="verdict-block">
            <Mark
              size={180}
              phase={review.verdict}
              stroke={4.6}
              base="rgba(247,244,238,0.9)"
              accent="var(--vermilion-light)"
            />
            <div className="verdict-copy">
              <span className="verdict-eyebrow">Verdict</span>
              <span className="verdict-name">{verdict.name}</span>
              <span className="verdict-line">{verdict.line}</span>
            </div>
          </div>
        )}

        {!grade && (
          <Link to={`/student/submit/${submission.assignment}`} className="btn-ghost">
            Replace submission
          </Link>
        )}
      </aside>
    </div>,
  );
}
