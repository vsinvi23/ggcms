import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.storage import file_store

router = APIRouter(prefix="/api/jobs", tags=["Jobs"])


class JobOut(BaseModel):
    job_id: uuid.UUID
    status: str
    current_node: Optional[str] = None
    error: Optional[str] = None
    cost_estimate: Optional[float] = None


@router.get("/{job_id}", response_model=JobOut)
async def get_job(job_id: uuid.UUID, project_id: uuid.UUID):
    """
    NOTE (stage 3, file-storage rewrite): jobs.yaml lives under
    data/<project_id>/jobs.yaml (backend/storage/file_store.py), so a job
    lookup now requires project_id -- there is no global job table anymore.
    This adds a required `project_id` query param to this route, a small
    breaking change to the old DB-backed API contract
    (GET /api/jobs/{job_id} used to need only job_id). The Frontend phase's
    API client call site for this endpoint needs to start passing
    `?project_id=...` (the caller already has it -- it's the same project_id
    used to kick off POST /api/generate in the first place).
    """
    job = file_store.get_job(project_id, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    error = None
    if job.error_message:
        error = f"[{job.error_type}] {job.error_message}" if job.error_type else job.error_message

    return JobOut(
        job_id=job.id,
        status=job.status,
        current_node=job.current_node,
        error=error,
        cost_estimate=float(job.cost_estimate) if job.cost_estimate is not None else None,
    )
