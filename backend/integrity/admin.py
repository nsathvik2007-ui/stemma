from django.contrib import admin

from .models import (
    AIReview,
    Assignment,
    Course,
    Submission,
    SubmissionPair,
    SubmissionShingle,
    TeacherFeedback,
)

admin.site.register(Course)
admin.site.register(Assignment)
admin.site.register(Submission)
admin.site.register(SubmissionShingle)
admin.site.register(SubmissionPair)
admin.site.register(AIReview)
admin.site.register(TeacherFeedback)
