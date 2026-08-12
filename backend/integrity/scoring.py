import hashlib


def normalize(text: str) -> list[str]:
    return text.lower().split()


def shingle(text: str, k: int = 5) -> list[tuple[int, str]]:
    words = normalize(text)
    if len(words) < k:
        return []

    seen: dict[int, str] = {}
    for i in range(len(words) - k + 1):
        phrase = " ".join(words[i : i + k])
        h = int.from_bytes(hashlib.blake2b(phrase.encode(), digest_size=16).digest(), "big")
        if h not in seen:
            seen[h] = phrase

    return sorted(seen.items())


def char_shingle(text: str, n: int = 8) -> list[tuple[int, str]]:
    text = text.lower()
    if len(text) < n:
        return []

    seen: dict[int, str] = {}
    for i in range(len(text) - n + 1):
        gram = text[i : i + n]
        h = int.from_bytes(hashlib.blake2b(gram.encode(), digest_size=16).digest(), "big")
        if h not in seen:
            seen[h] = gram

    return sorted(seen.items())


def ordered_shingle(text: str, k: int = 5) -> list[tuple[int, str]]:
    words = normalize(text)
    if len(words) < k:
        return []

    result = []
    for i in range(len(words) - k + 1):
        phrase = " ".join(words[i : i + k])
        h = int.from_bytes(hashlib.blake2b(phrase.encode(), digest_size=16).digest(), "big")
        result.append((h, phrase))
    return result


def winnow(ordered_hashes: list[tuple[int, str]], w: int = 6) -> list[tuple[int, str]]:
    n = len(ordered_hashes)
    if n == 0:
        return []
    if n <= w:
        min_idx = min(range(n), key=lambda idx: ordered_hashes[idx][0])
        return [ordered_hashes[min_idx]]

    selected: dict[int, str] = {}
    last_selected_idx = -1

    for start in range(n - w + 1):
        window = ordered_hashes[start : start + w]
        min_hash = min(h for h, _ in window)
        rightmost_offset = max(idx for idx, (h, _) in enumerate(window) if h == min_hash)
        global_idx = start + rightmost_offset

        if global_idx != last_selected_idx:
            h, phrase = ordered_hashes[global_idx]
            selected[h] = phrase
            last_selected_idx = global_idx

    return sorted(selected.items())


def two_pointer_overlap(
    a: list[tuple[int, str]], b: list[tuple[int, str]]
) -> list[str]:
    i = j = 0
    matched_phrases = []
    while i < len(a) and j < len(b):
        hash_a, phrase_a = a[i]
        hash_b, _ = b[j]
        if hash_a == hash_b:
            matched_phrases.append(phrase_a)
            i += 1
            j += 1
        elif hash_a < hash_b:
            i += 1
        else:
            j += 1
    return matched_phrases


def jaccard_similarity(
    a: list[tuple[int, str]], b: list[tuple[int, str]], overlap_count: int
) -> float:
    union = len(a) + len(b) - overlap_count
    if union == 0:
        return 0.0
    return overlap_count / union


def char_score(text_a: str, text_b: str, n: int = 8) -> dict:
    shingles_a = char_shingle(text_a, n)
    shingles_b = char_shingle(text_b, n)

    matched = two_pointer_overlap(shingles_a, shingles_b)
    overlap_count = len(matched)
    jaccard = jaccard_similarity(shingles_a, shingles_b, overlap_count)

    return {
        "overlap_count": overlap_count,
        "jaccard_similarity": round(jaccard, 4),
        "matched_phrases": matched,
    }


def winnowed_score(text_a: str, text_b: str, k: int = 5, w: int = 6) -> dict:
    ordered_a = ordered_shingle(text_a, k)
    ordered_b = ordered_shingle(text_b, k)

    fingerprints_a = winnow(ordered_a, w)
    fingerprints_b = winnow(ordered_b, w)

    matched = two_pointer_overlap(fingerprints_a, fingerprints_b)
    overlap_count = len(matched)
    jaccard = jaccard_similarity(fingerprints_a, fingerprints_b, overlap_count)

    return {
        "overlap_count": overlap_count,
        "jaccard_similarity": round(jaccard, 4),
        "matched_phrases": matched,
    }


def compute_and_store_shingles(submission) -> int:
    from .models import SubmissionShingle

    ordered = ordered_shingle(submission.raw_text)
    fingerprints = winnow(ordered)

    SubmissionShingle.objects.filter(submission=submission).delete()
    SubmissionShingle.objects.bulk_create(
        SubmissionShingle(
            submission=submission,
            hash_value=format(h, "032x"),
            phrase=phrase,
        )
        for h, phrase in fingerprints
    )
    return len(fingerprints)


def score_pair(submission_a, submission_b):
    from .models import Submission, SubmissionPair

    if submission_a.assignment_id != submission_b.assignment_id:
        raise ValueError("Submissions must belong to the same Assignment to be compared")

    if submission_a.id > submission_b.id:
        submission_a, submission_b = submission_b, submission_a

    handwritten_involved = (
        submission_a.source_type == Submission.SOURCE_HANDWRITTEN
        or submission_b.source_type == Submission.SOURCE_HANDWRITTEN
    )
    if handwritten_involved:
        result = char_score(submission_a.raw_text, submission_b.raw_text)
    else:
        result = winnowed_score(submission_a.raw_text, submission_b.raw_text)

    pair, _ = SubmissionPair.objects.update_or_create(
        submission_a=submission_a,
        submission_b=submission_b,
        defaults={
            "assignment": submission_a.assignment,
            "overlap_count": result["overlap_count"],
            "jaccard_similarity": result["jaccard_similarity"],
        },
    )
    return pair
