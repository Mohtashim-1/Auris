"""sentence-transformers + ChromaDB semantic memory."""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any

import chromadb
from chromadb.config import Settings as ChromaSettings
from sentence_transformers import SentenceTransformer

import database as db

logger = logging.getLogger(__name__)

COLLECTION_NAME = "auris_memory"
MODEL_NAME = "all-MiniLM-L6-v2"

_model: SentenceTransformer | None = None
_client: chromadb.ClientAPI | None = None
_collection: chromadb.Collection | None = None
_lock = threading.Lock()


def _chroma_path() -> Path:
    return db.get_data_dir() / "chroma"


def init_embeddings() -> None:
    global _model, _client, _collection
    with _lock:
        if _model is not None:
            return
        logger.info("Loading embedding model: %s", MODEL_NAME)
        _model = SentenceTransformer(MODEL_NAME)
        chroma_dir = _chroma_path()
        chroma_dir.mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(
            path=str(chroma_dir),
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        _collection = _client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info("ChromaDB ready at %s", chroma_dir)


def embed_and_store(
    doc_id: str,
    text: str,
    metadata: dict[str, Any],
) -> None:
    if not text.strip():
        return
    init_embeddings()
    assert _model is not None and _collection is not None

    with _lock:
        embedding = _model.encode(text, show_progress_bar=False).tolist()
        meta = {k: str(v) for k, v in metadata.items() if v is not None}
        _collection.upsert(
            ids=[doc_id],
            embeddings=[embedding],
            documents=[text],
            metadatas=[meta],
        )


def query(text: str, n: int = 5, transcript_only: bool = True) -> list[dict[str, Any]]:
    if not text.strip():
        return []
    init_embeddings()
    assert _model is not None and _collection is not None

    with _lock:
        if _collection.count() == 0:
            return []
        embedding = _model.encode(text, show_progress_bar=False).tolist()
        where = {"type": "transcript"} if transcript_only else None
        kwargs: dict[str, Any] = {
            "query_embeddings": [embedding],
            "n_results": min(n, _collection.count()),
            "include": ["documents", "metadatas", "distances"],
        }
        if where:
            kwargs["where"] = where
        results = _collection.query(**kwargs)

    items: list[dict[str, Any]] = []
    ids = results.get("ids", [[]])[0]
    docs = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]
    dists = results.get("distances", [[]])[0]

    for i, doc_id in enumerate(ids):
        meta = metas[i] if i < len(metas) else {}
        session_id = meta.get("session_id", "")
        session = db.get_session_brief(session_id) if session_id else None
        items.append(
            {
                "id": doc_id,
                "text": docs[i] if i < len(docs) else "",
                "score": 1.0 - (dists[i] if i < len(dists) else 0.0),
                "session_id": session_id,
                "speaker": meta.get("speaker", ""),
                "timestamp": meta.get("timestamp", ""),
                "type": meta.get("type", "transcript"),
                "session_title": session.get("title") if session else None,
                "session_date": session.get("started_at") if session else None,
            }
        )
    return items


def count_vectors() -> int:
    init_embeddings()
    assert _collection is not None
    return _collection.count()


def reset_all() -> None:
    global _collection, _client
    with _lock:
        if _client is not None and _collection is not None:
            existing = _collection.get()
            if existing["ids"]:
                _collection.delete(ids=existing["ids"])


def delete_session(session_id: str) -> None:
    init_embeddings()
    assert _collection is not None
    with _lock:
        existing = _collection.get(where={"session_id": session_id})
        if existing["ids"]:
            _collection.delete(ids=existing["ids"])
