import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Login from './routes/Login';
import TeacherHome from './routes/teacher/TeacherHome';
import TeacherCourse from './routes/teacher/TeacherCourse';
import NewAssignment from './routes/teacher/NewAssignment';
import TeacherAssignment from './routes/teacher/TeacherAssignment';
import GradeSubmission from './routes/teacher/GradeSubmission';
import IntegrityQueue from './routes/teacher/IntegrityQueue';
import PairReview from './routes/teacher/PairReview';
import StudentHome from './routes/student/StudentHome';
import Classroom from './routes/student/Classroom';
import JoinClass from './routes/student/JoinClass';
import Submit from './routes/student/Submit';
import SubmissionView from './routes/student/SubmissionView';
import type { Role } from './auth/AuthContext';
import type { ReactNode } from 'react';

/* Teacher and student route trees are kept separate on purpose. The teacher
   API module carries AIReview.explanation, which names a classmate and must
   never reach a student view; keeping the trees apart makes a cross-import
   obvious in review rather than a one-line prop-spread accident. */

function Require({ role, children }: { role: Role; children: ReactNode }) {
  const { authed, role: actual } = useAuth();
  if (!authed) return <Navigate to="/login" replace />;
  if (actual !== role) return <Navigate to={actual === 'teacher' ? '/teacher' : '/student'} replace />;
  return <>{children}</>;
}

function Root() {
  const { authed, role } = useAuth();
  if (!authed) return <Navigate to="/login" replace />;
  return <Navigate to={role === 'teacher' ? '/teacher' : '/student'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Root />} />
          <Route path="/login" element={<Login />} />
          <Route path="/teacher" element={<Require role="teacher"><TeacherHome /></Require>} />
          <Route path="/teacher/course/:courseId" element={<Require role="teacher"><TeacherCourse /></Require>} />
          <Route path="/teacher/course/:courseId/new-assignment" element={<Require role="teacher"><NewAssignment /></Require>} />
          <Route path="/teacher/assignment/:assignmentId" element={<Require role="teacher"><TeacherAssignment /></Require>} />
          <Route path="/teacher/submission/:submissionId" element={<Require role="teacher"><GradeSubmission /></Require>} />
          <Route path="/teacher/queue" element={<Require role="teacher"><IntegrityQueue /></Require>} />
          <Route path="/teacher/pair/:pairId" element={<Require role="teacher"><PairReview /></Require>} />
          <Route path="/student" element={<Require role="student"><StudentHome /></Require>} />
          <Route path="/student/classroom/:courseId" element={<Require role="student"><Classroom /></Require>} />
          <Route path="/student/join" element={<Require role="student"><JoinClass /></Require>} />
          <Route path="/student/submit/:assignmentId" element={<Require role="student"><Submit /></Require>} />
          <Route path="/student/submission/:submissionId" element={<Require role="student"><SubmissionView /></Require>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
