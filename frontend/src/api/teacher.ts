/* Teacher-facing endpoints. Everything here is ownership-scoped server-side;
   a course belonging to another teacher answers 404, not 403.
   Do not import this module from anything under routes/student/. */

import { api } from './client';
import type {
  Assignment, Course, Grade, RosterEntry,
  PairOverlap, Submission, SubmissionPair, TeacherSummaryRow,
} from './types';

export const teacherApi = {
  summary: () => api.get<TeacherSummaryRow[]>('/teacher-summary/'),

  courses: () => api.get<Course[]>('/courses/'),
  createCourse: (name: string) => api.post<Course>('/courses/', { name }),
  roster: (courseId: number) => api.get<RosterEntry[]>(`/courses/${courseId}/roster/`),

  assignments: () => api.get<Assignment[]>('/assignments/'),
  createAssignment: (body: Partial<Assignment>) => api.post<Assignment>('/assignments/', body),

  /* Stage 1 + 2: candidate self-join then Jaccard. Synchronous by design. */
  analyze: (assignmentId: number) =>
    api.post<{ pairs_computed: number; pairs: SubmissionPair[] }>(`/assignments/${assignmentId}/analyze/`),
  /* Stage 3: Groq, only on pairs over the assignment threshold. */
  review: (assignmentId: number) =>
    api.post<{ reviewed: number[]; failed: { pair_id: number; error: string }[] }>(`/assignments/${assignmentId}/review/`),
  assignmentPairs: (assignmentId: number) => api.get<SubmissionPair[]>(`/assignments/${assignmentId}/pairs/`),

  upload: (assignmentId: number, file: File, studentName: string) => {
    const form = new FormData();
    form.append('image', file);
    form.append('student_name', studentName);
    return api.post<Submission>(`/assignments/${assignmentId}/upload/`, form);
  },

  submissions: () => api.get<Submission[]>('/submissions/'),
  grade: (submissionId: number, score: number, comment: string) =>
    api.post<Grade>(`/submissions/${submissionId}/grade/`, { score, comment }),

  /* Cross-class queue. */
  pairs: (params: { status?: string; course?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.course != null) q.set('course', String(params.course));
    const qs = q.toString();
    return api.get<SubmissionPair[]>(`/pairs/${qs ? `?${qs}` : ''}`);
  },
  overlap: (pairId: number) => api.get<PairOverlap>(`/pairs/${pairId}/overlap/`),
  /* Review one pair on demand. Unlike the assignment-level review this ignores
     the threshold — the teacher asked for this specific pair. */
  reviewPair: (pairId: number) => api.post<SubmissionPair>(`/pairs/${pairId}/review/`),

  /* The photo behind a handwritten submission in one of this teacher's classes. */
  photo: (submissionId: number) => api.blob(`/submissions/${submissionId}/image/`),

  /* Confirming or rejecting a verdict is what drives
     Assignment.recalibrate_threshold() — it only ever raises, capped at 0.8. */
  feedback: (reviewId: number, confirmed: boolean) =>
    api.post<{ threshold: number }>(`/reviews/${reviewId}/feedback/`, { confirmed }),
};
