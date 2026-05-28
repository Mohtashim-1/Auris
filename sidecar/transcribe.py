"""faster-whisper transcription with simple speaker heuristics."""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from faster_whisper import WhisperModel

import database as db
import embeddings

logger = logging.getLogger(__name__)

SPEAKER_PAUSE_S = 2.0


@dataclass
class TranscriptSegment:
    text: str
    start_time: float
    end_time: float
    confidence: float


class TranscriptionService:
    def __init__(self, model_name: str = "base.en") -> None:
        self._model_name = model_name
        self._model: WhisperModel | None = None
        self._lock = threading.Lock()
        self._speaker_index = 1
        self._last_chunk_wall_time: float | None = None
        self._session_start: datetime | None = None

    @property
    def model_loaded(self) -> bool:
        return self._model is not None

    @property
    def model_name(self) -> str:
        return self._model_name

    def load_model(self) -> None:
        logger.info("Loading Whisper model: %s", self._model_name)
        self._model = WhisperModel(self._model_name, device="cpu", compute_type="int8")
        logger.info("Whisper model loaded")

    def set_model(self, model_name: str) -> None:
        with self._lock:
            if model_name != self._model_name:
                self._model_name = model_name
                self._model = None
                self.load_model()

    def reset_session(self) -> None:
        self._speaker_index = 1
        self._last_chunk_wall_time = None
        self._session_start = datetime.now(timezone.utc)

    def transcribe_file(self, wav_path: Path) -> TranscriptSegment | None:
        if self._model is None:
            self.load_model()

        with self._lock:
            segments, info = self._model.transcribe(
                str(wav_path),
                beam_size=5,
                vad_filter=True,
            )

        texts: list[str] = []
        confidences: list[float] = []
        start_time = 0.0
        end_time = 0.0

        for i, seg in enumerate(segments):
            t = seg.text.strip()
            if t:
                texts.append(t)
            confidences.append(getattr(seg, "avg_logprob", -0.5))
            if i == 0:
                start_time = seg.start
            end_time = seg.end

        text = " ".join(texts).strip()
        if not text:
            return None

        avg_conf = sum(confidences) / len(confidences) if confidences else -0.5
        confidence = min(1.0, max(0.0, 1.0 + avg_conf / 2))

        return TranscriptSegment(
            text=text,
            start_time=start_time,
            end_time=end_time,
            confidence=round(confidence, 3),
        )

    def assign_speaker(self) -> str:
        now = time.time()
        if self._last_chunk_wall_time is not None:
            if now - self._last_chunk_wall_time > SPEAKER_PAUSE_S:
                self._speaker_index += 1
        self._last_chunk_wall_time = now
        return f"Speaker {self._speaker_index}"


class TranscriptionWorker:
    """Background worker: wav path -> DB + callback."""

    def __init__(
        self,
        service: TranscriptionService,
        on_line: Callable[[dict], None],
    ) -> None:
        self._service = service
        self._on_line = on_line
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._chunk_queue: list[Path] = []
        self._queue_lock = threading.Lock()
        self._session_id: str | None = None
        self._notify = threading.Event()

    def set_session(self, session_id: str) -> None:
        self._session_id = session_id
        self._service.reset_session()

    def enqueue(self, path: Path) -> None:
        with self._queue_lock:
            self._chunk_queue.append(path)
        self._notify.set()

    def start(self) -> None:
        self._stop.clear()
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run, daemon=True, name="transcribe-worker")
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._notify.set()
        if self._thread:
            self._thread.join(timeout=10)
            self._thread = None

    def _run(self) -> None:
        while not self._stop.is_set():
            self._notify.wait(timeout=0.5)
            self._notify.clear()

            while True:
                with self._queue_lock:
                    if not self._chunk_queue:
                        break
                    path = self._chunk_queue.pop(0)

                if self._session_id is None:
                    continue

                try:
                    segment = self._service.transcribe_file(path)
                    if segment is None:
                        continue

                    speaker = self._service.assign_speaker()
                    line = db.insert_transcript_line(
                        self._session_id,
                        speaker,
                        segment.text,
                        segment.confidence,
                    )
                    self._on_line(line)

                    try:
                        embeddings.embed_and_store(
                            line["id"],
                            line["text"],
                            {
                                "session_id": line["session_id"],
                                "speaker": line["speaker"],
                                "timestamp": line["started_at"],
                                "type": "transcript",
                            },
                        )
                    except Exception:
                        logger.exception("Embedding failed")

                except Exception:
                    logger.exception("Transcription failed for %s", path)
                finally:
                    try:
                        path.unlink(missing_ok=True)
                    except OSError:
                        pass
