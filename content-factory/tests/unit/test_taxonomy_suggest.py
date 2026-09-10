"""
Tests for backend/services/taxonomy_suggest.py: a best-effort, non-blocking
suggestion lookup against ggcms's existing GET /api/topics / GET /api/categories
(explicitly NOT a resolver -- see module docstring). Must never raise, even
on a network failure, since it's called after a pipeline job has already
produced a QUALITY_PASSED draft.
"""
import httpx
import pytest

from backend.services import taxonomy_suggest


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


class FakeClient:
    def __init__(self, responses: dict):
        self._responses = responses

    async def get(self, url, timeout=None):
        for path, payload in self._responses.items():
            if url.endswith(path):
                return FakeResponse(payload)
        raise AssertionError(f"unexpected url: {url}")

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


@pytest.mark.asyncio
async def test_returns_scored_matches_sorted_descending(monkeypatch):
    fake = FakeClient(
        {
            taxonomy_suggest.TOPICS_PATH: [
                {"id": "1", "name": "Python Asyncio"},
                {"id": "2", "name": "Rust Ownership"},
            ],
            taxonomy_suggest.CATEGORIES_PATH: [
                {"id": "10", "name": "Programming"},
            ],
        }
    )
    monkeypatch.setattr(httpx, "AsyncClient", lambda: fake)

    result = await taxonomy_suggest.suggest_taxonomy(
        "Python Asyncio Fundamentals", summary="A guide to asyncio"
    )

    assert result["note"] == "suggestion only, not a resolver"
    assert result["topics"], "expected at least one topic match"
    assert result["topics"][0]["name"] == "Python Asyncio"
    assert result["topics"][0]["score"] > 0
    # Unrelated topic should not appear.
    assert all(t["name"] != "Rust Ownership" for t in result["topics"])


@pytest.mark.asyncio
async def test_network_failure_returns_empty_well_formed_result_never_raises(monkeypatch):
    class BoomClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url, timeout=None):
            raise httpx.ConnectError("boom")

    monkeypatch.setattr(httpx, "AsyncClient", lambda: BoomClient())

    result = await taxonomy_suggest.suggest_taxonomy("Some Title")

    assert result["topics"] == []
    assert result["categories"] == []
    assert "ggcms lookup failed" in result["note"]


@pytest.mark.asyncio
async def test_blank_title_and_summary_returns_empty_without_network_call(monkeypatch):
    def _unexpected_client():
        raise AssertionError("should not construct an httpx client for empty query")

    monkeypatch.setattr(httpx, "AsyncClient", _unexpected_client)

    result = await taxonomy_suggest.suggest_taxonomy("", summary=None)

    assert result == {"topics": [], "categories": [], "note": "suggestion only, not a resolver"}
