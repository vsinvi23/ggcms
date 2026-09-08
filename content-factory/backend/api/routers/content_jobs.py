import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from backend.orchestration.content_job_orchestrator import (
    UnsupportedContentTypeError,
    create_content_jobs_for_knowledge_pack,
    run_content_job,
)
from backend.storage import file_store

router = APIRouter(prefix="/api/content-jobs", tags=["Content Jobs"])


class ContentJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    opportunity_id: uuid.UUID
    knowledge_pack_id: uuid.UUID
    content_type: str
    audience: Optional[str] = None
    difficulty: Optional[str] = None
    learning_objectives: List[str] = Field(default_factory=list)
    priority: int = 0
    publish_policy: str
    status: str
    generation_job_id: Optional[uuid.UUID] = None
    content_item_id: Optional[uuid.UUID] = None
    export_package_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime


class ContentJobCreateIn(BaseModel):
    project_id: uuid.UUID
    opportunity_id: uuid.UUID
    knowledge_pack_id: uuid.UUID
    content_types: List[str]
    audience: Optional[str] = None
    difficulty: Optional[str] = None
    learning_objectives: List[str] = Field(default_factory=list)
    publish_policy: str = "always_review"
    # When true (default), each created ContentJob is immediately dispatched
    # via BackgroundTasks, mirroring POST /api/generate's fire-and-forget
    # pattern. Set false to only queue the ContentJob rows (e.g. for a future
    # scheduler to pick up on its own schedule).
    dispatch: bool = True


@router.get("", response_model=List[ContentJobOut])
async def list_content_jobs(
    project_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
):
    """GET /api/content-jobs?project_id=&status= -- plan §9."""
    if project_id is not None:
        rows = file_store.list_content_jobs(project_id)
    else:
        rows = [j for p in file_store.list_projects() for j in file_store.list_content_jobs(p.id)]
    if status is not None:
        rows = [j for j in rows if j.status == status]
    rows.sort(key=lambda j: j.created_at, reverse=True)
    return rows


@router.post("", response_model=List[ContentJobOut], status_code=201)
async def create_content_jobs(req: ContentJobCreateIn, bg_tasks: BackgroundTasks):
    """
    POST /api/content-jobs -- plan §9. Wraps
    create_content_jobs_for_knowledge_pack, fanning one KnowledgePack out
    into one ContentJob per requested content_type, then (by default)
    dispatches each via BackgroundTasks exactly like POST /api/generate.
    """
    project = file_store.load_project(req.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    opportunity = file_store.get_opportunity(req.project_id, req.opportunity_id)
    if opportunity is None:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    pack = file_store.get_knowledge_pack(req.project_id, req.knowledge_pack_id)
    if pack is None:
        raise HTTPException(status_code=404, detail="Knowledge pack not found")

    try:
        jobs = await create_content_jobs_for_knowledge_pack(
            project_id=req.project_id,
            knowledge_pack_id=req.knowledge_pack_id,
            opportunity_id=req.opportunity_id,
            content_types=req.content_types,
            audience=req.audience,
            difficulty=req.difficulty,
            learning_objectives=req.learning_objectives,
            publish_policy=req.publish_policy,
        )
    except UnsupportedContentTypeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if req.dispatch:
        for job in jobs:
            bg_tasks.add_task(run_content_job, req.project_id, job.id)

    return jobs
