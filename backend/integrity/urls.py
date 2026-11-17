from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AssignmentViewSet,
    ChangePasswordView,
    CourseViewSet,
    JoinCourseView,
    MyCoursesView,
    PairViewSet,
    SubmissionViewSet,
    SubmitFeedbackView,
    TeacherSummaryView,
)

router = DefaultRouter()
router.register("courses", CourseViewSet, basename="course")
router.register("assignments", AssignmentViewSet, basename="assignment")
router.register("submissions", SubmissionViewSet, basename="submission")
router.register("pairs", PairViewSet, basename="pair")

urlpatterns = [
    path("reviews/<int:review_id>/feedback/", SubmitFeedbackView.as_view(), name="submit-feedback"),
    path("courses/join/", JoinCourseView.as_view(), name="join-course"),
    path("my-courses/", MyCoursesView.as_view(), name="my-courses"),
    path("teacher-summary/", TeacherSummaryView.as_view(), name="teacher-summary"),
    path("me/password/", ChangePasswordView.as_view(), name="change-password"),
] + router.urls
