from __future__ import annotations
import uuid
from datetime import datetime
from typing import List, Optional, Tuple

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, ConfigDict

from backend.agents.course_agent import plan_course_outline
from backend.api.routers.generation import run_pipeline_job
from backend.exporters.ggcms_client import GgcmsSyncError, push_content
from backend.models.base import utcnow
from backend.models.domain import ContentItem, ExportPackage, GenerationJob, ResourceLink
from backend.schemas.course import CourseOutline
from backend.storage import file_store

router = APIRouter(prefix="/api/content", tags=["Content"])


class CourseOutlineRequest(BaseModel):
    project_id: uuid.UUID
    topic: str
    details: str = ""


class ContentItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    content_plan_id: Optional[uuid.UUID] = None
    content_type: str
    title: str
    slug: str
    summary: Optional[str] = None
    audience: Optional[str] = None
    difficulty: Optional[str] = None
    status: str
    current_version: int
    generated_at: Optional[datetime] = None
    created_at: datetime


class ResourceLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    url: str
    label: Optional[str] = None
    note: Optional[str] = None
    source: str


class ResourceLinkCreate(BaseModel):
    url: str
    label: Optional[str] = None
    note: Optional[str] = None


class ContentItemDetailOut(ContentItemOut):
    body_markdown: Optional[str] = None
    body_json: Optional[dict] = None
    course_outline: Optional[dict] = None
    seo: Optional[dict] = None
    geo: Optional[dict] = None
    resources: List[ResourceLinkOut] = []


class RefreshResponse(BaseModel):
    job_id: uuid.UUID
    status: str


class ExportResponse(BaseModel):
    success: bool
    imported_id: Optional[str] = None
    slug: Optional[str] = None
    version: Optional[int] = None
    message: Optional[str] = None


def _find_content_item(content_id: uuid.UUID) -> Tuple[Optional[uuid.UUID], Optional[ContentItem]]:
    """
    Routes below only carry content_id, not project_id (unchanged from the
    pre-file_store API, which looked content items up by global PK). There's
    no cross-project index, so scan every project's content/ dir for the id.
    """
    for p in file_store.list_projects():
        item = file_store.get_content_item(p.id, content_id)
        if item is not None:
            return p.id, item
    return None, None


@router.post("/course-outline", response_model=CourseOutline)
async def create_course_outline(req: CourseOutlineRequest):
    """
    Preview/plan step for course content: plans a first-class CourseOutline
    (backend/schemas/course.py) for the operator to review BEFORE any
    generation happens -- no ContentItem is created here. Once the operator
    is happy with the outline, pass it back as `course_outline` on
    `POST /api/generate` to have the pipeline generate each lesson.
    """
    project = file_store.load_project(req.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return await plan_course_outline(topic=req.topic, details=req.details, project=project)


@router.get("", response_model=List[ContentItemOut])
async def list_content(
    project_id: uuid.UUID,  # now REQUIRED — prevents cross-project IDOR
    status: Optional[str] = None,
):
    """List content items for a specific project.

    project_id is required to prevent cross-project IDOR: without it a caller
    could enumerate all content items across every project by omitting the param.
    """
    items = file_store.list_content_items(project_id)
    if status is not None:
        items = [c for c in items if c.status == status]
    items.sort(key=lambda c: c.created_at, reverse=True)
    return items


@router.get("/{content_id}", response_model=ContentItemDetailOut)
async def get_content(content_id: uuid.UUID):
    _, item = _find_content_item(content_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Content item not found")
    return item


@router.post("/{content_id}/refresh", response_model=RefreshResponse, status_code=202)
async def refresh_content(content_id: uuid.UUID, bg_tasks: BackgroundTasks):
    """
    Re-runs the generation pipeline (re-research + new version) for an
    existing content item, per IMPLEMENTATION_SPECIFICATION.md section 6:
    `POST /api/content/{id}/refresh -- re-research + new version`.
    """
    project_id, item = _find_content_item(content_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Content item not found")

    job = GenerationJob(
        project_id=item.project_id,
        content_item_id=item.id,
        topic=item.title,
        status="QUEUED",
    )
    await file_store.save_job(project_id, job)

    bg_tasks.add_task(
        run_pipeline_job,
        job.id,
        item.project_id,
        item.title,
        item.content_type,
        item.audience,
        item.difficulty,
        item.id,
    )

    return RefreshResponse(job_id=job.id, status=job.status)


def _find_export_package_for_content(
    project_id: uuid.UUID, content_id: uuid.UUID
) -> Optional[ExportPackage]:
    """Most recent export_package row for this content item, if any.

    `exports.yaml` has no content_id index -- scan and keep the one with the
    latest `created_at`. Used both to short-circuit a duplicate export of an
    already-published, unchanged item and to upsert (rather than always
    mint a fresh id for) the export_package row for repeat attempts on the
    same content item.
    """
    matches = [
        e
        for e in file_store.list_export_packages(project_id)
        if str(e.manifest.get("content_id")) == str(content_id)
    ]
    if not matches:
        return None
    return max(matches, key=lambda e: e.created_at)


@router.post("/{content_id}/export", response_model=ExportResponse)
async def export_content(content_id: uuid.UUID):
    """
    Pushes a READY content item into ggcms via `exporters/ggcms_client.push_content`
    and records an `export_package` row reflecting the outcome.

    Double-export guard: per
    docs/architecture/AUTONOMOUS_CONTENT_FACTORY_IMPLEMENTATION_PLAN.md §1,
    nothing previously prevented calling this route twice for the same
    content item -- `ExportPackage(...)` always minted a fresh id, so two
    calls produced two `export_package` rows and two gg-cms POSTs. Two
    changes fix this:
      1. If the item is already `status == "exported"` for its current
         version (tracked via `export_package.manifest["content_version"]`)
         and the prior export succeeded (`ACKED`), reject with 409 instead
         of re-publishing -- a no-op re-click of Export in the UI shouldn't
         re-POST. `/refresh` bumps `current_version`, so a genuinely new
         version is still exportable.
      2. Otherwise, upsert the content item's existing `export_package` row
         (by reusing its id) instead of always creating a new one, so a
         retried/failed export doesn't accumulate duplicate rows either.
    """
    project_id, item = _find_content_item(content_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Content item not found")

    existing = _find_export_package_for_content(project_id, item.id)
    if (
        existing is not None
        and existing.status == "ACKED"
        and item.status == "exported"
        and existing.manifest.get("content_version") == item.current_version
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Content item {item.id} (version {item.current_version}) was already "
                f"exported to ggcms (imported_id={existing.ggcms_imported_id!r}). "
                "Use /refresh to generate a new version before exporting again."
            ),
        )

    export_package = existing or ExportPackage(project_id=item.project_id, manifest={})
    export_package.manifest = {
        "content_id": str(item.id),
        "title": item.title,
        "slug": item.slug,
        "content_version": item.current_version,
    }
    export_package.status = "PENDING"
    await file_store.save_export_package(project_id, export_package)

    try:
        result = await push_content(item)
    except GgcmsSyncError as e:
        export_package.status = "FAILED"
        await file_store.save_export_package(project_id, export_package)
        raise HTTPException(status_code=502, detail=str(e)) from e

    export_package.status = "ACKED" if result.success else "FAILED"
    export_package.ggcms_imported_id = result.imported_id
    export_package.ggcms_slug = result.slug
    await file_store.save_export_package(project_id, export_package)
    if result.success:
        item.status = "exported"
        await file_store.save_content_item(project_id, item)

    return ExportResponse(
        success=result.success,
        imported_id=result.imported_id,
        slug=result.slug,
        version=result.version,
        message=result.message,
    )


@router.post("/{content_id}/resources", response_model=ContentItemDetailOut)
async def add_resource(content_id: uuid.UUID, req: ResourceLinkCreate):
    """
    Appends a user-recommended reference link to a content item's resource
    section (see backend/models/domain.py::ResourceLink). Mirrors the
    brief/references pattern already shipped for Opportunity discovery, but
    editable by hand here since a content item's resources can grow after
    generation.
    """
    project_id, item = _find_content_item(content_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Content item not found")

    item.resources.append(ResourceLink(url=req.url, label=req.label, note=req.note, source="user_added"))
    await file_store.save_content_item(project_id, item)
    return item


@router.delete("/{content_id}/resources/{index}", response_model=ContentItemDetailOut)
async def remove_resource(content_id: uuid.UUID, index: int):
    project_id, item = _find_content_item(content_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Content item not found")

    if index < 0 or index >= len(item.resources):
        raise HTTPException(status_code=404, detail="Resource not found")

    del item.resources[index]
    await file_store.save_content_item(project_id, item)
    return item
