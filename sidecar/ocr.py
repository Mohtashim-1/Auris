"""Screenshot + Tesseract OCR — on speech and periodic while recording."""

from __future__ import annotations

import logging
import shutil
import threading
import uuid
from datetime import datetime, timezone
from typing import Callable

import mss
from Levenshtein import distance as levenshtein_distance
from PIL import Image

import database as db

logger = logging.getLogger(__name__)

LEVENSHTEIN_THRESHOLD = 50
SPEECH_CAPTURE_DEBOUNCE_S = 1.5
SPEECH_BACKUP_INTERVAL_S = 12  # periodic capture while recording in speech mode

_ocr_ready = False
_ocr_error: str | None = None
_last_capture_at: str | None = None
_capture_count_session = 0


def check_ocr_available() -> tuple[bool, str | None]:
    global _ocr_ready, _ocr_error
    if shutil.which("tesseract") is None:
        _ocr_ready = False
        _ocr_error = "Tesseract not installed. Run: sudo apt install tesseract-ocr"
        return False, _ocr_error
    try:
        import pytesseract

        pytesseract.get_tesseract_version()
        _ocr_ready = True
        _ocr_error = None
        return True, None
    except Exception as e:
        _ocr_ready = False
        _ocr_error = str(e)
        return False, _ocr_error


def get_ocr_status() -> dict:
    return {
        "ocr_ready": _ocr_ready,
        "ocr_error": _ocr_error,
        "last_capture_at": _last_capture_at,
        "captures_this_session": _capture_count_session,
    }


def _primary_monitor(sct: mss.mss) -> dict:
    # monitors[0] is all displays; [1] is usually the primary screen on Linux
    if len(sct.monitors) > 1:
        return sct.monitors[1]
    return sct.monitors[0]


class OcrPipeline:
    def __init__(
        self,
        session_id: str,
        interval_seconds: int = 10,
        mode: str = "both",
        on_capture: Callable[[int], None] | None = None,
    ) -> None:
        self._session_id = session_id
        self._interval = max(5, interval_seconds)
        self._mode = mode
        self._on_capture = on_capture
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_text = ""
        self._speech_timer: threading.Timer | None = None
        self._capture_lock = threading.Lock()

    def start(self) -> None:
        global _capture_count_session
        _capture_count_session = 0
        check_ocr_available()
        if not _ocr_ready:
            logger.error("OCR unavailable: %s", _ocr_error)
            return
        if self._mode == "off":
            return

        self._stop.clear()

        # Always run periodic captures for speech, both, and interval modes
        if self._mode in ("speech", "both", "interval"):
            interval = (
                SPEECH_BACKUP_INTERVAL_S
                if self._mode == "speech"
                else self._interval
            )
            self._thread = threading.Thread(
                target=self._run_interval,
                args=(interval,),
                daemon=True,
                name="ocr-interval",
            )
            self._thread.start()
            logger.info("OCR started (mode=%s, every %ss)", self._mode, interval)

        # Immediate screenshot when recording starts
        threading.Thread(target=self._capture_now, daemon=True).start()

    def stop(self) -> None:
        self._stop.set()
        if self._speech_timer:
            self._speech_timer.cancel()
            self._speech_timer = None
        if self._thread:
            self._thread.join(timeout=self._interval + 5)
            self._thread = None

    def on_speech(self) -> None:
        if self._mode not in ("speech", "both") or not _ocr_ready:
            return
        if self._speech_timer:
            self._speech_timer.cancel()
        self._speech_timer = threading.Timer(SPEECH_CAPTURE_DEBOUNCE_S, self._capture_now)
        self._speech_timer.daemon = True
        self._speech_timer.start()

    def _run_interval(self, interval: float) -> None:
        with mss.mss() as sct:
            monitor = _primary_monitor(sct)
            while not self._stop.is_set():
                self._stop.wait(interval)
                if self._stop.is_set():
                    break
                try:
                    self._capture(sct, monitor)
                except Exception:
                    logger.exception("OCR interval capture failed")

    def _capture_now(self) -> None:
        if not _ocr_ready:
            return
        try:
            with mss.mss() as sct:
                self._capture(sct, _primary_monitor(sct))
        except Exception:
            logger.exception("OCR capture failed")

    def _capture(self, sct: mss.mss, monitor: dict) -> None:
        import pytesseract

        global _last_capture_at, _capture_count_session

        with self._capture_lock:
            shot = sct.grab(monitor)
            img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
            text = pytesseract.image_to_string(img).strip()

            if text and self._last_text:
                if levenshtein_distance(text, self._last_text) <= LEVENSHTEIN_THRESHOLD:
                    logger.debug("OCR skipped (similar to previous)")
                    return

            if not text:
                text = "(no text detected on screen)"
                logger.debug("OCR: empty text, storing placeholder")

            self._last_text = text if text != "(no text detected on screen)" else self._last_text
            captured_at = datetime.now(timezone.utc).isoformat()
            capture_id = str(uuid.uuid4())
            img_dir = db.capture_image_path(self._session_id, capture_id).parent
            img_dir.mkdir(parents=True, exist_ok=True)
            img.save(db.capture_image_path(self._session_id, capture_id), format="PNG")
            db.insert_screen_capture(self._session_id, capture_id, text, captured_at)
            _last_capture_at = captured_at
            _capture_count_session += 1
            logger.info(
                "Screenshot #%d session %s (%d chars)",
                _capture_count_session,
                self._session_id[:8],
                len(text),
            )
            if self._on_capture:
                try:
                    self._on_capture(_capture_count_session)
                except Exception:
                    pass
