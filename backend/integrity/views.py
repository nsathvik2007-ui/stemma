import logging
import mimetypes
import os

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db.models import Count, Q
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import accounts
from .ai_review import recalibrate_threshold, review_pair
from .auth import IsStudent, IsTeacher, clear_failures, raise_if_locked, record_failure
from .candidates import run_assignment_scan
from .models import (
    AIReview,
    Assignment,
    Course,
    Enrollment,
    Grade,
    Student,
    Submission,
    SubmissionPair,
    TeacherFeedback,
)
from .scoring import compute_and_store_shingles
from .serializers import (
    AssignmentSerializer,
    CourseSerializer,
    GradeSerializer,
    RosterEntrySerializer,
    SubmissionPairSerializer,
    SubmissionSerializer,
)
from .ocr import transcribe_handwriting


logger = logging.getLogger(__name__)

# Shown to the person who uploaded. The provider's own error goes to the server
# log only: it carries the GCP project number, billing links and quota state,
# none of which a student should see.
OCR_FAILED = "The photo could not be read. Nothing was submitted."


def _student_profile_or_400(request):
    student = getattr(request.user, "student_profile", None)
    if student is None:
        return None, Response({"detail": "This account is not a student account."}, status=400)
    return student, None


class CourseViewSet(viewsets.ModelViewSet):
    """Teacher-only in full. Students reach courses through /my-courses/ and
    /courses/join/, never through this set — without IsTeacher a student could
    POST here and be saved as the new course's teacher."""

    serializer_class = CourseSerializer
    permission_classes = [IsAuthenticated, IsTeacher]

    def get_queryset(self):
        return Course.objects.filter(teacher=self.request.user)

    def perform_create(self, serializer):
        serializer.save(teacher=self.request.user)

    @action(detail=True, methods=["get"])
    def roster(self, request, pk=None):
        """Who is in this class. get_queryset is already teacher-scoped, so
        get_object cannot reach another teacher's course.

        Returns the whole class in one response. Fine at 200 students,
        needs ?search= and paging before it grows past that.
        """
        course = self.get_object()
        qs = course.enrollments.select_related("student__user").order_by(
            "student__user__first_name", "student__user__username"
        )
        return Response(RosterEntrySerializer(qs, many=True).data)

    @action(detail=True, methods=["post"], url_path="students")
    def add_students(self, request, pk=None):
        """Add a class at once: {"students": [{"name", "email"}, ...]}.

        New accounts come back with a temporary password, shown to the teacher
        this once and never stored in a readable form, hence no-store.
        """
        course = self.get_object()
        result, errors = accounts.add_students(course, request.data.get("students"))
        if errors:
            return Response({"errors": errors}, status=400)
        response = Response(result, status=201)
        response["Cache-Control"] = "no-store"
        return response

    @action(
        detail=True,
        methods=["post"],
        url_path=r"students/(?P<student_id>\d+)/reset-password",
    )
    def reset_password(self, request, pk=None, student_id=None):
        """Password reset goes through the teacher (design/CLAUDE.md). Scoped
        to students enrolled in this teacher's course; anyone else is 404."""
        course = self.get_object()
        enrollment = get_object_or_404(
            course.enrollments.select_related("student__user"), student_id=student_id
        )
        user = enrollment.student.user
        response = Response(
            {
                "name": user.get_full_name() or user.username,
                "email": user.email or user.username,
                "temporary_password": accounts.issue_temporary_password(user),
            }
        )
        response["Cache-Control"] = "no-store"
        return response


class AssignmentViewSet(viewsets.ModelViewSet):
    """Shared set, split by action.

    Both roles list and retrieve assignments (scoped below). Everything that
    writes, scans, or returns a verdict is teacher-only; handing work in is
    student-only. `pairs` is teacher-only because it nests AIReview.explanation,
    which names the other student.
    """

    serializer_class = AssignmentSerializer

    TEACHER_ACTIONS = {
        "create", "update", "partial_update", "destroy",
        "analyze", "review", "pairs", "upload",
    }
    STUDENT_ACTIONS = {"submit", "draft"}

    def get_permissions(self):
        if self.action in self.TEACHER_ACTIONS:
            return [IsAuthenticated(), IsTeacher()]
        if self.action in self.STUDENT_ACTIONS:
            return [IsAuthenticated(), IsStudent()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        return Assignment.objects.filter(
            Q(course__teacher=user) | Q(course__enrollments__student__user=user)
        ).distinct()

    def perform_create(self, serializer):
        course = serializer.validated_data["course"]
        if course.teacher_id != self.request.user.id:
            raise PermissionDenied("You don't own this course.")
        serializer.save()

    def perform_update(self, serializer):
        # get_queryset limits which assignment can be edited, not where it can
        # be moved: without this, a PATCH naming another teacher's course id
        # would plant this assignment in their class.
        course = serializer.validated_data.get("course")
        if course is not None and course.teacher_id != self.request.user.id:
            raise PermissionDenied("You don't own this course.")
        serializer.save()

    @action(detail=True, methods=["get"])
    def attachment(self, request, pk=None):
        """The teacher's handout. Scoped like every read here: the class's
        teacher and its enrolled students; anyone else gets 404."""
        assignment = self.get_object()
        if not assignment.attachment:
            raise Http404("This assignment has no attachment.")
        content_type, _ = mimetypes.guess_type(assignment.attachment.name)
        response = FileResponse(
            assignment.attachment.open("rb"),
            content_type=content_type or "application/octet-stream",
            filename=os.path.basename(assignment.attachment.name),
        )
        response["Cache-Control"] = "private, no-store"
        return response

    @action(detail=True, methods=["post"])
    def analyze(self, request, pk=None):
        assignment = self.get_object()

        # Drafts excluded: a half-written draft must not be shingled and paired.
        for submission in assignment.submissions.filter(submitted_at__isnull=False):
            compute_and_store_shingles(submission)

        pairs = run_assignment_scan(assignment)
        serializer = SubmissionPairSerializer(pairs, many=True)
        return Response({"pairs_computed": len(pairs), "pairs": serializer.data})

    @action(detail=True, methods=["get"])
    def pairs(self, request, pk=None):
        assignment = self.get_object()
        qs = assignment.pairs.select_related(
            "submission_a", "submission_b", "ai_review", "ai_review__feedback"
        ).order_by("-jaccard_similarity")
        return Response(SubmissionPairSerializer(qs, many=True).data)

    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        assignment = self.get_object()
        eligible = assignment.pairs.filter(
            status=SubmissionPair.STATUS_PENDING,
            jaccard_similarity__gte=assignment.similarity_threshold,
        )

        reviewed = []
        failed = []
        for pair in eligible:
            try:
                review_pair(pair)
                reviewed.append(pair.id)
            except Exception as exc:
                failed.append({"pair_id": pair.id, "error": str(exc)})

        return Response({"reviewed": reviewed, "failed": failed})

    @action(detail=True, methods=["post"])
    def draft(self, request, pk=None):
        """Save without handing in: submitted_at stays null, so the row is
        invisible to the scan. Idempotent — the client calls it on a debounce.
        """
        assignment = self.get_object()
        student, error = _student_profile_or_400(request)
        if error:
            return error

        if not Enrollment.objects.filter(student=student, course=assignment.course).exists():
            raise PermissionDenied("You are not enrolled in this course.")

        raw_text = request.data.get("raw_text")
        if raw_text is None:
            return Response({"detail": "raw_text is required"}, status=400)

        existing = Submission.objects.filter(assignment=assignment, student=student).first()
        if existing and existing.submitted_at:
            return Response(
                {"detail": "Already submitted. Submit again to replace it."}, status=409
            )

        submission, _ = Submission.objects.update_or_create(
            assignment=assignment,
            student=student,
            defaults={
                "student_name": request.user.get_full_name() or request.user.username,
                "raw_text": raw_text,
                "source_type": Submission.SOURCE_TYPED,
            },
        )
        return Response(SubmissionSerializer(submission).data, status=200)

    @action(detail=True, methods=["post"])
    def upload(self, request, pk=None):
        assignment = self.get_object()

        image_file = request.FILES.get("image")
        if not image_file:
            return Response({"detail": "image is required"}, status=400)

        # A paper handed in by someone on the roster is linked to their account,
        # so they see the grade and comment like any other submission. A name
        # alone (student_id omitted) is for someone without an account.
        student = None
        student_id = request.data.get("student_id")
        if student_id:
            student = Student.objects.filter(
                pk=student_id, enrollments__course=assignment.course
            ).select_related("user").first()
            if student is None:
                return Response({"detail": "That student is not in this class."}, status=400)
            if Submission.objects.filter(assignment=assignment, student=student).exists():
                return Response(
                    {"detail": "This student has already handed in work for this assignment."},
                    status=409,
                )
            student_name = student.user.get_full_name() or student.user.username
        else:
            student_name = request.data.get("student_name")
            if not student_name:
                return Response({"detail": "student_id or student_name is required"}, status=400)

        try:
            raw_text = transcribe_handwriting(image_file.read())
        except Exception as exc:
            logger.exception("OCR failed for upload to assignment %s", assignment.id)
            return Response({"detail": OCR_FAILED}, status=502)
        # read() left the pointer at the end; rewind before Django saves it.
        image_file.seek(0)

        now = timezone.now()
        submission = Submission.objects.create(
            assignment=assignment,
            student=student,
            student_name=student_name,
            raw_text=raw_text,
            source_type=Submission.SOURCE_HANDWRITTEN,
            image=image_file,
            submitted_at=now,
            late=bool(assignment.due_at and now > assignment.due_at),
        )
        return Response(SubmissionSerializer(submission).data, status=201)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        assignment = self.get_object()
        student, error = _student_profile_or_400(request)
        if error:
            return error

        if not Enrollment.objects.filter(student=student, course=assignment.course).exists():
            raise PermissionDenied("You are not enrolled in this course.")

        # Once the work is marked, the mark and the text must stay in step.
        # submit is update_or_create and never touched the Grade, so replacing
        # a graded answer used to leave the old score attached to new text.
        existing = Submission.objects.filter(
            assignment=assignment, student=student
        ).first()
        if existing is not None and hasattr(existing, "grade"):
            return Response(
                {
                    "detail": "This work has already been marked, so it can no longer "
                    "be replaced. Ask your teacher if you need to resubmit."
                },
                status=409,
            )

        image_file = request.FILES.get("image")
        raw_text = request.data.get("raw_text")

        if image_file:
            try:
                raw_text = transcribe_handwriting(image_file.read())
            except Exception as exc:
                logger.exception("OCR failed for upload to assignment %s", assignment.id)
                return Response({"detail": OCR_FAILED}, status=502)
            image_file.seek(0)
            source_type = Submission.SOURCE_HANDWRITTEN
        elif raw_text:
            source_type = Submission.SOURCE_TYPED
        else:
            return Response({"detail": "Provide either raw_text or image"}, status=400)

        now = timezone.now()
        # submit is an upsert, so replacing on-time work after the deadline
        # flips late to True. That is a policy, and a deliberate one.
        defaults = {
            "student_name": request.user.get_full_name() or request.user.username,
            "raw_text": raw_text,
            "source_type": source_type,
            "submitted_at": now,
            "late": bool(assignment.due_at and now > assignment.due_at),
        }
        if image_file:
            defaults["image"] = image_file

        submission, _ = Submission.objects.update_or_create(
            assignment=assignment, student=student, defaults=defaults
        )
        return Response(SubmissionSerializer(submission).data, status=201)


class SubmissionViewSet(viewsets.ModelViewSet):
    """Shared set. `review` stays open to both and gates by role inside the
    action itself — a student sees a verdict only once a teacher has confirmed
    it, and never the explanation."""

    serializer_class = SubmissionSerializer

    TEACHER_ACTIONS = {"create", "update", "partial_update", "destroy", "grade"}

    def get_permissions(self):
        if self.action in self.TEACHER_ACTIONS:
            return [IsAuthenticated(), IsTeacher()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        return Submission.objects.filter(
            Q(assignment__course__teacher=user) | Q(student__user=user)
        ).distinct()

    def perform_create(self, serializer):
        assignment = serializer.validated_data["assignment"]
        if assignment.course.teacher_id != self.request.user.id:
            raise PermissionDenied("You don't own this assignment.")
        serializer.save()

    @action(detail=True, methods=["post"])
    def grade(self, request, pk=None):
        submission = self.get_object()
        if submission.assignment.course.teacher_id != request.user.id:
            raise PermissionDenied("Only the owning teacher can grade this submission.")

        score = request.data.get("score")
        if score is None:
            return Response({"detail": "score is required"}, status=400)

        try:
            score = float(score)
        except (TypeError, ValueError):
            return Response({"detail": "score must be a number"}, status=400)

        max_score = submission.assignment.max_score
        if score < 0 or score > max_score:
            return Response(
                {"detail": f"score must be between 0 and {max_score}"}, status=400
            )

        grade, _ = Grade.objects.update_or_create(
            submission=submission,
            defaults={"score": score, "comment": request.data.get("comment", "")},
        )
        return Response(GradeSerializer(grade).data)

    @action(detail=True, methods=["get"])
    def image(self, request, pk=None):
        """The photograph as handed in — the only way the file leaves the server.

        Photos are not served from /media/. That route has no auth, so anyone
        with the URL could open a student's handwritten page. Going through
        get_object() applies the same scoping as every other read: the teacher
        who owns the course, or the student who handed it in. Anyone else gets
        404, not 403, so the response doesn't confirm the photo exists.
        """
        submission = self.get_object()
        if not submission.image:
            raise Http404("No photo for this submission.")
        content_type, _ = mimetypes.guess_type(submission.image.name)
        response = FileResponse(
            submission.image.open("rb"), content_type=content_type or "image/jpeg"
        )
        # Student work: never cached by shared caches or proxies.
        response["Cache-Control"] = "private, no-store"
        return response

    @action(detail=True, methods=["get"])
    def review(self, request, pk=None):
        """The AI verdict on this submission.

        A student sees it only once TeacherFeedback exists and confirmed is
        true — a human signs it before the student reads it. The teacher
        sees it either way.

        Both the no-review and the not-yet-confirmed case return
        {"review": None}. A 404 that appeared only when a review existed
        would tell the student that a review exists.

        explanation is teacher-only: it names the other student.
        """
        submission = self.get_object()
        is_teacher = submission.assignment.course.teacher_id == request.user.id

        review = (
            AIReview.objects.filter(
                Q(pair__submission_a=submission) | Q(pair__submission_b=submission)
            )
            .select_related("pair", "feedback")
            .order_by("-reviewed_at")
            .first()
        )
        if review is None:
            return Response({"review": None})

        if not is_teacher:
            feedback = getattr(review, "feedback", None)
            if feedback is None or not feedback.confirmed:
                return Response({"review": None})

        payload = {
            "verdict": review.verdict,
            "confidence": review.confidence,
            "reviewed_at": review.reviewed_at,
        }
        if is_teacher:
            payload["explanation"] = review.explanation
        return Response({"review": payload})


class PairViewSet(viewsets.ReadOnlyModelViewSet):
    """Every flagged pair across every class this teacher owns.

    Without this the integrity queue is one request per assignment.
    Supports ?status=pending|ai_reviewed|dismissed and ?course=<id>.
    """

    serializer_class = SubmissionPairSerializer
    permission_classes = [IsAuthenticated, IsTeacher]

    def get_queryset(self):
        qs = (
            SubmissionPair.objects.filter(assignment__course__teacher=self.request.user)
            .select_related(
                "submission_a",
                "submission_b",
                "assignment",
                "assignment__course",
                "ai_review",
                "ai_review__feedback",
            )
            .order_by("-jaccard_similarity")
        )

        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)

        course_param = self.request.query_params.get("course")
        if course_param:
            qs = qs.filter(assignment__course_id=course_param)

        return qs

    @action(detail=True, methods=["get"])
    def overlap(self, request, pk=None):
        """Both texts plus the phrases they share — what the comparison
        screen highlights. The phrases already exist as SubmissionShingle
        rows; match the two submissions on hash_value.
        """
        pair = self.get_object()
        hashes = set(pair.submission_a.shingles.values_list("hash_value", flat=True)) & set(
            pair.submission_b.shingles.values_list("hash_value", flat=True)
        )
        phrases = list(
            pair.submission_a.shingles.filter(hash_value__in=hashes)
            .values_list("phrase", flat=True)
            .distinct()
        )
        return Response(
            {
                "text_a": pair.submission_a.raw_text,
                "text_b": pair.submission_b.raw_text,
                "shared_phrases": phrases,
            }
        )

    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        """Send this one pair to the model, now.

        The assignment-level review only takes pairs at or above the
        assignment's threshold, so a pair the teacher opened from the queue and
        wants a verdict on — precisely because it sits under the threshold —
        could not be reviewed at all. This is an explicit, single, teacher-
        initiated request, so it deliberately ignores the threshold: the
        threshold decides what gets read *automatically*, not what a teacher is
        allowed to ask about.
        """
        pair = self.get_object()
        try:
            review_pair(pair)
        except Exception as exc:
            return Response({"detail": f"Review failed: {exc}"}, status=502)
        pair.refresh_from_db()
        return Response(SubmissionPairSerializer(pair).data)


class TeacherSummaryView(APIView):
    """Per-course counts for the teacher home screen, in one call.

    Assembling this client-side is one request per assignment plus the full
    submission list of every class, which does not hold at these sizes.
    """
    permission_classes = [IsAuthenticated, IsTeacher]


    def get(self, request):
        courses = (
            Course.objects.filter(teacher=request.user)
            .annotate(
                students=Count("enrollments", distinct=True),
                assignment_count=Count("assignments", distinct=True),
            )
            .order_by("name")
        )

        payload = []
        for course in courses:
            handed_in = Submission.objects.filter(
                assignment__course=course, submitted_at__isnull=False
            )
            payload.append(
                {
                    "course": course.id,
                    "name": course.name,
                    "join_code": course.join_code,
                    "students": course.students,
                    "assignments": course.assignment_count,
                    "handed_in": handed_in.count(),
                    "ungraded": handed_in.filter(grade__isnull=True).count(),
                    "late": handed_in.filter(late=True).count(),
                    "pending_pairs": SubmissionPair.objects.filter(
                        assignment__course=course, status=SubmissionPair.STATUS_PENDING
                    ).count(),
                    "awaiting_teacher": SubmissionPair.objects.filter(
                        assignment__course=course,
                        ai_review__isnull=False,
                        ai_review__feedback__isnull=True,
                    ).count(),
                }
            )
        return Response(payload)


class SubmitFeedbackView(APIView):
    permission_classes = [IsAuthenticated, IsTeacher]

    def post(self, request, review_id):
        review = get_object_or_404(
            AIReview.objects.filter(pair__assignment__course__teacher=request.user),
            id=review_id,
        )

        confirmed = request.data.get("confirmed")
        if confirmed is None:
            return Response({"detail": "confirmed is required"}, status=400)

        feedback, _ = TeacherFeedback.objects.update_or_create(
            ai_review=review, defaults={"confirmed": bool(confirmed)}
        )
        recalibrate_threshold(review.pair.assignment)
        return Response({"ai_review": review.id, "confirmed": feedback.confirmed})


class ChangePasswordView(APIView):
    """Either role. Required right after a teacher-issued password, and open
    any time after. Wrong current passwords count toward a lockout like
    sign-in does, so a stolen access token can't be used to guess it."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        raise_if_locked("password", str(user.pk))

        current = str(request.data.get("current_password", ""))
        new = str(request.data.get("new_password", ""))
        if not user.check_password(current):
            record_failure("password", str(user.pk))
            return Response({"current_password": ["That isn't your current password."]}, status=400)
        if new == current:
            return Response(
                {"new_password": ["Choose a password different from the current one."]}, status=400
            )
        try:
            validate_password(new, user)
        except ValidationError as exc:
            return Response({"new_password": exc.messages}, status=400)

        user.set_password(new)
        user.save(update_fields=["password"])
        Student.objects.filter(user=user).update(must_change_password=False)
        clear_failures("password", str(user.pk))
        return Response({"detail": "Password changed."})


class JoinCourseView(APIView):
    permission_classes = [IsAuthenticated, IsStudent]

    def post(self, request):
        student, error = _student_profile_or_400(request)
        if error:
            return error

        code = request.data.get("code", "").strip().upper()

        # A mistyped code is a bad request, not a missing page. get_object_or_404
        # here would return Django's generic "No Course matches the given query",
        # which tells a student nothing they can act on.
        if len(code) != 6:
            return Response(
                {"detail": "A class code is six characters. Check you have all of it."},
                status=400,
            )

        course = Course.objects.filter(join_code=code).first()
        if course is None:
            return Response(
                {
                    "detail": "No class has that code. Check it with your teacher — "
                    "one wrong character is enough."
                },
                status=400,
            )

        _, created = Enrollment.objects.get_or_create(student=student, course=course)
        return Response(
            {"course": course.id, "course_name": course.name, "already_enrolled": not created}
        )


class MyCoursesView(APIView):
    permission_classes = [IsAuthenticated, IsStudent]

    def get(self, request):
        student, error = _student_profile_or_400(request)
        if error:
            return error

        courses = Course.objects.filter(enrollments__student=student)
        serializer = CourseSerializer(courses, many=True)
        return Response(serializer.data)
