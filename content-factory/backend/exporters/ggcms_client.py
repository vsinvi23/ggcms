"""Push approved content from the factory into GG-CMS.

Implements the "ggcms push" contract from IMPLEMENTATION_SPECIFICATION.md
section 9 and docs/import-contract/CONTENT_IMPORT_SCHEMA.md: build a
`SyncPayload`, POST it to `{ggcms_base_url}/api/import/ingest` with the
shared-secret header, and parse the response into a `SyncResult`.

This module never talks to a live ggcms instance in tests -- callers should
inject a fake/mock `httpx.AsyncClient` (or monkeypatch `push_content`) for
testing.
"""
from __future__ import annotations

from typing import Any, Mapping

import httpx
from pydantic import ValidationError

from backend.configs.settings import settings
from backend.exporters.json_exporter import build_canonical_json
from backend.schemas.sync_payload import (
    ArticleBody,
    ArticleSection,
    ContentMetadata,
    CourseSection,
    CourseSpecs,
    ExerciseSpec,
    LearningSpecs,
    LessonSpec,
    ProvenanceSpecs,
    QuizSpec,
    SyncPayload,
    SyncResult,
)

INGEST_PATH = "/api/import/ingest"


class GgcmsSyncError(RuntimeError):
    """Raised when pushing content to ggcms fails.

    Carries the HTTP status code and raw response body (when available) so
    callers can log/report a structured failure rather than a bare
    exception string.
    """

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        response_body: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


def _get(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, Mapping):
        return obj.get(key, default)
    return getattr(obj, key, default)


def build_sync_payload(content_item: Any) -> SyncPayload:
    """Build the ggcms `SyncPayload` for a content item.

    Uses `build_canonical_json` for the fields shared with the canonical
    export JSON (title, slug, description/summary, audience, difficulty,
    objectives, content_type, sections), and reads the sync-specific extras
    (prerequisites, skills_gained, quizzes, exercises, provenance,
    estimated_minutes, language, course sections/lessons) directly from
    `body_json` / the content item, since those aren't part of the
    canonical export envelope.
    """
    body: dict = _get(content_item, "body_json") or {}
    canonical = build_canonical_json(content_item)

    content_type = (canonical.get("content_type") or "article").lower()
    sync_type = "course" if content_type == "course" else "article"

    metadata = ContentMetadata(
        title=canonical["title"],
        slug=canonical["slug"],
        description=canonical["summary"],
        audience=canonical["audience"],
        difficulty=canonical["difficulty"],
        estimated_minutes=int(
            body.get("estimated_minutes") or _get(content_item, "estimated_minutes") or 0
        ),
        language=body.get("language") or _get(content_item, "language") or "en",
    )

    learning = LearningSpecs(
        objectives=canonical.get("objectives") or [],
        prerequisites=body.get("prerequisites", []) or [],
        skills_gained=body.get("skills_gained", []) or [],
    )

    article_body: ArticleBody | None = None
    course_details: CourseSpecs | None = None

    if sync_type == "course":
        course_sections = []
        for sec in body.get("sections", []) or []:
            lessons = [
                LessonSpec(
                    title=lesson.get("title", ""),
                    markdown_body=(
                        lesson.get("markdown_body")
                        or lesson.get("markdown")
                        or lesson.get("content")
                        or ""
                    ),
                    sort_order=lesson.get("sort_order", idx),
                )
                for idx, lesson in enumerate(sec.get("lessons", []) or [])
            ]
            course_sections.append(
                CourseSection(
                    title=sec.get("title", ""),
                    sort_order=sec.get("sort_order", 0),
                    lessons=lessons,
                )
            )
        course_details = CourseSpecs(sections=course_sections)
    else:
        sections = canonical.get("sections") or body.get("sections") or []
        article_sections = [
            ArticleSection(
                section_id=str(sec.get("section_id") or sec.get("id") or idx),
                title=sec.get("title", ""),
                markdown=sec.get("markdown") or sec.get("content") or sec.get("body") or "",
            )
            for idx, sec in enumerate(sections)
        ]
        article_body = ArticleBody(sections=article_sections)

    quizzes = [
        q if isinstance(q, QuizSpec) else QuizSpec.model_validate(q)
        for q in (body.get("quizzes", []) or [])
    ]
    exercises = [
        e if isinstance(e, ExerciseSpec) else ExerciseSpec.model_validate(e)
        for e in (body.get("exercises", []) or [])
    ]

    provenance_data = body.get("provenance", {}) or {}
    quality_data = canonical.get("quality") or {}
    provenance = ProvenanceSpecs(
        model=provenance_data.get("model", ""),
        provider=provenance_data.get("provider", ""),
        agent_version=provenance_data.get("agent_version", ""),
        knowledge_pack_id=provenance_data.get("knowledge_pack_id", ""),
        generated_at=provenance_data.get("generated_at") or canonical["generated_at"],
        quality_score=float(
            provenance_data.get("quality_score")
            if provenance_data.get("quality_score") is not None
            else quality_data.get("score", 0.0) or 0.0
        ),
    )

    return SyncPayload(
        schema_version=canonical["schema_version"],
        content_id=canonical["content_id"],
        type=sync_type,
        metadata=metadata,
        learning=learning,
        article_body=article_body,
        course_details=course_details,
        quizzes=quizzes,
        exercises=exercises,
        provenance=provenance,
    )


async def push_content(
    content_item: Any,
    *,
    client: httpx.AsyncClient | None = None,
    timeout: float = 30.0,
) -> SyncResult:
    """Push a content item into ggcms via `POST /api/import/ingest`.

    Builds the `SyncPayload` from `content_item`, sends it with the shared
    `X-Factory-Sync-Secret` header, and parses the response into a
    `SyncResult`. Raises `GgcmsSyncError` on any transport failure, non-2xx
    response, or a response body that doesn't match `SyncResult`.

    Pass `client` to reuse an existing `httpx.AsyncClient` (e.g. in tests,
    a fake transport); otherwise a short-lived client is created and closed.
    """
    payload = build_sync_payload(content_item)
    url = f"{settings.ggcms_base_url.rstrip('/')}{INGEST_PATH}"
    headers = {"X-Factory-Sync-Secret": settings.factory_sync_secret}

    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=timeout)

    try:
        try:
            response = await client.post(
                url, json=payload.model_dump(mode="json"), headers=headers
            )
        except httpx.HTTPError as exc:
            raise GgcmsSyncError(
                f"Failed to reach ggcms at {url}: {exc}"
            ) from exc
    finally:
        if owns_client:
            await client.aclose()

    if response.status_code < 200 or response.status_code >= 300:
        raise GgcmsSyncError(
            f"ggcms import/ingest failed with status {response.status_code}: {response.text}",
            status_code=response.status_code,
            response_body=response.text,
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise GgcmsSyncError(
            f"ggcms returned a non-JSON response body: {response.text!r}",
            status_code=response.status_code,
            response_body=response.text,
        ) from exc

    try:
        return SyncResult.model_validate(data)
    except ValidationError as exc:
        raise GgcmsSyncError(
            f"ggcms response did not match the expected SyncResult schema: {exc}",
            status_code=response.status_code,
            response_body=response.text,
        ) from exc
