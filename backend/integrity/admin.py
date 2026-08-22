from django.contrib import admin

from .models import (
    AIReview,
    Assignment,
    Course,
    Enrollment,
    Grade,
    Student,
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
admin.site.register(Student)
admin.site.register(Enrollment)
admin.site.register(Grade)
