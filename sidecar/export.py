"""Export session — transcript and action items only (no screen OCR)."""

from __future__ import annotations

import database as db


def export_session(session_id: str, fmt: str = "md") -> str:
    session = db.get_session(session_id)
    if session is None:
        raise ValueError("Session not found")

    title = session.get("title") or "Untitled session"
    started = session.get("started_at", "")
    summary = session.get("summary") or ""
    lines = session.get("transcript", [])
    items = session.get("action_items", [])

    if fmt == "txt":
        return _export_txt(title, started, summary, lines, items)
    return _export_md(title, started, summary, lines, items)


def _export_md(title, started, summary, lines, items) -> str:
    parts = [f"# {title}", f"*{started}*", ""]
    if summary:
        parts += ["## Summary", summary, ""]
    if items:
        parts.append("## Action items")
        for item in items:
            mark = "x" if item.get("done") else " "
            parts.append(f"- [{mark}] {item['text']}")
        parts.append("")
    if lines:
        parts.append("## Transcript")
        for line in lines:
            parts.append(
                f"**{line['speaker']}** ({line['started_at']}): {line['text']}"
            )
        parts.append("")
    return "\n".join(parts)


def _export_txt(title, started, summary, lines, items) -> str:
    parts = [title, started, "=" * 40, ""]
    if summary:
        parts += ["SUMMARY", summary, ""]
    if items:
        parts.append("ACTION ITEMS")
        for item in items:
            done = "[x]" if item.get("done") else "[ ]"
            parts.append(f"  {done} {item['text']}")
        parts.append("")
    if lines:
        parts.append("TRANSCRIPT")
        for line in lines:
            parts.append(f"{line['speaker']}: {line['text']}")
        parts.append("")
    return "\n".join(parts)
