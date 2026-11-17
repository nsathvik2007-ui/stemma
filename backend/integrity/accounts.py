"""Student accounts, issued by teachers.

Accounts are institution-issued: there is no sign-up page (design/CLAUDE.md).
A teacher adds a class by pasting names and college emails; each new student
gets a temporary password the teacher hands out, and must choose their own on
first sign-in. Password resets go through the teacher the same way.
"""
import secrets

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import PBKDF2PasswordHasher, make_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction

from .models import Enrollment, Student

MAX_ROWS = 200

# No 0/o, 1/l/i: these get read aloud and copied off a screen.
_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


class TemporaryPasswordHasher(PBKDF2PasswordHasher):
    """PBKDF2 with fewer rounds, for issued passwords only.

    Key stretching protects passwords people choose. An issued one is 12
    random characters (~59 bits), which no number of rounds makes meaningfully
    stronger, while the full default cost (~0.2 s per hash here, more on a
    small server) would make adding a class of 60 take most of a minute. The
    algorithm name is unchanged, so the standard hasher verifies these, and
    Django re-hashes at full strength on the student's first sign-in.
    """

    iterations = 100_000


def temporary_password() -> str:
    groups = ("".join(secrets.choice(_ALPHABET) for _ in range(4)) for _ in range(3))
    return "-".join(groups)


def issue_temporary_password(user) -> str:
    password = temporary_password()
    user.password = make_password(password, hasher=TemporaryPasswordHasher())
    user.save(update_fields=["password"])
    Student.objects.filter(user=user).update(must_change_password=True)
    return password


def _split_name(name: str) -> tuple[str, str]:
    name = " ".join(name.split())
    if " " not in name:
        return name, ""
    first, last = name.rsplit(" ", 1)
    return first, last


def _display(user) -> str:
    return user.get_full_name() or user.username


def add_students(course, rows) -> tuple[dict | None, list[dict]]:
    """Enroll each row in `course`, creating accounts that don't exist yet.

    All or nothing: every row is checked first, and one bad row rejects the
    batch, so a teacher never has to work out which half of a paste went in.
    Returns (result, errors); exactly one is empty.
    """
    User = get_user_model()

    if not isinstance(rows, list) or not rows:
        return None, [{"row": None, "detail": "Add at least one student."}]
    if len(rows) > MAX_ROWS:
        return None, [{"row": None, "detail": f"Add at most {MAX_ROWS} students at a time."}]

    errors, plan, seen = [], [], set()
    for i, row in enumerate(rows, 1):
        row = row if isinstance(row, dict) else {}
        email = str(row.get("email", "")).strip().lower()
        name = " ".join(str(row.get("name", "")).split())
        try:
            validate_email(email)
        except ValidationError:
            errors.append({"row": i, "email": email, "detail": "Not a valid email address."})
            continue
        if len(email) > 150 or len(name) > 150:
            errors.append({"row": i, "email": email, "detail": "Too long."})
            continue
        if email in seen:
            errors.append({"row": i, "email": email, "detail": "Listed twice."})
            continue
        seen.add(email)

        user = User.objects.filter(username__iexact=email).select_related("student_profile").first()
        if user is not None and not hasattr(user, "student_profile"):
            errors.append({"row": i, "email": email, "detail": "This is a teacher account."})
            continue
        plan.append((email, name, user))

    if errors:
        return None, errors

    result = {"created": [], "enrolled": [], "already_enrolled": []}
    with transaction.atomic():
        for email, name, user in plan:
            if user is None:
                first, last = _split_name(name)
                user = User.objects.create(
                    username=email, email=email, first_name=first, last_name=last
                )
                Student.objects.create(user=user)
                Enrollment.objects.create(student=user.student_profile, course=course)
                result["created"].append(
                    {
                        "name": _display(user),
                        "email": email,
                        "temporary_password": issue_temporary_password(user),
                    }
                )
                continue

            _, created = Enrollment.objects.get_or_create(student=user.student_profile, course=course)
            entry = {"name": _display(user), "email": user.email or user.username}
            result["enrolled" if created else "already_enrolled"].append(entry)

    return result, []
