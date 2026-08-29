from rest_framework import serializers

from .models import (
    AIReview,
    Assignment,
    Course,
    Enrollment,
    Grade,
    Submission,
    SubmissionPair,
)


class CourseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ["id", "name", "join_code", "created_at"]
        read_only_fields = ["id", "join_code", "created_at"]


class AssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Assignment
        fields = [
            "id",
            "course",
            "title",
            "due_at",
            "max_score",
            "similarity_threshold",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class GradeSerializer(serializers.ModelSerializer):
    # Carried with the numerator so the client never joins two calls to
    # render "16/20".
    max_score = serializers.FloatField(
        source="submission.assignment.max_score", read_only=True
    )

    class Meta:
        model = Grade
        fields = ["id", "score", "max_score", "comment", "graded_at"]
        read_only_fields = fields


class SubmissionSerializer(serializers.ModelSerializer):
    grade = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = [
            "id",
            "assignment",
            "student",
            "student_name",
            "raw_text",
            "source_type",
            "image",
            "uploaded_at",
            "submitted_at",
            "late",
            "grade",
        ]
        read_only_fields = [
            "id",
            "student",
            "image",
            "uploaded_at",
            "submitted_at",
            "late",
            "grade",
        ]

    def get_grade(self, obj):
        if hasattr(obj, "grade"):
            return GradeSerializer(obj.grade).data
        return None


class AIReviewSerializer(serializers.ModelSerializer):
    # Three-valued on purpose: None means the teacher has not decided yet,
    # which is what the queue renders as Pending.
    confirmed = serializers.SerializerMethodField()

    class Meta:
        model = AIReview
        fields = [
            "id",
            "verdict",
            "confidence",
            "explanation",
            "reviewed_at",
            "confirmed",
        ]
        read_only_fields = fields

    def get_confirmed(self, obj):
        feedback = getattr(obj, "feedback", None)
        return None if feedback is None else feedback.confirmed


class SubmissionPairSerializer(serializers.ModelSerializer):
    submission_a_name = serializers.CharField(source="submission_a.student_name", read_only=True)
    submission_b_name = serializers.CharField(source="submission_b.student_name", read_only=True)
    assignment_title = serializers.CharField(source="assignment.title", read_only=True)
    course_id = serializers.IntegerField(source="assignment.course_id", read_only=True)
    course_name = serializers.CharField(source="assignment.course.name", read_only=True)
    ai_review = AIReviewSerializer(read_only=True)

    class Meta:
        model = SubmissionPair
        fields = [
            "id",
            "assignment",
            "assignment_title",
            "course_id",
            "course_name",
            "submission_a",
            "submission_a_name",
            "submission_b",
            "submission_b_name",
            "overlap_count",
            "jaccard_similarity",
            "status",
            "computed_at",
            "ai_review",
        ]
        read_only_fields = fields


class RosterEntrySerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    # Only useful if User.email is populated when the account is issued;
    # it is currently free to be blank.
    email = serializers.EmailField(source="student.user.email", read_only=True)
    student_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = Enrollment
        fields = ["id", "student_id", "name", "email", "enrolled_at"]
        read_only_fields = fields

    def get_name(self, obj):
        user = obj.student.user
        return user.get_full_name() or user.username
