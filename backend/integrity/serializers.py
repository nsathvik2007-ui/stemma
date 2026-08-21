from rest_framework import serializers

from .models import Assignment, Course, Submission, SubmissionPair


class CourseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ["id", "name", "created_at"]
        read_only_fields = ["id", "created_at"]


class AssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Assignment
        fields = ["id", "course", "title", "due_date", "similarity_threshold", "created_at"]
        read_only_fields = ["id", "created_at"]


class SubmissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Submission
        fields = ["id", "assignment", "student_name", "raw_text", "source_type", "uploaded_at"]
        read_only_fields = ["id", "uploaded_at"]


class SubmissionPairSerializer(serializers.ModelSerializer):
    submission_a_name = serializers.CharField(source="submission_a.student_name", read_only=True)
    submission_b_name = serializers.CharField(source="submission_b.student_name", read_only=True)

    class Meta:
        model = SubmissionPair
        fields = [
            "id",
            "submission_a",
            "submission_a_name",
            "submission_b",
            "submission_b_name",
            "overlap_count",
            "jaccard_similarity",
            "status",
            "computed_at",
        ]
        read_only_fields = fields
