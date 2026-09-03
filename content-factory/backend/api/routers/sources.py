import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict

from backend.ingestion.pipeline import ingest_source
from backend.models.base import utcnow
from backend.storage import file_store

router = APIRouter(prefix="/api/sources", tags=["Sources"])

# Per IMPLEMENTATION_SPECIFICATION.md §2 DDL check constraint.
_URL_SOURCE_TYPES = {"url", "website", "sitemap", "rss", "github"}
_UPLOAD_SOURCE_TYPES = {"pdf", "docx", "markdown", "txt"}


class SourceCreate(BaseModel):
    project_id: uuid.UUID
    source_type: str
    url: Optional[str] = None


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
