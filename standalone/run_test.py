from pathlib import Path

from scorer import score

DOCS_DIR = Path(__file__).parent / "test_documents"


def load(name: str) -> str:
    return (DOCS_DIR / f"{name}.txt").read_text()


def main():
    original = load("original")
    pairs = [
        ("original", "copied"),
        ("original", "paraphrased"),
        ("original", "unrelated"),
    ]

    for k in (3, 5, 8):
        print(f"\n{'=' * 60}")
        print(f"k = {k}")
        print(f"{'=' * 60}")
        for name_a, name_b in pairs:
            text_a = load(name_a)
            text_b = load(name_b)
            result = score(text_a, text_b, k=k)
            print(
                f"{name_a:12} vs {name_b:12} | "
                f"overlap: {result['overlap_count']:3} | "
                f"jaccard: {result['jaccard_similarity']:.4f}"
            )

    print(f"\n{'=' * 60}")
    print("Matched phrases (original vs copied, k=5)")
    print(f"{'=' * 60}")
    result = score(original, load("copied"), k=5)
    for phrase in result["matched_phrases"]:
        print(f"  - {phrase}")


if __name__ == "__main__":
    main()
