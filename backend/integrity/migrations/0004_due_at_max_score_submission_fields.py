from datetime import datetime, time, timezone as dt_timezone
from zoneinfo import ZoneInfo

from django.db import migrations, models

IST = ZoneInfo("Asia/Kolkata")
# The hour a school day's coursework is actually due. Existing rows carry a
# date with no time; without this they would land at 00:00 IST.
DEFAULT_DUE_HOUR = 17


def copy_due_date_to_due_at(apps, schema_editor):
    Assignment = apps.get_model("integrity", "Assignment")
    for assignment in Assignment.objects.exclude(due_date__isnull=True).iterator():
        local = datetime.combine(
            assignment.due_date, time(DEFAULT_DUE_HOUR, 0), tzinfo=IST
        )
        Assignment.objects.filter(pk=assignment.pk).update(
            due_at=local.astimezone(dt_timezone.utc)
        )


def copy_due_at_to_due_date(apps, schema_editor):
    Assignment = apps.get_model("integrity", "Assignment")
    for assignment in Assignment.objects.exclude(due_at__isnull=True).iterator():
        Assignment.objects.filter(pk=assignment.pk).update(
            due_date=assignment.due_at.astimezone(IST).date()
        )


def backfill_submitted_at(apps, schema_editor):
    """Every pre-existing row was handed in — without this they all become
    drafts and drop out of the similarity scan.

    late stays False: there was no due time to compare against before this
    migration, so marking historical work late would be inventing a fact.
    """
    Submission = apps.get_model("integrity", "Submission")
    for submission in Submission.objects.filter(submitted_at__isnull=True).iterator():
        Submission.objects.filter(pk=submission.pk).update(
            submitted_at=submission.uploaded_at
        )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("integrity", "0003_course_join_code_grade_student_enrollment_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="assignment",
            name="due_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="assignment",
            name="max_score",
            field=models.FloatField(default=20),
        ),
        migrations.AddField(
            model_name="submission",
            name="image",
            field=models.ImageField(
                blank=True, null=True, upload_to="submissions/%Y/%m/"
            ),
        ),
        migrations.AddField(
            model_name="submission",
            name="submitted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="submission",
            name="late",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(copy_due_date_to_due_at, copy_due_at_to_due_date),
        migrations.RunPython(backfill_submitted_at, noop),
        migrations.RemoveField(model_name="assignment", name="due_date"),
    ]
