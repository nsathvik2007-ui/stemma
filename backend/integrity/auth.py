"""Role on the token.

The access token said nothing about role, so the client could not tell a
teacher from a student after sign-in — the only signal available was calling
/api/my-courses/ and reading the failure as "not a student". The login design
has no role picker (correctly: asking a user which kind of account they hold is
asking them something the server already knows), so the claim goes on the token
instead. This is the fix named in the Login artboard's own wiring notes.
"""

from rest_framework.permissions import BasePermission
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
        return data


class RoleTokenObtainPairView(TokenObtainPairView):
    serializer_class = RoleTokenObtainPairSerializer
