from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from .ai_review import recalibrate_threshold, review_pair
from .candidates import run_assignment_scan
from .models import (
    AIReview,
    Assignment,
    Course,
    Enrollment,
    Grade,
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
from .vision_ocr import transcribe_handwriting


def _student_profile_or_400(request):
    student = getattr(request.user, "student_profile", None)
    if student is None:
        return None, Response({"detail": "This account is not a student account."}, status=400)
    return student, None


class CourseViewSet(viewsets.ModelViewSet):
    serializer_class = CourseSerializer

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


class AssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = AssignmentSerializer

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
        student_name = request.data.get("student_name")
        if not image_file:
            return Response({"detail": "image is required"}, status=400)
        if not student_name:
            return Response({"detail": "student_name is required"}, status=400)

        try:
            raw_text = transcribe_handwriting(image_file.read())
        except Exception as exc:
            return Response({"detail": f"OCR failed: {exc}"}, status=502)
        # read() left the pointer at the end; rewind before Django saves it.
        image_file.seek(0)

        now = timezone.now()
        submission = Submission.objects.create(
            assignment=assignment,
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

        image_file = request.FILES.get("image")
        raw_text = request.data.get("raw_text")

        if image_file:
            try:
                raw_text = transcribe_handwriting(image_file.read())
            except Exception as exc:
                return Response({"detail": f"OCR failed: {exc}"}, status=502)
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
    serializer_class = SubmissionSerializer

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


class TeacherSummaryView(APIView):
    """Per-course counts for the teacher home screen, in one call.

    Assembling this client-side is one request per assignment plus the full
    submission list of every class, which does not hold at these sizes.
    """

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


class JoinCourseView(APIView):
    def post(self, request):
        student, error = _student_profile_or_400(request)
        if error:
            return error

        code = request.data.get("code", "").strip().upper()
        course = get_object_or_404(Course, join_code=code)

        enrollment, created = Enrollment.objects.get_or_create(student=student, course=course)
        return Response(
            {"course": course.id, "course_name": course.name, "already_enrolled": not created}
        )


class MyCoursesView(APIView):
    def get(self, request):
        student, error = _student_profile_or_400(request)
        if error:
            return error

        courses = Course.objects.filter(enrollments__student=student)
        serializer = CourseSerializer(courses, many=True)
        return Response(serializer.data)
