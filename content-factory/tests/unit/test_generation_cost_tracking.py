from __future__ import annotations
"""
Tests for CostTracker wiring into generation.run_pipeline_job (architecture
review finding #3): a GenerationJob's cost_estimate must actually be
populated, and a job that would push the monthly spend over
settings.max_monthly_ai_budget must be blocked before the pipeline runs
rather than the budget cap sitting completely unenforced.
"""
import uuid

import pytest

from backend.api.routers.generation import run_pipeline_job
from backend.configs.settings import settings
from backend.storage import file_store


@pytest.mark.asyncio
async def test_successful_job_records_a_cost_estimate(
    temp_project, project_factory, opportunity_factory, generation_job_factory
):
    project = project_factory(id=uuid.UUID(temp_project))
    await file_store.save_project(project)

    job = generation_job_factory(temp_project, status="QUEUED")
    await file_store.save_job(temp_project, job)

    await run_pipeline_job(
        job_id=job.id,
        project_id=uuid.UUID(temp_project),
        topic="Python Asyncio Fundamentals",
        content_type="article",
    )

    finished = file_store.get_job(temp_project, job.id)
    assert finished.status == "SUCCEEDED"
    assert finished.cost_estimate is not None
    assert finished.cost_estimate > 0


@pytest.mark.asyncio
async def test_job_blocked_when_monthly_budget_already_exhausted(
    temp_project, project_factory, generation_job_factory, monkeypatch
):
    project = project_factory(id=uuid.UUID(temp_project))
    await file_store.save_project(project)

    monkeypatch.setattr(
        "backend.api.routers.generation._monthly_spend_so_far",
        lambda: settings.max_monthly_ai_budget,
    )

    job = generation_job_factory(temp_project, status="QUEUED")
    await file_store.save_job(temp_project, job)

    await run_pipeline_job(
        job_id=job.id,
        project_id=uuid.UUID(temp_project),
        topic="Python Asyncio Fundamentals",
        content_type="article",
    )

    finished = file_store.get_job(temp_project, job.id)
    assert finished.status == "FAILED"
    assert finished.error_type == "BUDGET_EXCEEDED"
    # Never got as far as starting the pipeline.
    assert finished.started_at is None
