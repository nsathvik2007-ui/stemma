/* Teacher-facing endpoints. Everything here is ownership-scoped server-side;
   a course belonging to another teacher answers 404, not 403.
   Do not import this module from anything under routes/student/. */

import { api } from './client';
import type {
  AddStudentsResult, Assignment, Course, Grade, IssuedAccount, RosterEntry,
  PairOverlap, Submission, SubmissionPair, TeacherSummaryRow,
} from './types';

export const teacherApi = {
  summary: () => api.get<TeacherSummaryRow[]>('/teacher-summary/'),

  courses: () => api.get<Course[]>('/courses/'),
  createCourse: (name: string) => api.post<Course>('/courses/', { name }),
  roster: (courseId: number) => api.get<RosterEntry[]>(`/courses/${courseId}/roster/`),
  /* Accounts are institution-issued: the teacher adds the class, and each new
     student gets a temporary password to change on first sign-in. */
  addStudents: (courseId: number, students: { name: string; email: string }[]) =>
    api.post<AddStudentsResult>(`/courses/${courseId}/students/`, { students }),
  resetPassword: (courseId: number, studentId: number) =>
    api.post<IssuedAccount>(`/courses/${courseId}/students/${studentId}/reset-password/`),

  assignments: () => api.get<Assignment[]>('/assignments/'),
  /* Multipart, so an attachment can ride along. An empty deadline is left
     out rather than sent as "". */
  createAssignment: (
    fields: {
      course: number; title: string; description: string; due_at: string | null;
      max_score: number; similarity_threshold: number;
    },
    file: File | null,
  ) => {
    const form = new FormData();
    form.append('course', String(fields.course));
    form.append('title', fields.title);
    form.append('description', fields.description);
    if (fields.due_at) form.append('due_at', fields.due_at);
    form.append('max_score', String(fields.max_score));
    form.append('similarity_threshold', String(fields.similarity_threshold));
    if (file) form.append('attachment', file);
    return api.post<Assignment>('/assignments/', form);
  },
  /* Edit the brief: new description, a replacement file, or no file. The
     server deletes a replaced or removed file. */
  updateBrief: (
    assignmentId: number,
    change: { description: string; file: File | null; removeAttachment: boolean },
  ) => {
    const form = new FormData();
    form.append('description', change.description);
    if (change.file) form.append('attachment', change.file);
    else if (change.removeAttachment) form.append('remove_attachment', 'true');
    return api.patch<Assignment>(`/assignments/${assignmentId}/`, form);
  },
  attachment: (assignmentId: number) => api.blob(`/assignments/${assignmentId}/attachment/`),

  /* Stage 1 + 2: candidate self-join then Jaccard. Synchronous by design. */
  analyze: (assignmentId: number) =>
    api.post<{ pairs_computed: number; pairs: SubmissionPair[] }>(`/assignments/${assignmentId}/analyze/`),
  /* Stage 3: Groq, only on pairs over the assignment threshold. */
  review: (assignmentId: number) =>
    api.post<{ reviewed: number[]; failed: { pair_id: number; error: string }[] }>(`/assignments/${assignmentId}/review/`),
  assignmentPairs: (assignmentId: number) => api.get<SubmissionPair[]>(`/assignments/${assignmentId}/pairs/`),

  /* A paper copy, photographed. Someone on the roster is linked by id so they
     see the grade; a bare name is for someone without an account. */
  upload: (assignmentId: number, file: File, who: { studentId: number } | { studentName: string }) => {
    const form = new FormData();
    form.append('image', file);
    if ('studentId' in who) form.append('student_id', String(who.studentId));
    else form.append('student_name', who.studentName);
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
