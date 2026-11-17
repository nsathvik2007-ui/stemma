"""Role on the token.

The access token said nothing about role, so the client could not tell a
teacher from a student after sign-in — the only signal available was calling
/api/my-courses/ and reading the failure as "not a student". The login design
has no role picker (correctly: asking a user which kind of account they hold is
asking them something the server already knows), so the claim goes on the token
instead. This is the fix named in the Login artboard's own wiring notes.
"""

import time

from django.core.cache import cache
from rest_framework.exceptions import AuthenticationFailed, Throttled
from rest_framework.permissions import BasePermission
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView


def role_for(user):
    """A user with a Student profile is a student; everyone else is a teacher.

    Matches how accounts are actually issued: Student rows are created in admin
    alongside the User, and teachers are simply Users who own Courses.
    """
    return "student" if hasattr(user, "student_profile") else "teacher"


class IsTeacher(BasePermission):
    """Server-side half of the role split.

    Queryset scoping alone is not enough. It filters what you can *see*, but a
    student POSTing to /api/courses/ was still created as its teacher — real
    privilege escalation, since perform_create sets teacher=request.user. The
    route guard in App.tsx reads localStorage and is spoofable, so the rule has
    to live here.
    """

    message = "This account is not a teacher account."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated) and (
            role_for(request.user) == "teacher"
        )


class IsStudent(BasePermission):
    message = "This account is not a student account."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated) and (
            role_for(request.user) == "student"
        )


class RoleTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = role_for(user)
        token["email"] = user.username
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        # Also returned in the body so the client does not have to decode the
        # JWT to route the very first navigation after sign-in.
        data["role"] = role_for(self.user)
        data["email"] = self.user.username
        profile = getattr(self.user, "student_profile", None)
        data["must_change_password"] = bool(profile and profile.must_change_password)
        return data


# Wrong-password limit, per account. Only failures count, so signing in
# correctly never locks anyone out, and the window is short: a classmate who
# deliberately types someone's email wrong ten times costs them 15 minutes, not
# an evening before a deadline. At 10 per 15 minutes, guessing a password runs
# under a thousand tries a day. A plain per-IP limit could not do this job
# alone -- a whole class signs in from one campus IP.
FAILURE_LIMIT = 10
FAILURE_WINDOW_SECONDS = 15 * 60


def _failure_key(kind: str, who: str) -> str:
    return f"auth-failures:{kind}:{who.strip().lower()}"


def seconds_locked(kind: str, who: str) -> int:
    count, started = cache.get(_failure_key(kind, who), (0, 0.0))
    if count < FAILURE_LIMIT:
        return 0
    return max(1, int(FAILURE_WINDOW_SECONDS - (time.time() - started)))


def record_failure(kind: str, who: str) -> None:
    # Counted by hand rather than with cache.incr: on the database cache, incr
    # rewrites the entry with the default timeout, which would slide the window
    # forward on every failure instead of ending it 15 minutes after the first.
    key = _failure_key(kind, who)
    count, started = cache.get(key, (0, time.time()))
    remaining = max(1, int(FAILURE_WINDOW_SECONDS - (time.time() - started)))
    cache.set(key, (count + 1, started), remaining)


def clear_failures(kind: str, who: str) -> None:
    cache.delete(_failure_key(kind, who))


class TooManyAttempts(Throttled):
    """A 429 whose message is shown to the person as written. DRF's own
    Throttled appends "Expected available in N seconds" to any detail; this
    keeps the Retry-After header but leaves the sentence alone."""

    def __init__(self, wait: int, detail: str):
        super().__init__(detail=detail)
        self.wait = wait


def _minutes(wait: int) -> str:
    minutes = -(-int(wait) // 60)
    return f"{minutes} minute{'s' if minutes != 1 else ''}"


def raise_if_locked(kind: str, who: str) -> None:
    wait = seconds_locked(kind, who)
    if wait:
        raise TooManyAttempts(wait, f"Too many wrong passwords. Try again in {_minutes(wait)}.")


class RoleTokenObtainPairView(TokenObtainPairView):
    serializer_class = RoleTokenObtainPairSerializer
    # Per IP, on top of the per-account limit: generous, because a class of 60
    # behind one campus address signs in at the start of the same lesson.
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def throttled(self, request, wait):
        raise TooManyAttempts(
            wait, f"Too many sign-in attempts from this network. Try again in {_minutes(wait or 60)}."
        )

    def post(self, request, *args, **kwargs):
        username = str(request.data.get("username", ""))
        raise_if_locked("login", username)
        try:
            response = super().post(request, *args, **kwargs)
        except AuthenticationFailed:
            record_failure("login", username)
            raise
        clear_failures("login", username)
        return response
