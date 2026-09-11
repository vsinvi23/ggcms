from __future__ import annotations
"""
Tests for backend.api.routers.autonomous's concurrency guard (architecture
review finding #2): POST /api/autonomous/run must refuse to start a second
pass for a project that already has a QUEUED/RUNNING SchedulerRun, since
nothing else prevents two concurrent passes from double-selecting the same
Opportunity.
"""
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.configs.settings import settings
from backend.models.domain import SchedulerRun
from backend.storage import file_store


def _auth_headers() -> dict:
    """Builds a valid Bearer JWT for JWTAuthMiddleware (backend/api/middleware/auth.py),
    which requires one on every /api/* route -- see that module's docstring."""
    token = jwt.encode(
        {
            "sub": "test-user",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


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

    resp = client.post("/api/autonomous/run", json={"project_id": temp_project}, headers=_auth_headers())

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

    resp = client.post("/api/autonomous/run", json={"project_id": temp_project}, headers=_auth_headers())

    assert resp.status_code == 202
