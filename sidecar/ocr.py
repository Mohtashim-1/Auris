"""Screenshot + Tesseract OCR pipeline."""

from __future__ import annotations

import logging
import threading
import time
import uuid
from datetime import datetime, timezone
import mss
import pytesseract
from Levenshtein import distance as levenshtein_distance
from PIL import Image

import database as db
import embeddings

logger = logging.getLogger(__name__)

LEVENSHTEIN_THRESHOLD = 50


class OcrPipeline:
    """Periodic screenshots with deduplicated OCR storage."""

    def __init__(self, session_id: str, interval_seconds: int = 10) -> None:
        self._session_id = session_id
        self._interval = interval_seconds
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_text = ""

    def start(self) -> None:
        if self._interval <= 0:
            logger.info("OCR disabled (interval=0)")
            return
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, daemon=True, name="ocr-pipeline")
        self._thread.start()
        logger.info("OCR pipeline started (every %ss)", self._interval)

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=self._interval + 5)
            self._thread = None

    def _run(self) -> None:
        with mss.mss() as sct:
            monitor = sct.monitors[0]
            while not self._stop.is_set():
                try:
                    self._capture_and_store(sct, monitor)
                except Exception:
                    logger.exception("OCR capture failed")
                self._stop.wait(self._interval)

    def _capture_and_store(self, sct: mss.mss, monitor: dict) -> None:
        shot = sct.grab(monitor)
        img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        text = pytesseract.image_to_string(img).strip()
        if not text:
            return

        if self._last_text and levenshtein_distance(text, self._last_text) <= LEVENSHTEIN_THRESHOLD:
            return

        self._last_text = text
        captured_at = datetime.now(timezone.utc).isoformat()
        capture_id = str(uuid.uuid4())

        db.insert_screen_capture(self._session_id, capture_id, text, captured_at)

        try:
            embeddings.embed_and_store(
                capture_id,
                text,
                {
                    "session_id": self._session_id,
                    "speaker": "screen",
                    "timestamp": captured_at,
                    "type": "ocr",
                },
            )
        except Exception:
            logger.exception("Failed to embed OCR text")

        logger.debug("OCR stored %d chars for session %s", len(text), self._session_id[:8])
