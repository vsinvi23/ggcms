import logging
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict

from backend.ingestion.pipeline import ingest_source
from backend.models.base import utcnow
from backend.models.domain import GenerationJob
from backend.storage import file_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sources", tags=["Sources"])

# Per IMPLEMENTATION_SPECIFICATION.md §2 DDL check constraint.
_URL_SOURCE_TYPES = {"url", "website", "sitemap", "rss", "github"}
_UPLOAD_SOURCE_TYPES = {"pdf", "docx", "markdown", "txt"}


class SourceCreate(BaseModel):
    project_id: uuid.UUID
    source_type: str
    url: Optional[str] = None


class SourceBulkCreate(BaseModel):
    project_id: uuid.UUID
    source_type: str = "url"
    urls: List[str]


class SourceBulkCreateOut(BaseModel):
    job_id: uuid.UUID


class SourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    source_type: str
    title: Optional[str] = None
    url: Optional[str] = None
    status: str
    discovery_method: str
    review_status: str
    discovered_snippet: Optional[str] = None
    search_query: Optional[str] = None
    reviewed_at: Optional[datetime] = None


class SourceReviewOut(BaseModel):
    id: uuid.UUID
    review_status: str


def _jsonable(result: dict) -> dict:
    return {k: (str(v) if isinstance(v, uuid.UUID) else v) for k, v in result.items() if k != "chunks"}


@router.get("", response_model=List[SourceOut])
async def list_sources(
    project_id: Optional[uuid.UUID] = None,
    review_status: Optional[str] = None,
):
    if project_id is None:
        raise HTTPException(status_code=400, detail="project_id is required")
    sources = file_store.list_sources(project_id)
    if review_status is not None:
        sources = [s for s in sources if s.review_status == review_status]
    return sources


@router.post("/{source_id}/approve", response_model=SourceReviewOut)
async def approve_source(source_id: uuid.UUID, project_id: uuid.UUID):
    source = file_store.get_source(project_id, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")

    source.review_status = "APPROVED"
    source.reviewed_at = utcnow()
    await file_store.update_source(project_id, source)
    return {"id": source.id, "review_status": source.review_status}


@router.post("/{source_id}/reject", response_model=SourceReviewOut)
async def reject_source(source_id: uuid.UUID, project_id: uuid.UUID):
    source = file_store.get_source(project_id, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Source not found")

    source.review_status = "REJECTED"
    source.reviewed_at = utcnow()
    await file_store.update_source(project_id, source)
    return {"id": source.id, "review_status": source.review_status}


@router.post("", status_code=202)
async def create_source(payload: SourceCreate):
    """
    Ingests a URL-based source (url/website/sitemap/rss/github) synchronously
    via backend.ingestion.pipeline.ingest_source. File-based sources go
    through POST /api/sources/upload instead.
    """
    if not payload.url:
        raise HTTPException(
            status_code=400, detail="url is required for this source_type"
        )
    result = await ingest_source(
        project_id=payload.project_id,
        source_type=payload.source_type,
        url=payload.url,
    )
    return _jsonable(result)


async def run_bulk_ingest_job(job_id: uuid.UUID, project_id: uuid.UUID, source_type: str, urls: List[str]) -> None:
    """
    Background task: ingests each URL sequentially via ingest_source (reusing
    its existing pre/post-fetch dedup), tracking overall progress on the
    GenerationJob row so GET /api/jobs/{job_id} can be polled for status.
    """
    job = file_store.get_job(project_id, job_id)
    if job is None:
        logger.error(f"bulk-ingest job {job_id} vanished before start")
        return
    job.status = "RUNNING"
    job.started_at = utcnow()
    await file_store.save_job(project_id, job)

    failures = []
    for i, url in enumerate(urls, start=1):
        job.current_node = f"ingesting {i}/{len(urls)}: {url}"
        await file_store.save_job(project_id, job)
        try:
            await ingest_source(project_id=project_id, source_type=source_type, url=url)
        except Exception as exc:  # noqa: BLE001 - one bad URL must not abort the batch
            logger.warning(f"bulk-ingest failed for {url}: {exc}")
            failures.append(url)

    job.status = "SUCCEEDED"
    job.current_node = None
    job.completed_at = utcnow()
    if failures:
        job.error_type = "partial_failure"
        job.error_message = f"{len(failures)}/{len(urls)} URLs failed: {', '.join(failures)}"
    await file_store.save_job(project_id, job)


@router.post("/bulk", response_model=SourceBulkCreateOut, status_code=202)
async def create_sources_bulk(payload: SourceBulkCreate, bg_tasks: BackgroundTasks):
    """
    Accepts a batch of URLs pasted at once, ingesting them one-by-one in a
    background job (see run_bulk_ingest_job) so the request returns
    immediately regardless of batch size. Poll GET /api/jobs/{job_id} for
    progress/completion.
    """
    urls = [u.strip() for u in payload.urls if u.strip()]
    if not urls:
        raise HTTPException(status_code=400, detail="urls must contain at least one non-empty URL")

    job = GenerationJob(project_id=payload.project_id, topic=f"bulk source ingest ({len(urls)} URLs)")
    await file_store.save_job(payload.project_id, job)
    bg_tasks.add_task(run_bulk_ingest_job, job.id, payload.project_id, payload.source_type, urls)
    return SourceBulkCreateOut(job_id=job.id)


@router.post("/upload", status_code=202)
async def upload_source(
    project_id: uuid.UUID = Form(...),
    source_type: str = Form(...),
    file: UploadFile = File(...),
):
    """
    Ingests an uploaded file (pdf/docx/markdown/txt) via the same pipeline
    used for URL sources, triggering fetch(N/A)->extract->normalize->chunk
    ->embed->store synchronously.
    """
    file_bytes = await file.read()
    result = await ingest_source(
        project_id=project_id,
        source_type=source_type,
        file_bytes=file_bytes,
        title=file.filename,
    )
    return _jsonable(result)
