import json
import os

from groq import Groq

from .models import AIReview, SubmissionPair
from .scoring import two_pointer_overlap, winnow, ordered_shingle

MODEL = "openai/gpt-oss-120b"

SYSTEM_PROMPT = """You are an academic integrity reviewer. You are given two \
students' submissions to the same assignment, along with the exact phrases \
they share in common. Decide whether the overlap reflects unauthorized \
copying, acceptable paraphrasing of shared ideas, or coincidental use of \
language that any student writing on this topic would naturally repeat \
(e.g. required terminology, common phrasing for the subject).

Some submissions were transcribed from handwriting by OCR and may contain \
transcription artifacts: misread characters, dropped words, or words \
displaced from their original position in a sentence. Weigh evidence \
accordingly rather than treating such artifacts as meaningful differences \
between the two submissions.

Respond only with a JSON object with exactly these keys:
  "verdict": one of "copied", "paraphrased", "coincidental"
  "confidence": a number between 0 and 1
  "explanation": a short, specific explanation citing the actual evidence
"""


def _client() -> Groq:
    return Groq(api_key=os.environ["GROQ_API_KEY"])


def _matched_phrases(text_a: str, text_b: str) -> list[str]:
    fingerprints_a = winnow(ordered_shingle(text_a))
    fingerprints_b = winnow(ordered_shingle(text_b))
    return two_pointer_overlap(fingerprints_a, fingerprints_b)


def _build_user_prompt(pair: SubmissionPair, matched_phrases: list[str]) -> str:
    return f"""Submission A ({pair.submission_a.student_name}):
{pair.submission_a.raw_text}

Submission B ({pair.submission_b.student_name}):
{pair.submission_b.raw_text}

Matched phrases (exact overlapping text found by the similarity scorer):
{json.dumps(matched_phrases, indent=2)}
"""


def _parse_verdict(raw_content: str) -> dict:
    data = json.loads(raw_content)

    if data.get("verdict") not in dict(AIReview.VERDICT_CHOICES):
        raise ValueError(f"invalid verdict: {data.get('verdict')!r}")

    confidence = float(data["confidence"])
    if not (0.0 <= confidence <= 1.0):
        raise ValueError(f"confidence out of range: {confidence}")

    explanation = str(data["explanation"])

    return {
        "verdict": data["verdict"],
        "confidence": confidence,
        "explanation": explanation,
    }


def review_pair(pair: SubmissionPair) -> AIReview:
    matched_phrases = _matched_phrases(pair.submission_a.raw_text, pair.submission_b.raw_text)
    user_prompt = _build_user_prompt(pair, matched_phrases)

    client = _client()
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    last_error = None
    for attempt in range(2):
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            response_format={"type": "json_object"},
        )
        raw_content = response.choices[0].message.content
        try:
            parsed = _parse_verdict(raw_content)
            break
        except (json.JSONDecodeError, ValueError, KeyError) as exc:
            last_error = exc
            messages.append({"role": "assistant", "content": raw_content})
            messages.append(
                {
                    "role": "user",
                    "content": (
                        "That response was invalid. Respond ONLY with a JSON object "
                        f"with exactly the keys verdict, confidence, explanation. Error: {exc}"
                    ),
                }
            )
    else:
        raise ValueError(f"AI review failed after retry: {last_error}")

    review, _ = AIReview.objects.update_or_create(
        pair=pair,
        defaults=parsed,
    )
    pair.status = SubmissionPair.STATUS_AI_REVIEWED
    pair.save(update_fields=["status"])

    return review


THRESHOLD_MARGIN = 0.05
THRESHOLD_CEILING = 0.8


def recalibrate_threshold(assignment) -> None:
    dismissed_scores = list(
        AIReview.objects.filter(
            pair__assignment=assignment,
            feedback__confirmed=False,
        ).values_list("pair__jaccard_similarity", flat=True)
    )
    if not dismissed_scores:
        return

    candidate = min(max(dismissed_scores) + THRESHOLD_MARGIN, THRESHOLD_CEILING)

    if candidate > assignment.similarity_threshold:
        assignment.similarity_threshold = candidate
        assignment.save(update_fields=["similarity_threshold"])
