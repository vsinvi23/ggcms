import uuid
from collections import Counter
from typing import Callable, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from backend.storage import file_store

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


class AnalyticsOut(BaseModel):
    sources_total: int
    sources_by_status: dict[str, int]
    opportunities_total: int
    opportunities_by_status: dict[str, int]
    content_items_total: int
    content_items_by_status: dict[str, int]
    generation_jobs_total: int
    generation_jobs_by_status: dict[str, int]


def _counts_by_status(
    list_fn: Callable[[uuid.UUID], list], project_id: Optional[uuid.UUID]
) -> dict[str, int]:
    """
    Replaces the old `select(model.status, func.count()).group_by(model.status)`
    DB aggregation: load the file-store list(s) for the project (or every
    project when project_id is None) and count `.status` in plain Python.
    """
    if project_id is not None:
        project_ids = [project_id]
    else:
        project_ids = [p.id for p in file_store.list_projects()]

    counts: Counter[str] = Counter()
    for pid in project_ids:
        for row in list_fn(pid):
            counts[row.status] += 1
    return dict(counts)


@router.get("", response_model=AnalyticsOut)
async def get_analytics(project_id: Optional[uuid.UUID] = None):
    """
    Aggregate operator-facing counts across sources/opportunities/content/jobs,
    per IMPLEMENTATION_SPECIFICATION.md section 6: `GET /api/analytics?project_id=`.
    """
    sources_by_status = _counts_by_status(file_store.list_sources, project_id)
    opportunities_by_status = _counts_by_status(file_store.list_opportunities, project_id)
    content_items_by_status = _counts_by_status(file_store.list_content_items, project_id)
    generation_jobs_by_status = _counts_by_status(file_store.list_jobs, project_id)

    return AnalyticsOut(
        sources_total=sum(sources_by_status.values()),
        sources_by_status=sources_by_status,
        opportunities_total=sum(opportunities_by_status.values()),
        opportunities_by_status=opportunities_by_status,
        content_items_total=sum(content_items_by_status.values()),
        content_items_by_status=content_items_by_status,
        generation_jobs_total=sum(generation_jobs_by_status.values()),
        generation_jobs_by_status=generation_jobs_by_status,
    )
