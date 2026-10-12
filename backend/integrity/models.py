import secrets
import string

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


def generate_join_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(6))


class Student(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="student_profile"
    )

    def __str__(self):
        return self.user.get_full_name() or self.user.username


class Course(models.Model):
    name = models.CharField(max_length=200)
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="courses"
    )
    join_code = models.CharField(max_length=6, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.join_code:
            code = generate_join_code()
            while Course.objects.filter(join_code=code).exists():
                code = generate_join_code()
            self.join_code = code
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Enrollment(models.Model):
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="enrollments"
    )
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="enrollments")
    enrolled_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["student", "course"], name="unique_enrollment")
        ]

    def __str__(self):
        return f"{self.student} in {self.course}"


class Assignment(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="assignments")
    title = models.CharField(max_length=200)
    # Deadlines carry a time of day. Stored UTC, rendered in TIME_ZONE
    # (Asia/Kolkata); clients must post an explicit offset, e.g.
    # 2026-09-12T17:00:00+05:30, or Django reads the naive string as UTC.
    due_at = models.DateTimeField(null=True, blank=True)
    # The denominator behind every score. Grade.score is validated against it.
    max_score = models.FloatField(default=20)
    similarity_threshold = models.FloatField(default=0.25)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.title} ({self.course.name})"


class Submission(models.Model):
    SOURCE_TYPED = "typed"
    SOURCE_HANDWRITTEN = "handwritten"
    SOURCE_CHOICES = [
        (SOURCE_TYPED, "Typed"),
        (SOURCE_HANDWRITTEN, "Handwritten (OCR)"),
    ]

    assignment = models.ForeignKey(
        Assignment, on_delete=models.CASCADE, related_name="submissions"
    )
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="submissions",
        null=True,
        blank=True,
    )
    student_name = models.CharField(max_length=200)
    raw_text = models.TextField()
    source_type = models.CharField(
        max_length=20, choices=SOURCE_CHOICES, default=SOURCE_TYPED
    )
    # The photograph as handed in. Without this only the transcription
    # survives, so a bad OCR cannot be checked against the page.
    image = models.ImageField(upload_to="submissions/%Y/%m/", null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    # Null means draft: saved but not handed in. Drafts are excluded from
    # every similarity scan.
    submitted_at = models.DateTimeField(null=True, blank=True)
    # Stored at hand-in rather than derived on read, so moving a deadline
    # does not silently un-late old work.
    late = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["assignment", "student"], name="unique_student_submission"
            )
        ]

    @property
    def is_draft(self) -> bool:
        return self.submitted_at is None

    def __str__(self):
        return f"{self.student_name} — {self.assignment.title}"


class SubmissionShingle(models.Model):
    # 128-bit BLAKE2b hashes don't fit MySQL's 64-bit integer types, so the
    # hash is stored as its 32-character hex digest instead — same value,
    # just a representation MySQL can index and compare directly.
    submission = models.ForeignKey(
        Submission, on_delete=models.CASCADE, related_name="shingles"
    )
    hash_value = models.CharField(max_length=32)
    phrase = models.CharField(max_length=200)

    class Meta:
        indexes = [models.Index(fields=["hash_value"])]


class SubmissionPair(models.Model):
    STATUS_PENDING = "pending"
    STATUS_AI_REVIEWED = "ai_reviewed"
    STATUS_DISMISSED = "dismissed"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_AI_REVIEWED, "AI Reviewed"),
        (STATUS_DISMISSED, "Dismissed"),
    ]

    assignment = models.ForeignKey(
        Assignment, on_delete=models.CASCADE, related_name="pairs"
    )
    submission_a = models.ForeignKey(
        Submission, on_delete=models.CASCADE, related_name="pairs_as_a"
    )
    submission_b = models.ForeignKey(
        Submission, on_delete=models.CASCADE, related_name="pairs_as_b"
    )
    overlap_count = models.IntegerField()
    jaccard_similarity = models.FloatField()
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING
    )
    computed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["submission_a", "submission_b"], name="unique_submission_pair"
            )
        ]

    def __str__(self):
        return f"{self.submission_a} vs {self.submission_b} ({self.jaccard_similarity})"


class AIReview(models.Model):
    VERDICT_COPIED = "copied"
    VERDICT_PARAPHRASED = "paraphrased"
    VERDICT_COINCIDENTAL = "coincidental"
    VERDICT_CHOICES = [
        (VERDICT_COPIED, "Copied"),
        (VERDICT_PARAPHRASED, "Paraphrased"),
        (VERDICT_COINCIDENTAL, "Coincidental"),
    ]

    pair = models.OneToOneField(
        SubmissionPair, on_delete=models.CASCADE, related_name="ai_review"
    )
    verdict = models.CharField(max_length=20, choices=VERDICT_CHOICES)
    confidence = models.FloatField()
    # Written for a teacher: it names the other student and describes the
    # overlap. Never serialized to a student. See SubmissionViewSet.review.
    explanation = models.TextField()
    reviewed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.verdict} ({self.confidence:.2f}) — {self.pair}"


class TeacherFeedback(models.Model):
    ai_review = models.OneToOneField(
        AIReview, on_delete=models.CASCADE, related_name="feedback"
    )
    confirmed = models.BooleanField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        verdict = "confirmed" if self.confirmed else "dismissed"
        return f"{verdict} — {self.ai_review}"


class Grade(models.Model):
    submission = models.OneToOneField(
        Submission, on_delete=models.CASCADE, related_name="grade"
    )
    score = models.FloatField()
    comment = models.TextField(blank=True)
    graded_at = models.DateTimeField(auto_now=True)

    def clean(self):
        """Keep the score inside the assignment's scale.

        The /grade/ endpoint already checks this, but the shell and the admin
        do not go through it -- which is how a score of 88 against a max of 20
        reached the database. Validating here closes every write path, not just
        the API one. max_score lives on Assignment, so this cannot be a
        database-level CheckConstraint.
        """
        max_score = self.submission.assignment.max_score
        if self.score < 0 or self.score > max_score:
            raise ValidationError(
                {"score": f"score must be between 0 and {max_score}, got {self.score}"}
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.score} — {self.submission}"
