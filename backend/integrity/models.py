from django.conf import settings
from django.db import models


class Course(models.Model):
    name = models.CharField(max_length=200)
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="courses"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Assignment(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="assignments")
    title = models.CharField(max_length=200)
    due_date = models.DateField(null=True, blank=True)
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
    student_name = models.CharField(max_length=200)
    raw_text = models.TextField()
    source_type = models.CharField(
        max_length=20, choices=SOURCE_CHOICES, default=SOURCE_TYPED
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.student_name} — {self.assignment.title}"


class SubmissionShingle(models.Model):
    # 128-bit BLAKE2b hashes don't fit MySQL's 64-bit integer types, so the
    # hash is stored as its 32-character hex digest instead — same value,
    # just a representation MySQL can index and compare directly.
    submission = models.ForeignKey(
        Submission, on_delete=models.CASCADE, related_name="shingles"
    )
    hash_value = models.CharField(max_length=32, db_index=True)
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
