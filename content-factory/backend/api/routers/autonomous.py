from __future__ import annotations
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from backend.models.domain import SchedulerRun
from backend.orchestration.scheduler import run_scheduler_pass
from backend.storage import file_store

router = APIRouter(prefix="/api/autonomous", tags=["Autonomous"])

# Plan §9 specifies GET /api/human-review as its own top-level path (a read
# model, not scoped under /api/autonomous), so it gets its own router
# instance registered separately in main.py rather than sharing the
# /api/autonomous prefix above.
human_review_router = APIRouter(prefix="/api/human-review", tags=["Autonomous"])


class AutonomousRunRequest(BaseModel):
    project_id: uuid.UUID


class AutonomousRunResponse(BaseModel):
    run_id: uuid.UUID


class SchedulerRunOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    status: str
    current_stage: Optional[str] = None
    opportunities_discovered: int
    opportunities_selected: int
    content_jobs_created: int
    content_jobs_generated: int
    content_jobs_published: int
    content_jobs_human_review: int
    content_jobs_failed: int
    error_message: Optional[str] = None
    decision_log: List[str]
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class HumanReviewItemOut(BaseModel):
    content_job_id: uuid.UUID
    project_id: uuid.UUID
    opportunity_id: uuid.UUID
    content_item_id: Optional[uuid.UUID] = None
    content_type: str
    status: str
    reason: Optional[str] = None
    updated_at: datetime


@router.post("/run", response_model=AutonomousRunResponse, status_code=202)
async def start_autonomous_run(req: AutonomousRunRequest, bg_tasks: BackgroundTasks):
    """
    POST /api/autonomous/run -- plan §9. Triggers one scheduler pass
    (discover -> score -> select -> knowledge-pack -> content-jobs ->
    generate -> publish) for a project, dispatched via BackgroundTasks
    exactly like POST /api/generate. Manual-mode routes are untouched --
    this is purely additive and opt-in per call.
    """
    project = file_store.load_project(req.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    in_flight = [
        r for r in file_store.list_scheduler_runs(req.project_id)
        if r.status in ("QUEUED", "RUNNING")
    ]
    if in_flight:
        raise HTTPException(
            status_code=409,
            detail=f"Scheduler run {in_flight[0].id} is already {in_flight[0].status} for this project",
        )

    run = SchedulerRun(project_id=req.project_id, status="QUEUED")
    await file_store.save_scheduler_run(req.project_id, run)

    bg_tasks.add_task(run_scheduler_pass, run.id, req.project_id)
    return AutonomousRunResponse(run_id=run.id)


@router.get("/status/{run_id}", response_model=SchedulerRunOut)
async def get_autonomous_run_status(run_id: uuid.UUID, project_id: uuid.UUID):
    """GET /api/autonomous/status/{run_id}?project_id= -- plan §9."""
    run = file_store.get_scheduler_run(project_id, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Scheduler run not found")
    return run


@human_review_router.get("", response_model=List[HumanReviewItemOut])
async def list_human_review_items(project_id: Optional[uuid.UUID] = None):
    """
    GET /api/human-review -- plan §9. A read model over
    ContentJob.status == "HUMAN_REVIEW", not new storage: joins in the
    latest QualityReport's pass/fail-relevant scores as `reason` where
    available.
    """
    if project_id is not None:
        content_jobs = file_store.list_content_jobs(project_id)
    else:
        content_jobs = [
            j for p in file_store.list_projects() for j in file_store.list_content_jobs(p.id)
        ]

    items: List[HumanReviewItemOut] = []
    for job in content_jobs:
        if job.status != "HUMAN_REVIEW":
            continue
        reason = None
        if job.content_item_id is not None:
            reports = file_store.list_quality_reports(job.project_id, job.content_item_id)
            if reports:
                latest = reports[-1]
                reason = (
                    f"overall_score={latest.overall_score}, passed={latest.passed}"
                    if latest.overall_score is not None
                    else "quality report incomplete"
                )
        items.append(
            HumanReviewItemOut(
                content_job_id=job.id,
                project_id=job.project_id,
                opportunity_id=job.opportunity_id,
                content_item_id=job.content_item_id,
                content_type=job.content_type,
                status=job.status,
                reason=reason,
                updated_at=job.updated_at,
            )
        )
    items.sort(key=lambda i: i.updated_at, reverse=True)
    return items
