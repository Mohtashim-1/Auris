"""Microphone capture with WebRTC VAD and chunking."""

from __future__ import annotations

import logging
import struct
import threading
import wave
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from queue import Queue
from typing import Callable

import pyaudio
import webrtcvad

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000
CHANNELS = 1
SAMPLE_WIDTH = 2  # 16-bit
FRAME_DURATION_MS = 30
FRAME_SIZE = int(SAMPLE_RATE * FRAME_DURATION_MS / 1000)  # samples per frame
BYTES_PER_FRAME = FRAME_SIZE * SAMPLE_WIDTH
PAUSE_THRESHOLD_S = 1.5
VAD_AGGRESSIVENESS = 2

CHUNKS_DIR = Path.home() / ".auris" / "data" / "chunks"

_level_lock = threading.Lock()
_current_level = 0.0


def get_audio_level() -> float:
    with _level_lock:
        return _current_level


def _rms_level(raw: bytes) -> float:
    n = len(raw) // 2
    if n == 0:
        return 0.0
    samples = struct.unpack(f"<{n}h", raw)
    sq = sum(s * s for s in samples) / n
    rms = (sq**0.5) / 32768.0
    return min(1.0, rms * 4.0)


class AudioPipeline:
    """Captures mic audio, detects voice, flushes chunks on pause."""

    def __init__(self, on_chunk: Callable[[Path], None]) -> None:
        self._on_chunk = on_chunk
        self._vad = webrtcvad.Vad(VAD_AGGRESSIVENESS)
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._audio: pyaudio.PyAudio | None = None

    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self) -> None:
        if self.is_running:
            return
        CHUNKS_DIR.mkdir(parents=True, exist_ok=True)
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True, name="audio-pipeline")
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None

    def _run(self) -> None:
        try:
            self._audio = pyaudio.PyAudio()
            stream = self._audio.open(
                format=pyaudio.paInt16,
                channels=CHANNELS,
                rate=SAMPLE_RATE,
                input=True,
                frames_per_buffer=FRAME_SIZE,
            )
        except OSError as e:
            logger.error("Microphone open failed: %s", e)
            raise

        voiced_frames: deque[bytes] = deque()
        silence_frames = 0
        pause_frames_needed = int(PAUSE_THRESHOLD_S * 1000 / FRAME_DURATION_MS)

        logger.info("Audio pipeline started")

        try:
            global _current_level
            while not self._stop_event.is_set():
                raw = stream.read(FRAME_SIZE, exception_on_overflow=False)
                level = _rms_level(raw)
                with _level_lock:
                    _current_level = _current_level * 0.65 + level * 0.35
                is_speech = self._vad.is_speech(raw, SAMPLE_RATE)

                if is_speech:
                    voiced_frames.append(raw)
                    silence_frames = 0
                else:
                    if voiced_frames:
                        silence_frames += 1
                        voiced_frames.append(raw)

                    if voiced_frames and silence_frames >= pause_frames_needed:
                        self._flush_chunk(voiced_frames)
                        voiced_frames.clear()
                        silence_frames = 0

            if voiced_frames:
                self._flush_chunk(voiced_frames)
        finally:
            stream.stop_stream()
            stream.close()
            if self._audio:
                self._audio.terminate()
                self._audio = None
            with _level_lock:
                _current_level = 0.0
            logger.info("Audio pipeline stopped")

    def _flush_chunk(self, frames: deque[bytes]) -> None:
        if not frames:
            return
        pcm = b"".join(frames)
        if len(pcm) < BYTES_PER_FRAME * 5:
            return

        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
        path = CHUNKS_DIR / f"chunk_{ts}.wav"
        with wave.open(str(path), "wb") as wf:
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(SAMPLE_WIDTH)
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(pcm)

        logger.debug("Chunk saved: %s (%d bytes)", path.name, len(pcm))
        self._on_chunk(path)


class ChunkQueue:
    """Thread-safe queue of wav paths for transcription."""

    def __init__(self) -> None:
        self._queue: Queue[Path] = Queue()

    def put(self, path: Path) -> None:
        self._queue.put(path)

    def get(self, timeout: float | None = 1.0) -> Path | None:
        try:
            return self._queue.get(timeout=timeout)
        except Exception:
            return None
