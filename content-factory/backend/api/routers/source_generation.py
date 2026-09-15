from __future__ import annotations
import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from backend.api.routers.generation import GenerateResponse, run_pipeline_job
from backend.models.domain import GenerationJob
from backend.retrieval.vector_store import get_chunks_for_source
from backend.storage import file_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sources", tags=["Sources"])


class SourceGenerateRequest(BaseModel):
    content_type: str
    audience: str | None = None
    difficulty: str | None = None


@router.post("/{source_id}/generate", response_model=GenerateResponse, status_code=202)
async def generate_from_source(
    source_id: uuid.UUID,
    project_id: uuid.UUID,
    req: SourceGenerateRequest,
    bg_tasks: BackgroundTasks,
):
    """
    Mode B (user-provided-source) entry point: generates one original piece
    of content from a single already-ingested Source, reusing the exact same
    LangGraph pipeline / ContentItem persistence path as POST /api/generate
    (see run_pipeline_job) instead of duplicating it.

    Unlike POST /api/generate, this doesn't take a knowledge_pack_id or
    opportunity_id -- it seeds the pipeline's context_chunks directly from
    this one source's chunks (get_chunks_for_source, ungated by
    review_status since the caller is explicitly supplying this source right
    now) and sets strict_originality=True so quality_check hard-fails on
    near-copy content instead of only warning (see content_pipeline.py's
    quality_check node).
    """
    source = file_store.get_source(project_id, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")

    chunks = get_chunks_for_source(project_id, source_id)
    if not chunks:
        raise HTTPException(
            status_code=400,
            detail="Source has no extracted knowledge chunks yet -- ingestion may still be running or failed",
        )
    seed_context_chunks = [f"[Source: {chunk['url']}]\n{chunk['text']}" for chunk in chunks]

    topic = source.title or source.url or str(source.id)

    job = GenerationJob(
        project_id=project_id,
        topic=topic,
        status="QUEUED",
    )
    await file_store.save_job(project_id, job)

    bg_tasks.add_task(
        run_pipeline_job,
        job.id,
        project_id,
        topic,
        req.content_type,
        req.audience,
        req.difficulty,
        None,  # content_item_id
        None,  # knowledge_pack_ids
        False,  # enable_web_research -- Mode B is single-source, not discovery-driven
        None,  # course_outline
        None,  # opportunity_id
        None,  # content_job_id
        seed_context_chunks,
        True,  # strict_originality
    )

    return GenerateResponse(job_id=job.id)
