/* Shapes returned by the DRF backend. Split deliberately by audience: the
   teacher-only fields are not present on the student types at all, so a
   student view cannot render one even by spreading props. */

export type SourceType = 'typed' | 'handwritten';
export type Verdict = 'copied' | 'paraphrased' | 'coincidental';

/* POST /api/courses/join/ does not return a Course — it returns the id, the
   name, and whether this was a no-op. `already_enrolled: true` is a success,
   not an error: joining twice is harmless by design (get_or_create). */
export interface JoinResult {
  course: number;
  course_name: string;
  already_enrolled: boolean;
}

export interface Course {
  id: number;
  name: string;
  join_code: string;
  created_at: string;
}

export interface Assignment {
  id: number;
  course: number;
  title: string;
  due_at: string | null;      /* ISO 8601; send an explicit +05:30 offset */
  max_score: number;
  similarity_threshold: number;
}

export interface Submission {
  id: number;
  assignment: number;
  student: number | null;     /* null = teacher-uploaded, no linked account */
  student_name: string;
  raw_text: string;
  source_type: SourceType;
  /* Whether a photo was handed in. The file itself comes from
     GET /api/submissions/{id}/image/, never a public URL. */
  has_image: boolean;
  submitted_at: string | null; /* null = draft, excluded from scanning */
  late: boolean;
  /* Nested by SubmissionSerializer; null until the work is marked. */
  grade: Grade | null;
}

export interface Grade {
  id: number;
  score: number;
  max_score: number;
  comment: string;
  graded_at: string;
}

export interface RosterEntry {
  id: number;
  student_id: number;
  name: string;
  email: string;
  enrolled_at: string;
}

export interface TeacherSummaryRow {
  course: number;
  name: string;
  join_code: string;
  students: number;
  assignments: number;
  handed_in: number;
  ungraded: number;
  late: number;
  pending_pairs: number;
  awaiting_teacher: number;
}

/* --- Teacher-only ------------------------------------------------------- */

/* `explanation` names the other student. It is teacher-only and must never be
   passed into a student-facing component. */
export interface TeacherAIReview {
  id: number;
  verdict: Verdict;
  confidence: number;
  explanation: string;
  reviewed_at: string;
  /* Three-valued: null means the teacher has not decided yet, which the queue
     renders as Pending. Not a boolean — do not collapse it to one. */
  confirmed: boolean | null;
}

/* The serializer denormalises assignment/course onto the pair so the
   cross-class queue renders from one call. The nested verdict is `ai_review`,
   matching SubmissionPairSerializer. */
export interface SubmissionPair {
  id: number;
  assignment: number;
  assignment_title: string;
  course_id: number;
  course_name: string;
  submission_a: number;
  submission_a_name: string;
  submission_b: number;
  submission_b_name: string;
  overlap_count: number;
  jaccard_similarity: number;
  status: string;
  computed_at: string;
  ai_review: TeacherAIReview | null;
}

/* GET /api/pairs/{id}/overlap/ returns one object, not a list: both texts plus
   the phrases they share. */
export interface PairOverlap {
  text_a: string;
  text_b: string;
  shared_phrases: string[];
}

/* --- Student-only ------------------------------------------------------- */

/* Verdict and confidence only — no explanation field exists here.
   The backend returns { review: null } both when no review exists and when one
   exists but is unconfirmed; those two cases are deliberately
   indistinguishable, so never infer existence from a null. */
export interface StudentReview {
  verdict: Verdict;
  confidence: number;
}

export interface StudentReviewResponse {
  review: StudentReview | null;
}
