"""Suggests GeekGully (ggcms) topics/categories for a piece of generated
content -- a lightweight, best-effort SUGGESTION only, not a resolver.

ggcms already has real Domain/Category/Topic/ContentTopic entities and
public read endpoints (GET /api/topics, GET /api/categories -- see
gg-cms/backend/go-cms/internal/interfaces/http/router.go). There is no
"resolve a proposed name to MATCH/SUGGESTION/NEW" endpoint on either side
yet -- that's real, deferred follow-on work (see SLAD's Mode B section).
This module does the simplest thing that's still useful today: fetch the
existing topic/category names and return the closest substring/token
matches for a piece of content's title, so a human reviewer has a starting
point instead of nothing.

Never raises -- a ggcms outage or unexpected response must not fail content
generation, since this call happens after the pipeline has already
produced a QUALITY_PASSED draft.
"""
from __future__ import annotations

import logging

import httpx

from backend.configs.settings import settings

logger = logging.getLogger(__name__)

TOPICS_PATH = "/api/topics"
CATEGORIES_PATH = "/api/categories"
REQUEST_TIMEOUT_SECONDS = 5.0
MAX_SUGGESTIONS = 5


def _tokenize(text: str) -> set[str]:
    return {tok for tok in "".join(c.lower() if c.isalnum() else " " for c in text).split() if tok}


def _score(query_tokens: set[str], name: str) -> float:
    name_tokens = _tokenize(name)
    if not name_tokens:
        return 0.0
    overlap = query_tokens & name_tokens
    if not overlap:
        return 0.0
    return len(overlap) / len(name_tokens | query_tokens)


async def _fetch_names(client: httpx.AsyncClient, path: str) -> list[dict]:
    resp = await client.get(f"{settings.ggcms_base_url.rstrip('/')}{path}", timeout=REQUEST_TIMEOUT_SECONDS)
    resp.raise_for_status()
    body = resp.json()
    if isinstance(body, dict):
        body = body.get("data") or body.get("items") or []
    return body if isinstance(body, list) else []


async def suggest_taxonomy(title: str, summary: str | None = None) -> dict:
    """
    Returns {"topics": [...], "categories": [...], "note": "..."}, each a
    list of up to MAX_SUGGESTIONS {"id", "name", "score"} dicts sorted by
    score descending. Returns an empty-but-well-formed result (never raises)
    on any network/parse failure, with the failure reason in "note".
    """
    query_tokens = _tokenize(f"{title} {summary or ''}")
    result = {"topics": [], "categories": [], "note": "suggestion only, not a resolver"}
    if not query_tokens:
        return result

    try:
        async with httpx.AsyncClient() as client:
            topics = await _fetch_names(client, TOPICS_PATH)
            categories = await _fetch_names(client, CATEGORIES_PATH)
    except Exception as e:
        logger.warning(f"[taxonomy_suggest] ggcms lookup failed, returning no suggestions: {e}")
        result["note"] = f"ggcms lookup failed: {e}"
        return result

    for key, rows in (("topics", topics), ("categories", categories)):
        scored = [
            {"id": row.get("id"), "name": row.get("name"), "score": round(_score(query_tokens, row.get("name", "")), 4)}
            for row in rows
            if row.get("name")
        ]
        scored = [s for s in scored if s["score"] > 0]
        scored.sort(key=lambda s: s["score"], reverse=True)
        result[key] = scored[:MAX_SUGGESTIONS]

    return result
