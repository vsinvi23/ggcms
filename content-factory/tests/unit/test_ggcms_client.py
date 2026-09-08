"""
Unit tests for backend/exporters/ggcms_client.py's retry/backoff and
idempotency-key behavior (plan §1/§4/§17 Wave 2: "ggcms_client.py has zero
retry logic and no idempotency key ... Retry + idempotency key in
ggcms_client.py").

Uses `httpx.MockTransport` (no real network) wired into a real
`httpx.AsyncClient`, passed as `push_content`'s injectable `client` param --
the documented test seam ("callers should inject a fake/mock
httpx.AsyncClient ... for testing").

`asyncio.sleep` is monkeypatched to a no-op so the backoff delays don't slow
the test suite down; the test still asserts the transport was actually
called the expected number of times, which is what proves the retry loop
ran rather than just "not sleeping".
"""
import uuid
from datetime import datetime, timezone

import httpx
import pytest

from backend.exporters.ggcms_client import (
    MAX_ATTEMPTS,
    GgcmsSyncError,
    build_idempotency_key,
    push_content,
)


def _make_content_item(content_id: str | None = None, version: int = 1) -> dict:
    """Minimal object shape `build_sync_payload`/`build_canonical_json` accept.

    Both read fields via attribute-or-dict access (`_get`), so a plain dict
    with the fields `build_canonical_json` requires is enough -- no need to
    construct a full `ContentItem` domain model for this module's tests.
    """
    return {
        "id": content_id or str(uuid.uuid4()),
        "content_type": "article",
        "title": "Async IO in Python",
        "slug": "async-io-in-python",
        "current_version": version,
        "body_json": {
            "summary": "A guide to asyncio.",
            "audience": "intermediate",
            "difficulty": "intermediate",
            "objectives": ["Understand event loops"],
            "sections": [{"section_id": "1", "title": "Intro", "markdown": "# Intro"}],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    }


SUCCESS_BODY = {"success": True, "imported_id": "cms-123", "slug": "async-io-in-python", "version": 1}


@pytest.fixture(autouse=True)
def no_real_sleep(monkeypatch):
    """Skip actual backoff delays; retry-count assertions don't need real time."""
    async def _instant_sleep(_seconds):
        return None

    monkeypatch.setattr("backend.exporters.ggcms_client.asyncio.sleep", _instant_sleep)


class TestBuildIdempotencyKey:
    def test_same_content_id_and_version_produce_same_key(self):
        item = _make_content_item(content_id="abc-123", version=2)
        from backend.exporters.ggcms_client import build_sync_payload

        payload = build_sync_payload(item)
        key_a = build_idempotency_key(item, payload)
        key_b = build_idempotency_key(item, payload)
        assert key_a == key_b

    def test_different_version_produces_different_key(self):
        from backend.exporters.ggcms_client import build_sync_payload

        item_v1 = _make_content_item(content_id="abc-123", version=1)
        item_v2 = _make_content_item(content_id="abc-123", version=2)
        payload_v1 = build_sync_payload(item_v1)
        payload_v2 = build_sync_payload(item_v2)
        assert build_idempotency_key(item_v1, payload_v1) != build_idempotency_key(
            item_v2, payload_v2
        )


class TestPushContentRetry:
    @pytest.mark.asyncio
    async def test_succeeds_immediately_with_no_retries_needed(self):
        calls = []

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(request)
            return httpx.Response(200, json=SUCCESS_BODY)

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            result = await push_content(_make_content_item(), client=client)

        assert result.success is True
        assert len(calls) == 1

    @pytest.mark.asyncio
    async def test_retries_transient_transport_failure_then_succeeds(self):
        calls = {"n": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            calls["n"] += 1
            if calls["n"] < MAX_ATTEMPTS:
                raise httpx.ConnectError("boom", request=request)
            return httpx.Response(200, json=SUCCESS_BODY)

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            result = await push_content(_make_content_item(), client=client)

        assert result.success is True
        assert calls["n"] == MAX_ATTEMPTS

    @pytest.mark.asyncio
    async def test_retries_5xx_then_succeeds(self):
        calls = {"n": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            calls["n"] += 1
            if calls["n"] < MAX_ATTEMPTS:
                return httpx.Response(503, text="upstream unavailable")
            return httpx.Response(200, json=SUCCESS_BODY)

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            result = await push_content(_make_content_item(), client=client)

        assert result.success is True
        assert calls["n"] == MAX_ATTEMPTS

    @pytest.mark.asyncio
    async def test_exhausts_retries_and_raises_on_persistent_transport_failure(self):
        calls = {"n": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            calls["n"] += 1
            raise httpx.ConnectError("still down", request=request)

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            with pytest.raises(GgcmsSyncError):
                await push_content(_make_content_item(), client=client)

        assert calls["n"] == MAX_ATTEMPTS

    @pytest.mark.asyncio
    async def test_4xx_response_is_not_retried(self):
        calls = {"n": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            calls["n"] += 1
            return httpx.Response(400, text="bad payload")

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            with pytest.raises(GgcmsSyncError) as exc_info:
                await push_content(_make_content_item(), client=client)

        assert calls["n"] == 1
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_sends_idempotency_key_header(self):
        seen_headers = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen_headers.update(request.headers)
            return httpx.Response(200, json=SUCCESS_BODY)

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            await push_content(_make_content_item(content_id="fixed-id", version=3), client=client)

        assert "x-idempotency-key" in seen_headers
        assert seen_headers["x-idempotency-key"] == "fixed-id:v3"

    @pytest.mark.asyncio
    async def test_sends_factory_sync_secret_header(self):
        seen_headers = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen_headers.update(request.headers)
            return httpx.Response(200, json=SUCCESS_BODY)

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            await push_content(_make_content_item(), client=client)

        assert "x-factory-sync-secret" in seen_headers
