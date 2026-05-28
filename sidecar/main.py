"""Auris FastAPI sidecar — audio, transcription, SSE, and REST API."""

from __future__ import annotations

import asyncio
import json
import logging
import sys
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import ai
import database as db
import embeddings
import export as export_mod
from audio import AudioPipeline, get_audio_level
from ocr import OcrPipeline
from transcribe import TranscriptionService, TranscriptionWorker

LOG_DIR = Path.home() / ".auris" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / "sidecar.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("auris.sidecar")

PORT = 9847
API_VERSION = 4


class AppState:
    def __init__(self) -> None:
        self.recording = False
        self.session_id: str | None = None
        self.models_ready = False
        self.model_error: str | None = None
        self.whisper_model = db.get_setting("whisper_model", "base.en") or "base.en"

        self.transcription = TranscriptionService(self.whisper_model)
        self.transcription_worker = TranscriptionWorker(
            self.transcription, on_line=self._on_transcript_line
        )
        self.audio_pipeline: AudioPipeline | None = None
        self.ocr_pipeline: OcrPipeline | None = None
        self.sse_clients: list[asyncio.Queue[dict]] = []
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def _on_transcript_line(self, line: dict[str, Any]) -> None:
        if self.ocr_pipeline:
            self.ocr_pipeline.on_speech()
        if self._loop is None:
            return
        asyncio.run_coroutine_threadsafe(self.broadcast_event("transcript", line=line), self._loop)

    async def broadcast_event(self, event_type: str, **payload: Any) -> None:
        data = {"type": event_type, **payload}
        dead: list[asyncio.Queue] = []
        for q in self.sse_clients:
            try:
                q.put_nowait(data)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            if q in self.sse_clients:
                self.sse_clients.remove(q)

    async def load_models(self) -> None:
        try:
            await asyncio.to_thread(self.transcription.load_model)
            await asyncio.to_thread(embeddings.init_embeddings)
            self.models_ready = True
            self.model_error = None
            logger.info("Models ready")
        except Exception as e:
            self.model_error = str(e)
            logger.exception("Model load failed")

    def _ocr_interval(self) -> int:
        raw = db.get_setting("screenshot_interval", "10")
        try:
            return int(raw or "10")
        except ValueError:
            return 10

    def _ocr_mode(self) -> str:
        return db.get_setting("ocr_mode", "speech") or "speech"

    def start_recording(self) -> dict[str, Any]:
        if self.recording:
            return {"session_id": self.session_id, "status": "already_recording"}

        if not self.models_ready:
            raise RuntimeError(self.model_error or "Models not loaded yet")

        session = db.create_session()
        self.session_id = session["id"]
        self.recording = True

        self.transcription_worker.set_session(self.session_id)
        self.transcription_worker.start()

        def on_chunk(path: Path) -> None:
            self.transcription_worker.enqueue(path)

        self.audio_pipeline = AudioPipeline(on_chunk=on_chunk)
        self.audio_pipeline.start()

        mode = self._ocr_mode()
        if mode != "off":
            self.ocr_pipeline = OcrPipeline(
                self.session_id,
                interval_seconds=self._ocr_interval(),
                mode=mode,
            )
            self.ocr_pipeline.start()

        logger.info("Recording started: session %s", self.session_id)
        return {"session_id": self.session_id, "status": "recording"}

    def stop_recording(self) -> dict[str, Any]:
        if not self.recording:
            return {"status": "not_recording"}

        if self.audio_pipeline:
            self.audio_pipeline.stop()
            self.audio_pipeline = None

        if self.ocr_pipeline:
            self.ocr_pipeline.stop()
            self.ocr_pipeline = None

        self.transcription_worker.stop()

        session_id = self.session_id
        if session_id:
            db.end_session(session_id)
            threading.Thread(
                target=self._summarize_background,
                args=(session_id,),
                daemon=True,
                name="summarize",
            ).start()

        self.recording = False
        self.session_id = None
        logger.info("Recording stopped: session %s", session_id)
        return {"session_id": session_id, "status": "stopped"}

    def _set_fallback_title(self, session_id: str) -> str:
        row = db.get_session(session_id)
        if row and row.get("title"):
            return row["title"]
        started = (row or {}).get("started_at", "")[:16].replace("T", " ")
        title = f"Session {started}" if started else "Session"
        summary = (row or {}).get("summary") or ""
        db.update_session_summary(session_id, title, summary)
        return title

    def _summarize_background(self, session_id: str) -> None:
        result = ai.summarize_session(session_id)
        if not result:
            title = self._set_fallback_title(session_id)
            logger.info("Using fallback title for %s: %s", session_id[:8], title)
            return
        if self._loop:
            asyncio.run_coroutine_threadsafe(
                self.broadcast_event(
                    "summary_ready",
                    session_id=result["session_id"],
                    title=result["title"],
                    summary=result["summary"],
                    action_items=result.get("action_items", []),
                ),
                self._loop,
            )


state = AppState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    state.set_loop(asyncio.get_running_loop())
    asyncio.create_task(state.load_models())
    yield
    if state.recording:
        state.stop_recording()


app = FastAPI(title="Auris Sidecar", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    history: list[dict[str, str]] = []


class SettingsBody(BaseModel):
    settings: dict[str, str]


class ActionItemPatch(BaseModel):
    done: bool


class SessionTitlePatch(BaseModel):
    title: str


class PurgeBody(BaseModel):
    mode: str  # "all" | "retention"
    days: int = 30


@app.get("/status")
def get_status() -> dict[str, Any]:
    return {
        "ok": True,
        "recording": state.recording,
        "session_id": state.session_id,
        "models_ready": state.models_ready,
        "model_error": state.model_error,
        "whisper_model": state.whisper_model,
        "has_api_key": db.has_claude_api_key(),
        "api_version": API_VERSION,
        "audio_level": round(get_audio_level(), 3) if state.recording else 0.0,
    }


@app.get("/stats")
def get_stats():
    stats = db.get_stats()
    try:
        stats["memory_vectors"] = embeddings.count_vectors()
    except Exception:
        stats["memory_vectors"] = 0
    return stats


@app.post("/recording/start")
def recording_start() -> dict[str, Any]:
    try:
        return state.start_recording()
    except OSError:
        raise HTTPException(
            status_code=503,
            detail="Microphone unavailable. Check OS permissions.",
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/recording/stop")
def recording_stop() -> dict[str, Any]:
    return state.stop_recording()


@app.get("/stream")
async def stream():
    async def event_generator():
        queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=100)
        state.sse_clients.append(queue)
        try:
            yield f"data: {json.dumps({'type': 'connected'})}\n\n"
            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(data)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            if queue in state.sse_clients:
                state.sse_clients.remove(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/sessions")
def list_sessions():
    return db.list_sessions()


# Sub-routes must be registered before GET /sessions/{session_id}


@app.patch("/sessions/{session_id}")
def patch_session(session_id: str, body: SessionTitlePatch):
    if not db.get_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    db.update_session_title(session_id, body.title.strip())
    return {"id": session_id, "title": body.title.strip()}


@app.post("/sessions/{session_id}/summarize")
def summarize_session_endpoint(session_id: str):
    session = db.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if not db.has_claude_api_key():
        raise HTTPException(status_code=400, detail="Claude API key required. Save it in Settings.")

    def run():
        result = ai.summarize_session(session_id)
        if result and state._loop:
            asyncio.run_coroutine_threadsafe(
                state.broadcast_event(
                    "summary_ready",
                    session_id=result["session_id"],
                    title=result["title"],
                    summary=result["summary"],
                ),
                state._loop,
            )

    threading.Thread(target=run, daemon=True, name="re-summarize").start()
    return {"status": "summarization_started", "session_id": session_id}


@app.get("/sessions/{session_id}/export")
def export_session_endpoint(
    session_id: str,
    fmt: str = Query("md", alias="format", pattern="^(md|txt)$"),
):
    session = db.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        content = export_mod.export_session(session_id, fmt)
    except ValueError:
        raise HTTPException(status_code=404, detail="Session not found")
    from fastapi.responses import Response

    media = "text/markdown" if fmt == "md" else "text/plain"
    filename = f"auris-session-{session_id[:8]}.{fmt}"
    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.delete("/sessions/{session_id}")
def delete_session(session_id: str):
    db.delete_session(session_id)
    try:
        embeddings.delete_session(session_id)
    except Exception:
        logger.exception("ChromaDB delete failed for %s", session_id)
    return {"deleted": session_id}


@app.get("/sessions/{session_id}")
def get_session(session_id: str):
    session = db.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.patch("/action-items/{item_id}")
def patch_action_item(item_id: str, body: ActionItemPatch):
    db.set_action_item_done(item_id, body.done)
    return {"id": item_id, "done": body.done}


@app.get("/search")
def search(q: str = Query(..., min_length=1), n: int = Query(10, ge=1, le=50)):
    try:
        results = embeddings.query(q, n=n)
        return {"results": results, "query": q}
    except Exception as e:
        logger.exception("Search failed")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat")
async def chat(req: ChatRequest):
    async def event_generator():
        async for chunk in ai.chat_stream(req.message, req.history):
            yield f"data: {json.dumps(chunk)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/data/purge")
def purge_data(body: PurgeBody):
    if body.mode == "all":
        deleted = db.delete_all_sessions()
        try:
            embeddings.reset_all()
        except Exception:
            logger.exception("ChromaDB reset failed")
        return {"deleted_sessions": deleted, "mode": "all"}

    if body.mode == "retention":
        ids = db.list_session_ids_older_than(max(1, body.days))
        for sid in ids:
            db.delete_session(sid)
            try:
                embeddings.delete_session(sid)
            except Exception:
                pass
        return {"deleted_sessions": len(ids), "mode": "retention", "days": body.days}

    raise HTTPException(status_code=400, detail="mode must be 'all' or 'retention'")


@app.get("/settings")
def get_settings():
    keys = [
        "api_key",
        "whisper_model",
        "screenshot_interval",
        "storage_path",
        "theme",
        "start_minimized",
        "auto_record_on_launch",
        "retention_days",
        "onboarding_complete",
        "ocr_mode",
    ]
    result = {k: db.get_setting(k) for k in keys}
    result["has_api_key"] = db.has_claude_api_key()
    result["default_storage_path"] = str(Path.home() / ".auris" / "data")
    result["current_storage_path"] = str(db.get_data_dir())
    return result


@app.post("/settings")
def save_settings(body: SettingsBody):
    for key, value in body.settings.items():
        db.set_setting(key, value if value is not None else "")
    if "whisper_model" in body.settings:
        state.whisper_model = body.settings["whisper_model"]
        try:
            state.transcription.set_model(state.whisper_model)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    if "api_key" in body.settings:
        logger.info("API key updated (has_key=%s)", db.has_claude_api_key())
    return {"saved": list(body.settings.keys()), "has_api_key": db.has_claude_api_key()}


@app.post("/models/retry")
async def retry_models():
    await state.load_models()
    return {"models_ready": state.models_ready, "model_error": state.model_error}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=PORT,
        log_level="info",
        reload=False,
    )
