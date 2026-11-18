import os

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


ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

# Recognised by their first bytes, not by the name or the browser's claimed
# type, either of which is the uploader's to choose. An HTML page renamed
# notes.pdf is refused rather than stored and later served from our origin.
# The stored file is renamed to the extension its bytes prove.
ATTACHMENT_SIGNATURES = [
    (b"%PDF-", "pdf"),
    (b"\xff\xd8\xff", "jpg"),
    (b"\x89PNG\r\n\x1a\n", "png"),
]


def _sniff_attachment(upload):
    head = upload.read(8)
    upload.seek(0)
    for signature, extension in ATTACHMENT_SIGNATURES:
        if head.startswith(signature):
            return extension
    return None


class AssignmentSerializer(serializers.ModelSerializer):
    # Write-only: the response carries what the client needs to show the
    # file, never a storage path or URL.
    attachment = serializers.FileField(write_only=True, required=False)
    remove_attachment = serializers.BooleanField(write_only=True, required=False, default=False)
    has_attachment = serializers.SerializerMethodField()
    attachment_name = serializers.SerializerMethodField()
    attachment_type = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = [
            "id",
            "course",
            "title",
            "description",
            "due_at",
            "max_score",
            "similarity_threshold",
            "created_at",
            "attachment",
            "remove_attachment",
            "has_attachment",
            "attachment_name",
            "attachment_type",
        ]
        read_only_fields = ["id", "created_at"]
        extra_kwargs = {"description": {"max_length": 10000}}

    def get_has_attachment(self, obj):
        return bool(obj.attachment)

    def get_attachment_name(self, obj):
        return os.path.basename(obj.attachment.name) if obj.attachment else None

    def get_attachment_type(self, obj):
        if not obj.attachment:
            return None
        return "pdf" if obj.attachment.name.lower().endswith(".pdf") else "image"

    def validate_attachment(self, upload):
        if upload.size > ATTACHMENT_MAX_BYTES:
            raise serializers.ValidationError("Attachments can be up to 10 MB.")
        extension = _sniff_attachment(upload)
        if extension is None:
            raise serializers.ValidationError("Attach a PDF, JPG or PNG file.")
        stem = os.path.splitext(os.path.basename(upload.name))[0] or "attachment"
        upload.name = f"{stem[:80]}.{extension}"
        return upload

    def create(self, validated_data):
        validated_data.pop("remove_attachment", None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        # Replacing or removing the handout deletes the old file, so files
        # nobody can reach any more don't pile up on the server.
        remove = validated_data.pop("remove_attachment", False)
        if remove and "attachment" not in validated_data:
            validated_data["attachment"] = ""
        old_name = instance.attachment.name if instance.attachment else None
        instance = super().update(instance, validated_data)
        if old_name and instance.attachment.name != old_name:
            instance.attachment.storage.delete(old_name)
        return instance


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
    # A flag, not the file's URL or path. The photo itself is only reachable
    # through the ownership-scoped GET /api/submissions/{id}/image/.
    has_image = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = [
            "id",
            "assignment",
            "student",
            "student_name",
            "raw_text",
            "source_type",
            "has_image",
            "uploaded_at",
            "submitted_at",
            "late",
            "grade",
        ]
        read_only_fields = [
            "id",
            "student",
            "has_image",
            "uploaded_at",
            "submitted_at",
            "late",
            "grade",
        ]

    def get_has_image(self, obj):
        return bool(obj.image)

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
