/* Student-facing endpoints. This module must never expose AIReview.explanation
   — see types.ts. Do not import teacher.ts from anything under routes/student/. */

import { api } from './client';
import type { Assignment, Course, JoinResult, StudentReviewResponse, Submission } from './types';

export const studentApi = {
  myCourses: () => api.get<Course[]>('/my-courses/'),

  /* One submission. get_queryset filters on student__user, so a student can
     only ever load their own — another student's id answers 404. */
  submission: (id: number) => api.get<Submission>(`/submissions/${id}/`),
  join: (code: string) => api.post<JoinResult>('/courses/join/', { code }),

  submit: (assignmentId: number, body: { raw_text: string } | FormData) =>
    api.post<Submission>(`/assignments/${assignmentId}/submit/`, body),

  /* Save without handing in. 409 if already submitted. Debounce the caller. */
  draft: (assignmentId: number, rawText: string) =>
    api.post<Submission>(`/assignments/${assignmentId}/draft/`, { raw_text: rawText }),

  /* Same URL the teacher uses; the response shape differs by role.
     A null review means "nothing to show" and nothing more — it does not tell
     you whether a review exists. */
  review: (submissionId: number) =>
    api.get<StudentReviewResponse>(`/submissions/${submissionId}/review/`),
   assignments: () => api.get<Assignment[]>('/assignments/'),
   submissions: () => api.get<Submission[]>('/submissions/'),

  /* The photo this student handed in. Scoped to their own submissions. */
  photo: (submissionId: number) => api.blob(`/submissions/${submissionId}/image/`),

  /* The teacher's handout for an assignment in one of this student's classes. */
  attachment: (assignmentId: number) => api.blob(`/assignments/${assignmentId}/attachment/`),
};
