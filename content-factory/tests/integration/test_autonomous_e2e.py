"""
End-to-end mocked run of the full autonomous pass (Autonomous Content
Factory plan §12, last bullet): discover -> score -> select -> KnowledgePack
-> ContentJob -> fact-check -> citation-check -> quality-gate -> (publish
decision), using MOCK_MODE=true exactly like run_test.py's existing single-
pipeline check, extended here to the whole scheduler rather than just the
LangGraph.

Deliberately keeps `require_human_approval=True` (-> ContentJob
publish_policy="always_review") so this test never attempts a real
`ggcms_client` HTTP call -- `backend/exporters/ggcms_client.py` has no mock
mode of its own (confirmed: no `settings.mock_mode` branch in that file,
unlike every agent). The scheduler's own auto-publish decision logic (does
it correctly gate on publish_policy/quality threshold) is covered separately
and more precisely by the unit-level `TestMaybePublish` tests in
tests/unit/test_scheduler.py, which stub `export_content` directly.
"""
import uuid

import pytest

from backend.models.domain import SchedulerRun
from backend.orchestration import scheduler
from backend.storage import file_store


@pytest.mark.asyncio
async def test_full_autonomous_pass_mocked(temp_project, project_factory):
    project = project_factory(
        id=uuid.UUID(temp_project),
        niche=["Python Asyncio Fundamentals"],
        min_opportunity_score=0,
        daily_limit=5,
        require_human_approval=True,
    )
    await file_store.save_project(project)

    run = SchedulerRun(project_id=project.id)
    await file_store.save_scheduler_run(temp_project, run)

    await scheduler.run_scheduler_pass(run.id, uuid.UUID(temp_project))

    finished = file_store.get_scheduler_run(temp_project, run.id)
    assert finished.status == "SUCCEEDED", finished.error_message
    assert finished.opportunities_discovered >= 1
    assert finished.opportunities_selected >= 1
    assert finished.content_jobs_created >= 1

    content_jobs = file_store.list_content_jobs(temp_project)
    assert len(content_jobs) == finished.content_jobs_created
    for job in content_jobs:
        # Every job must reach a terminal, non-QUEUED/RUNNING status -- the
        # scheduler must never leave a job stuck mid-flight.
        assert job.status in ("GENERATED", "HUMAN_REVIEW", "FAILED")
        assert job.publish_policy == "always_review"  # require_human_approval=True
        assert job.generation_job_id is not None

    # At least one job must have produced a real ContentItem with a
    # deterministic QualityReport attached -- proving the pipeline actually
    # ran end to end (research -> knowledge -> draft -> fact-check ->
    # citation-check -> quality-gate), not just that the scheduler's own
    # bookkeeping succeeded.
    generated = [j for j in content_jobs if j.status == "GENERATED"]
    assert generated, f"expected at least one GENERATED job, got statuses={[j.status for j in content_jobs]}"

    item_job = generated[0]
    item = file_store.get_content_item(temp_project, item_job.content_item_id)
    assert item is not None
    assert item.body_markdown or item.body_json

    reports = file_store.list_quality_reports(temp_project, item_job.content_item_id)
    assert reports
    latest = reports[-1]
    assert latest.overall_score is not None
    assert latest.passed is not None  # deterministic PASS/FAIL was computed, not an LLM guess

    # Since publish_policy is "always_review", the scheduler must never have
    # auto-published anything, even though mock-mode quality scores clear
    # every threshold.
    assert finished.content_jobs_published == 0
    assert all(j.status != "PUBLISHED" for j in content_jobs)
