from __future__ import annotations
"""
Small SQLite-backed embedding cache + cosine-similarity ranking helper for
`backend/retrieval/vector_store.py`'s semantic `similarity_search`.

Embeddings are produced by the existing Gemini embedding client in
`backend/knowledge/embeddings.py` (no new heavy dependency, e.g. no
sentence-transformers/torch). Since embedding calls cost money/latency and
would make tests slow and non-deterministic, this module follows the same
`settings.mock_mode` gating already used by
`backend/services/web_search_service.web_search`: in mock mode it returns a
small deterministic pseudo-embedding derived from the text's hash instead of
calling the real embedding API.

Cache storage: a single SQLite database file under `settings.data_dir` (the
same base directory `backend/storage/file_store.py` uses for all persisted
data), keyed by a sha256 hash of the (model, text) pair so identical chunks
across documents/projects only get embedded once.
"""
import hashlib
import sqlite3
import struct
from pathlib import Path

from backend.configs.settings import settings

_MOCK_EMBEDDING_DIM = 768

_DB_FILENAME = "embedding_cache.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS embedding_cache (
    text_hash TEXT PRIMARY KEY,
    model TEXT NOT NULL,
    embedding BLOB NOT NULL
)
"""


def _db_path() -> Path:
    path = Path(settings.data_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path / _DB_FILENAME


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path())
    conn.execute(_SCHEMA)
    return conn


def _hash_key(model: str, text: str) -> str:
    return hashlib.sha256(f"{model}:{text}".encode("utf-8")).hexdigest()


def _pack(embedding: list[float]) -> bytes:
    return struct.pack(f"{len(embedding)}f", *embedding)


def _unpack(blob: bytes) -> list[float]:
    count = len(blob) // 4
    return list(struct.unpack(f"{count}f", blob))


def _mock_embedding(text: str) -> list[float]:
    """
    Deterministic, cheap pseudo-embedding for tests/mock_mode: derived from
    the text's md5 digest, expanded to a fixed dimension so cosine similarity
    still behaves sanely (same text -> identical vector; different text ->
    different vector) without ever calling the real embedding API.
    """
    digest = hashlib.md5(text.encode("utf-8")).digest()
    values = [b / 255.0 for b in digest]
    while len(values) < _MOCK_EMBEDDING_DIM:
        values.extend(values[: _MOCK_EMBEDDING_DIM - len(values)])
    return values[:_MOCK_EMBEDDING_DIM]


def get_embedding(text: str, *, is_query: bool = False) -> list[float]:
    """
    Returns the embedding for `text`, using the on-disk cache when available.
    In `settings.mock_mode`, a deterministic pseudo-embedding is used instead
    of calling the real Gemini embedding API (and is not persisted to the
    cache, since it's cheap to recompute and isn't a real embedding).
    """
    if settings.mock_mode:
        return _mock_embedding(text)

    model = settings.embedding_model
    key = _hash_key(model, text)

    conn = _connect()
    try:
        row = conn.execute(
            "SELECT embedding FROM embedding_cache WHERE text_hash = ?", (key,)
        ).fetchone()
        if row is not None:
            return _unpack(row[0])

        # Imported lazily so importing this module never requires the
        # embeddings client to be configured (e.g. under mock_mode).
        from backend.knowledge import embeddings as embeddings_module

        if is_query:
            embedding = embeddings_module.embed_query(text)
        else:
            [embedding] = embeddings_module.embed_texts([text])

        conn.execute(
            "INSERT OR REPLACE INTO embedding_cache (text_hash, model, embedding) VALUES (?, ?, ?)",
            (key, model, _pack(embedding)),
        )
        conn.commit()
        return embedding
    finally:
        conn.close()


def get_embeddings(texts: list[str]) -> list[list[float]]:
    """Batch convenience wrapper around get_embedding() preserving order."""
    return [get_embedding(text) for text in texts]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Returns cosine similarity in [-1, 1] (0.0 if either vector is all-zero)."""
    if not a or not b or len(a) != len(b):
        return 0.0

    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def rank_by_similarity(
    query_embedding: list[float],
    candidates: list[tuple[str, list[float]]],
) -> list[tuple[str, float]]:
    """
    Ranks `candidates` (list of (key, embedding)) against `query_embedding` by
    cosine similarity, descending (most similar first). Returns
    (key, similarity) pairs.
    """
    scored = [(key, cosine_similarity(query_embedding, emb)) for key, emb in candidates]
    scored.sort(key=lambda row: row[1], reverse=True)
    return scored
