"""Screenshot + Tesseract OCR — triggered by speech and/or interval."""

from __future__ import annotations

import logging
import threading
import uuid
from datetime import datetime, timezone

import mss
import pytesseract
from Levenshtein import distance as levenshtein_distance
from PIL import Image

import database as db

logger = logging.getLogger(__name__)

LEVENSHTEIN_THRESHOLD = 50
SPEECH_CAPTURE_DEBOUNCE_S = 2.0


class OcrPipeline:
    """Captures screen on speech and/or on a timer. Stored for AI tasks only."""

    def __init__(
        self,
        session_id: str,
        interval_seconds: int = 10,
        mode: str = "speech",
    ) -> None:
        self._session_id = session_id
        self._interval = interval_seconds
        self._mode = mode  # speech | interval | both | off
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_text = ""
        self._speech_timer: threading.Timer | None = None
        self._capture_lock = threading.Lock()

    def start(self) -> None:
        if self._mode in ("off", "speech"):
            if self._mode == "speech":
                logger.info("OCR on speech (screenshot when you talk)")
            return
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run_interval, daemon=True, name="ocr-interval")
        self._thread.start()
        logger.info("OCR interval pipeline every %ss", self._interval)

    def stop(self) -> None:
        self._stop.set()
        if self._speech_timer:
            self._speech_timer.cancel()
            self._speech_timer = None
        if self._thread:
            self._thread.join(timeout=self._interval + 5)
            self._thread = None

    def on_speech(self) -> None:
        """Schedule a screenshot after speech (debounced)."""
        if self._mode not in ("speech", "both"):
            return
        if self._speech_timer:
            self._speech_timer.cancel()
        self._speech_timer = threading.Timer(SPEECH_CAPTURE_DEBOUNCE_S, self._capture_now)
        self._speech_timer.daemon = True
        self._speech_timer.start()

    def _run_interval(self) -> None:
        with mss.mss() as sct:
            monitor = sct.monitors[0]
            while not self._stop.is_set():
                try:
                    self._capture(sct, monitor)
                except Exception:
                    logger.exception("OCR interval capture failed")
                self._stop.wait(self._interval)

    def _capture_now(self) -> None:
        try:
            with mss.mss() as sct:
                self._capture(sct, sct.monitors[0])
        except Exception:
            logger.exception("OCR speech capture failed")

    def _capture(self, sct: mss.mss, monitor: dict) -> None:
        with self._capture_lock:
            shot = sct.grab(monitor)
            img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
            text = pytesseract.image_to_string(img).strip()
            if not text:
                return

            if (
                self._last_text
                and levenshtein_distance(text, self._last_text) <= LEVENSHTEIN_THRESHOLD
            ):
                return

            self._last_text = text
            captured_at = datetime.now(timezone.utc).isoformat()
            capture_id = str(uuid.uuid4())
            db.insert_screen_capture(self._session_id, capture_id, text, captured_at)
            logger.info(
                "Screenshot captured for session %s (%d chars)",
                self._session_id[:8],
                len(text),
            )
