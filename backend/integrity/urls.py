from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AssignmentViewSet, CourseViewSet, SubmissionViewSet, SubmitFeedbackView

router = DefaultRouter()
router.register("courses", CourseViewSet, basename="course")
router.register("assignments", AssignmentViewSet, basename="assignment")
router.register("submissions", SubmissionViewSet, basename="submission")

urlpatterns = router.urls + [
    path("reviews/<int:review_id>/feedback/", SubmitFeedbackView.as_view(), name="submit-feedback"),
]
