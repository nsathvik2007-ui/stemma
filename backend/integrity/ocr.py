"""Picks the OCR provider from OCR_PROVIDER in .env, so switching providers is a
config change, not a code change.

Each provider exposes transcribe_handwriting(image_bytes) -> str and raises on
failure; the views turn any failure into one plain message for the student.
Imports are deferred so an unused provider's library is never loaded.
"""
import os


def transcribe_handwriting(image_bytes: bytes) -> str:
    provider = os.environ.get("OCR_PROVIDER", "ocrspace")
    if provider == "ocrspace":
        from .ocr_space import transcribe_handwriting as transcribe
    elif provider == "google":
        from .vision_ocr import transcribe_handwriting as transcribe
    else:
        raise RuntimeError(f"Unknown OCR_PROVIDER: {provider!r}")
    return transcribe(image_bytes)
