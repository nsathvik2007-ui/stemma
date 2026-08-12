from django.db import connection

CANDIDATE_QUERY = """
    SELECT a.submission_id, b.submission_id, COUNT(*) AS shared
    FROM integrity_submissionshingle a
    JOIN integrity_submissionshingle b
      ON a.hash_value = b.hash_value AND a.submission_id < b.submission_id
    JOIN integrity_submission sa ON sa.id = a.submission_id
    JOIN integrity_submission sb ON sb.id = b.submission_id
    WHERE sa.assignment_id = %s AND sb.assignment_id = %s
    GROUP BY a.submission_id, b.submission_id
    HAVING COUNT(*) >= %s
    ORDER BY shared DESC
"""


def find_candidate_pairs(assignment, min_shared_shingles: int = 2) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(CANDIDATE_QUERY, [assignment.id, assignment.id, min_shared_shingles])
        rows = cursor.fetchall()

    return [
        {"submission_a_id": a, "submission_b_id": b, "shared_shingles": shared}
        for a, b, shared in rows
    ]


def run_assignment_scan(assignment, min_shared_shingles: int = 2) -> list:
    from .models import Submission
    from .scoring import score_pair

    candidates = find_candidate_pairs(assignment, min_shared_shingles)
    submissions_by_id = {s.id: s for s in Submission.objects.filter(assignment=assignment)}

    return [
        score_pair(submissions_by_id[c["submission_a_id"]], submissions_by_id[c["submission_b_id"]])
        for c in candidates
    ]
