"""SQLite schema and queries for Auris."""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

def get_data_dir() -> Path:
    custom = get_setting_raw("storage_path")
    if custom:
        p = Path(custom).expanduser()
        p.mkdir(parents=True, exist_ok=True)
        return p
    return Path.home() / ".auris" / "data"


def get_setting_raw(key: str, default: str | None = None) -> str | None:
    """Read setting without calling get_data_dir (avoids circular init)."""
    path = Path.home() / ".auris" / "data" / "auris.db"
    if not path.parent.exists() and not path.exists():
        return default
    try:
        conn = sqlite3.connect(path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT value FROM settings WHERE key = ?", (key,)
        ).fetchone()
        conn.close()
        if row is None:
            return default
        return row["value"]
    except Exception:
        return default


SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  started_at DATETIME,
  ended_at DATETIME,
  title TEXT,
  summary TEXT,
  duration_seconds INTEGER
);

CREATE TABLE IF NOT EXISTS transcript_lines (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  speaker TEXT,
  text TEXT,
  started_at DATETIME,
  confidence REAL
);

CREATE TABLE IF NOT EXISTS action_items (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  text TEXT,
  done INTEGER DEFAULT 0,
  created_at DATETIME
);

CREATE TABLE IF NOT EXISTS screen_captures (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  ocr_text TEXT,
  captured_at DATETIME
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
"""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_connection() -> sqlite3.Connection:
    data_dir = get_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(data_dir / "auris.db", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(SCHEMA)
        conn.commit()


def get_setting(key: str, default: str | None = None) -> str | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE key = ?", (key,)
        ).fetchone()
    if row is None:
        return default
    return row["value"]


def set_setting(key: str, value: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        conn.commit()


def create_session() -> dict[str, Any]:
    session_id = str(uuid.uuid4())
    started_at = _utc_now()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO sessions (id, started_at) VALUES (?, ?)",
            (session_id, started_at),
        )
        conn.commit()
    return {"id": session_id, "started_at": started_at}


def end_session(session_id: str) -> None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT started_at FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
        ended_at = _utc_now()
        duration_seconds = None
        if row and row["started_at"]:
            started = datetime.fromisoformat(row["started_at"])
            ended = datetime.fromisoformat(ended_at)
            duration_seconds = int((ended - started).total_seconds())
        conn.execute(
            "UPDATE sessions SET ended_at = ?, duration_seconds = ? WHERE id = ?",
            (ended_at, duration_seconds, session_id),
        )
        conn.commit()


def insert_transcript_line(
    session_id: str,
    speaker: str,
    text: str,
    confidence: float,
    started_at: str | None = None,
) -> dict[str, Any]:
    line_id = str(uuid.uuid4())
    ts = started_at or _utc_now()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO transcript_lines (id, session_id, speaker, text, started_at, confidence) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (line_id, session_id, speaker, text, ts, confidence),
        )
        conn.commit()
    return {
        "id": line_id,
        "session_id": session_id,
        "speaker": speaker,
        "text": text,
        "started_at": ts,
        "confidence": confidence,
    }


def get_session_transcript(session_id: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, speaker, text, started_at, confidence FROM transcript_lines "
            "WHERE session_id = ? ORDER BY started_at ASC",
            (session_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def list_sessions() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT s.id, s.started_at, s.ended_at, s.title, s.summary, s.duration_seconds,
                   (SELECT COUNT(*) FROM action_items a WHERE a.session_id = s.id) AS action_item_count
            FROM sessions s
            ORDER BY s.started_at DESC
            """
        ).fetchall()
    return [dict(r) for r in rows]


def get_session(session_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()
    if row is None:
        return None
    session = dict(row)
    session["transcript"] = get_session_transcript(session_id)
    session["action_items"] = get_session_action_items(session_id)
    session["screen_captures"] = get_session_screen_captures(session_id)
    return session


def get_session_brief(session_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, title, started_at FROM sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
    return dict(row) if row else None


def get_session_screen_captures(session_id: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, ocr_text, captured_at FROM screen_captures "
            "WHERE session_id = ? ORDER BY captured_at ASC",
            (session_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def insert_screen_capture(
    session_id: str,
    capture_id: str,
    ocr_text: str,
    captured_at: str,
) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO screen_captures (id, session_id, ocr_text, captured_at) "
            "VALUES (?, ?, ?, ?)",
            (capture_id, session_id, ocr_text, captured_at),
        )
        conn.commit()


def insert_action_items(session_id: str, items: list[str]) -> None:
    if not items:
        return
    now = _utc_now()
    with get_connection() as conn:
        for text in items:
            conn.execute(
                "INSERT INTO action_items (id, session_id, text, done, created_at) "
                "VALUES (?, ?, ?, 0, ?)",
                (str(uuid.uuid4()), session_id, text, now),
            )
        conn.commit()


def set_action_item_done(item_id: str, done: bool) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE action_items SET done = ? WHERE id = ?",
            (1 if done else 0, item_id),
        )
        conn.commit()


def get_session_action_items(session_id: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, text, done, created_at FROM action_items WHERE session_id = ?",
            (session_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def delete_session(session_id: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM transcript_lines WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM action_items WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM screen_captures WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        conn.commit()


def update_session_summary(session_id: str, title: str, summary: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE sessions SET title = ?, summary = ? WHERE id = ?",
            (title, summary, session_id),
        )
        conn.commit()


def clear_action_items(session_id: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM action_items WHERE session_id = ?", (session_id,))
        conn.commit()
