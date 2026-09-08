"""
Tests for backend.api.routers.autonomous's concurrency guard (architecture
review finding #2): POST /api/autonomous/run must refuse to start a second
pass for a project that already has a QUEUED/RUNNING SchedulerRun, since
nothing else prevents two concurrent passes from double-selecting the same
Opportunity.
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.models.domain import SchedulerRun
from backend.storage import file_store


@pytest.fixture
def client():
    return TestClient(app)


@pytest.mark.asyncio
async def test_run_rejects_when_a_run_is_already_in_flight(
    temp_project, project_factory, client, monkeypatch
):
    project = project_factory(id=uuid.UUID(temp_project))
    await file_store.save_project(project)

    existing = SchedulerRun(project_id=project.id, status="RUNNING")
    await file_store.save_scheduler_run(temp_project, existing)

    called = {"count": 0}

    def fake_add_task(*args, **kwargs):
        called["count"] += 1

    monkeypatch.setattr(
        "backend.api.routers.autonomous.BackgroundTasks.add_task", fake_add_task
    )

    resp = client.post("/api/autonomous/run", json={"project_id": temp_project})

    assert resp.status_code == 409
    assert called["count"] == 0


@pytest.mark.asyncio
async def test_run_allowed_when_no_run_in_flight(
    temp_project, project_factory, client, monkeypatch
):
    project = project_factory(id=uuid.UUID(temp_project))
    await file_store.save_project(project)

    monkeypatch.setattr(
        "backend.api.routers.autonomous.BackgroundTasks.add_task", lambda *a, **k: None
    )

    resp = client.post("/api/autonomous/run", json={"project_id": temp_project})

    assert resp.status_code == 202
