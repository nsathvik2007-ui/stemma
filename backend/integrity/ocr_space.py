"""OCR.space, free plan only.

The free endpoint is fixed here on purpose. PRO plans use different hosts,
sent by email on sign-up, so no configuration change can move Stemma onto a
paid plan.

Free-plan limits that shape this code:
  - 1 MB per image. Phone photos are larger, so every photo is re-encoded as
    a JPEG that fits. Re-encoding also drops the EXIF block, so a student's
    location metadata never reaches OCR.space.
  - 500 requests a day per IP. On a server, every student shares that IP.
  - Shared, slower infrastructure with no uptime guarantee: hence the long
    timeout, which gunicorn's 120-second limit leaves room for.
"""
import io
import os

import requests
from PIL import Image

FREE_ENDPOINT = "https://api.ocr.space/parse/image"
MAX_BYTES = 1_000_000
# Matches the frontend's SubmissionPhoto: plenty to read handwriting.
MAX_SIDE = 2400
TIMEOUT_SECONDS = 90
# Engine 3 reads handwriting; 1 and 2 are for print. On the two cursive test
# pages (2026-11-12) engine 3 scored 0% and 10% word error rate, engines 1
# and 2 scored 61% and 100%, and Google Vision 17% and 31%.
DEFAULT_ENGINE = "3"


def _fit_under_limit(image_bytes: bytes) -> bytes:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image.thumbnail((MAX_SIDE, MAX_SIDE))
    while True:
        for quality in (85, 70, 55):
            buffer = io.BytesIO()
            image.save(buffer, "JPEG", quality=quality)
            if buffer.tell() <= MAX_BYTES:
                return buffer.getvalue()
        image = image.resize((image.width * 3 // 4, image.height * 3 // 4))


def transcribe_handwriting(image_bytes: bytes) -> str:
    response = requests.post(
        FREE_ENDPOINT,
        headers={"apikey": os.environ["OCR_SPACE_API_KEY"]},
        files={"file": ("page.jpg", _fit_under_limit(image_bytes), "image/jpeg")},
        data={
            "language": "eng",
            "OCREngine": os.environ.get("OCR_SPACE_ENGINE", DEFAULT_ENGINE),
            # Re-encoding dropped the EXIF orientation, which phones held flat
            # over a page get wrong anyway; OCR.space finds "up" from the text.
            "detectOrientation": "true",
            "scale": "true",
        },
        timeout=TIMEOUT_SECONDS,
    )
    response.raise_for_status()

    body = response.json()
    # Some failures come back as a bare string rather than an object.
    if not isinstance(body, dict):
        raise RuntimeError(f"OCR.space error: {body}")
    if body.get("IsErroredOnProcessing") or not body.get("ParsedResults"):
        raise RuntimeError(f"OCR.space error: {body.get('ErrorMessage')}")

    text = "\n".join(result.get("ParsedText", "") for result in body["ParsedResults"])
    return text.replace("\r\n", "\n").strip()
