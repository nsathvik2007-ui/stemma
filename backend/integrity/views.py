from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from .ai_review import recalibrate_threshold, review_pair
from .candidates import run_assignment_scan
from .models import AIReview, Assignment, Course, Submission, SubmissionPair, TeacherFeedback
from .scoring import compute_and_store_shingles
from .serializers import (
    AssignmentSerializer,
    CourseSerializer,
    SubmissionPairSerializer,
    SubmissionSerializer,
)
from .vision_ocr import transcribe_handwriting


class CourseViewSet(viewsets.ModelViewSet):
    serializer_class = CourseSerializer

    def get_queryset(self):
        return Course.objects.filter(teacher=self.request.user)

    def perform_create(self, serializer):
        serializer.save(teacher=self.request.user)


class AssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = AssignmentSerializer

    def get_queryset(self):
        return Assignment.objects.filter(course__teacher=self.request.user)

    def perform_create(self, serializer):
        course = serializer.validated_data["course"]
        if course.teacher_id != self.request.user.id:
            raise PermissionDenied("You don't own this course.")
        serializer.save()

    @action(detail=True, methods=["post"])
    def analyze(self, request, pk=None):
        assignment = self.get_object()

        for submission in assignment.submissions.all():
            compute_and_store_shingles(submission)

        pairs = run_assignment_scan(assignment)
        serializer = SubmissionPairSerializer(pairs, many=True)
        return Response({"pairs_computed": len(pairs), "pairs": serializer.data})

    @action(detail=True, methods=["get"])
    def pairs(self, request, pk=None):
        assignment = self.get_object()
        qs = assignment.pairs.select_related("submission_a", "submission_b").order_by(
            "-jaccard_similarity"
        )
        serializer = SubmissionPairSerializer(qs, many=True)
        return Response(serializer.data)

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

        submission = Submission.objects.create(
            assignment=assignment,
            student_name=student_name,
            raw_text=raw_text,
            source_type=Submission.SOURCE_HANDWRITTEN,
        )
        serializer = SubmissionSerializer(submission)
        return Response(serializer.data, status=201)


class SubmissionViewSet(viewsets.ModelViewSet):
    serializer_class = SubmissionSerializer

    def get_queryset(self):
        return Submission.objects.filter(assignment__course__teacher=self.request.user)

    def perform_create(self, serializer):
        assignment = serializer.validated_data["assignment"]
        if assignment.course.teacher_id != self.request.user.id:
            raise PermissionDenied("You don't own this assignment.")
        serializer.save()


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
