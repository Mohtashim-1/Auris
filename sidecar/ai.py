"""Claude API: session summarization, tasks, and RAG chat."""

from __future__ import annotations

import json
import logging
import re
from typing import Any, AsyncIterator

import anthropic

import database as db
import embeddings

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-20250514"

SUMMARIZE_PROMPT = """You are a meeting assistant. You receive a conversation transcript and optional screen snapshots taken while the user spoke.

Create:
1. title — short descriptive title
2. summary — 2-4 sentences of what was discussed
3. action_items — concrete tasks to do, combining commitments from speech AND anything visible on screen (deadlines, names, todos, links, buttons). Each item one clear sentence.

Respond with ONLY valid JSON:
{"title":"...","summary":"...","action_items":["task 1","task 2"]}"""

CHAT_SYSTEM = """You are Auris, an AI assistant with access to the user's conversation transcripts. Answer based on the provided context. If you don't know, say so. Cite which session/date information comes from."""


def _client() -> anthropic.Anthropic:
    api_key = (db.get_setting("api_key") or "").strip()
    if not db.has_claude_api_key():
        raise ValueError("Claude API key not configured. Add it in Settings and click Save.")
    return anthropic.Anthropic(api_key=api_key)


def _format_session_for_ai(session_id: str) -> str:
    lines = db.get_session_transcript(session_id)
    if not lines:
        return "(empty session)"

    parts = ["## Transcript"]
    for line in lines:
        parts.append(f"[{line['speaker']}] {line['text']}")

    captures = db.get_session_screen_captures(session_id)
    if captures:
        parts.append("\n## Screen snapshots (captured when you spoke)")
        for cap in captures:
            ts = cap.get("captured_at", "")[:19]
            parts.append(f"\n### {ts}\n{cap['ocr_text'][:800]}")

    return "\n".join(parts)


def _parse_summary_json(raw: str) -> dict[str, Any]:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    return json.loads(text)


def summarize_session(session_id: str) -> dict[str, Any] | None:
    if not db.has_claude_api_key():
        logger.info("Skipping summarization — no API key")
        return None

    content = _format_session_for_ai(session_id)
    if content == "(empty session)":
        return None

    try:
        client = _client()
        message = client.messages.create(
            model=MODEL,
            max_tokens=2048,
            messages=[
                {
                    "role": "user",
                    "content": f"{SUMMARIZE_PROMPT}\n\n---\n\n{content}",
                }
            ],
        )
        raw = ""
        for block in message.content:
            if hasattr(block, "text"):
                raw += block.text
        data = _parse_summary_json(raw)

        title = str(data.get("title", "Untitled session"))
        summary = str(data.get("summary", ""))
        action_items = data.get("action_items", [])
        if not isinstance(action_items, list):
            action_items = []

        db.clear_action_items(session_id)
        db.update_session_summary(session_id, title, summary)
        db.insert_action_items(session_id, [str(a) for a in action_items if str(a).strip()])

        return {
            "session_id": session_id,
            "title": title,
            "summary": summary,
            "action_items": action_items,
        }
    except Exception:
        logger.exception("Summarization failed for %s", session_id)
        return None


def _build_context(message: str) -> tuple[str, list[dict[str, str]]]:
    chunks = embeddings.query(message, n=5, transcript_only=True)
    if not chunks:
        return "", []

    citations: list[dict[str, str]] = []
    context_parts: list[str] = []
    seen_sessions: set[str] = set()

    for i, chunk in enumerate(chunks):
        date = chunk.get("session_date", "")
        title = chunk.get("session_title") or "Session"
        sid = chunk.get("session_id", "")
        label = f"{title} ({date[:10] if date else 'unknown date'})"
        context_parts.append(f"[{i + 1}] ({label}) {chunk['text']}")
        if sid and sid not in seen_sessions:
            seen_sessions.add(sid)
            citations.append(
                {
                    "session_id": sid,
                    "label": label,
                    "date": date[:10] if date else "",
                }
            )

    return "\n\n".join(context_parts), citations


async def chat_stream(
    message: str,
    history: list[dict[str, str]],
) -> AsyncIterator[dict[str, Any]]:
    if not db.has_claude_api_key():
        yield {"type": "error", "message": "Claude API key not configured. Add it in Settings."}
        return

    context, citations = _build_context(message)

    system = CHAT_SYSTEM
    if context:
        system += f"\n\nRelevant transcript excerpts:\n{context}"

    messages: list[dict[str, str]] = []
    for h in history[-10:]:
        role = h.get("role", "user")
        if role in ("user", "assistant"):
            messages.append({"role": role, "content": h.get("content", "")})
    messages.append({"role": "user", "content": message})

    yield {"type": "citations", "citations": citations}

    try:
        client = _client()
        with client.messages.stream(
            model=MODEL,
            max_tokens=4096,
            system=system,
            messages=messages,
        ) as stream:
            for text in stream.text_stream:
                yield {"type": "token", "text": text}
        yield {"type": "done"}
    except ValueError as e:
        yield {"type": "error", "message": str(e)}
    except Exception as e:
        logger.exception("Chat stream failed")
        yield {"type": "error", "message": str(e)}
