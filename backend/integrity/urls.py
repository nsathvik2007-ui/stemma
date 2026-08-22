from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AssignmentViewSet,
    CourseViewSet,
    JoinCourseView,
    MyCoursesView,
    SubmissionViewSet,
    SubmitFeedbackView,
)

router = DefaultRouter()
router.register("courses", CourseViewSet, basename="course")
router.register("assignments", AssignmentViewSet, basename="assignment")
router.register("submissions", SubmissionViewSet, basename="submission")

urlpatterns = [
    path("reviews/<int:review_id>/feedback/", SubmitFeedbackView.as_view(), name="submit-feedback"),
    path("courses/join/", JoinCourseView.as_view(), name="join-course"),
    path("my-courses/", MyCoursesView.as_view(), name="my-courses"),
] + router.urls
