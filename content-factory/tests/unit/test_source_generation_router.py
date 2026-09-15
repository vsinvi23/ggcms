from __future__ import annotations
"""
Tests for Mode B (user-provided-source) content generation:
backend/retrieval/vector_store.py::get_chunks_for_source and the
POST /api/sources/{source_id}/generate router's core flow, exercised
directly against run_pipeline_job (same pattern as
test_generation_cost_tracking.py) rather than through FastAPI's
TestClient/JWTAuthMiddleware, since the router itself is a thin
load-source -> get_chunks_for_source -> run_pipeline_job(seed_context_chunks=...,
strict_originality=True) wrapper with no independent logic worth testing
through the HTTP layer.
"""
import uuid

import pytest

from backend.api.routers.generation import run_pipeline_job
from backend.models.domain import KnowledgeChunk, KnowledgeDocument, Source
from backend.retrieval.vector_store import get_chunks_for_source
from backend.storage import file_store


def make_source(project_id: uuid.UUID, **overrides) -> Source:
    defaults = dict(
        project_id=project_id,
        source_type="url",
        title="Test Source",
        url="https://example.com/article",
        content_hash="deadbeef",
        review_status="PENDING",  # get_chunks_for_source must not care about this
    )
    defaults.update(overrides)
    return Source(**defaults)


@pytest.mark.asyncio
async def test_get_chunks_for_source_returns_chunks_regardless_of_review_status(temp_project):
    project_id = uuid.UUID(temp_project)
    source = make_source(project_id)
    await file_store.append_source(temp_project, source)

    document = KnowledgeDocument(source_id=source.id, extracted_text="full text")
    await file_store.save_knowledge_document(temp_project, document)

    chunks = [
        KnowledgeChunk(document_id=document.id, chunk_index=1, text="second chunk"),
        KnowledgeChunk(document_id=document.id, chunk_index=0, text="first chunk"),
    ]
    await file_store.append_knowledge_chunks(temp_project, chunks)

    result = get_chunks_for_source(project_id, source.id)

    assert [c["text"] for c in result] == ["first chunk", "second chunk"]
    assert all(c["url"] == source.url for c in result)


@pytest.mark.asyncio
async def test_get_chunks_for_source_returns_empty_when_no_documents(temp_project):
    project_id = uuid.UUID(temp_project)
    source = make_source(project_id)
    await file_store.append_source(temp_project, source)

    assert get_chunks_for_source(project_id, source.id) == []


@pytest.mark.asyncio
async def test_run_pipeline_job_with_seed_chunks_and_strict_originality_succeeds(
    temp_project, project_factory, generation_job_factory
):
    project = project_factory(id=uuid.UUID(temp_project))
    await file_store.save_project(project)

    job = generation_job_factory(temp_project, status="QUEUED")
    await file_store.save_job(temp_project, job)

    await run_pipeline_job(
        job_id=job.id,
        project_id=uuid.UUID(temp_project),
        topic="A Source-Derived Article",
        content_type="article",
        enable_web_research=False,
        seed_context_chunks=["[Source: https://example.com/article]\nsome source text"],
        strict_originality=True,
    )

    finished = file_store.get_job(temp_project, job.id)
    assert finished.status == "SUCCEEDED"
