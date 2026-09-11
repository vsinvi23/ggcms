from __future__ import annotations
"""
Tests for backend.orchestration.scheduler (Autonomous Content Factory plan,
Wave 3). Per plan §12, these test contracts, not implementation:

  - topic selection respects min_opportunity_score / daily_limit and orders
    by score
  - Knowledge Pack reuse: a second pass against the same topic does not
    create a second pack
  - publish decision is deterministic: a ContentJob only auto-publishes when
    publish_policy allows it AND the quality report clears both the
    pass/fail floor and the project's auto_publish_threshold
  - circuit breaker halts a pass after consecutive ContentJob failures
"""
import uuid

import pytest

from backend.models.domain import ContentJob, QualityReport, SchedulerRun
from backend.orchestration import scheduler
from backend.storage import file_store


def _quality_report(**overrides) -> QualityReport:
    defaults = dict(
        content_version_id=uuid.uuid4(),
        factuality_score=90.0,
        citation_score=90.0,
        source_integrity_score=90.0,
        learning_quality_score=90.0,
        originality_score=90.0,
        readability_score=90.0,
        seo_score=90.0,
        geo_score=90.0,
        passed=True,
    )
    defaults.update(overrides)
    return QualityReport(**defaults)


class TestOpportunityLifecycle:
    @pytest.mark.asyncio
    async def test_selected_opportunity_advances_past_discovered(
        self, temp_project, project_factory, opportunity_factory, monkeypatch
    ):
        """A run must claim/advance every Opportunity it selects, so a
        second pass never re-selects (and re-publishes) the same one --
        architecture review finding #1."""
        project = project_factory(id=uuid.UUID(temp_project), min_opportunity_score=0, daily_limit=10)
        await file_store.save_project(project)

        opportunity = opportunity_factory(temp_project, topic="Only Topic", score=90)
        await file_store.append_opportunities(temp_project, [opportunity])

        run = SchedulerRun(project_id=project.id)
        await file_store.save_scheduler_run(temp_project, run)

        async def fake_discover(payload):
            return []

        async def fake_create_jobs(project_id, knowledge_pack_id, opportunity_id, content_types, **kwargs):
            return []

        monkeypatch.setattr(
            "backend.api.routers.opportunities.discover_opportunities", fake_discover
        )
        monkeypatch.setattr(scheduler, "create_content_jobs_for_knowledge_pack", fake_create_jobs)

        await scheduler.run_scheduler_pass(run.id, uuid.UUID(temp_project))

        stored = file_store.get_opportunity(temp_project, opportunity.id)
        assert stored.status != "DISCOVERED"
        assert stored.knowledge_pack_id is not None

    @pytest.mark.asyncio
    async def test_second_pass_does_not_reselect_advanced_opportunity(
        self, temp_project, project_factory, opportunity_factory, monkeypatch
    ):
        project = project_factory(id=uuid.UUID(temp_project), min_opportunity_score=0, daily_limit=10)
        await file_store.save_project(project)

        opportunity = opportunity_factory(temp_project, topic="Only Topic", score=90)
        await file_store.append_opportunities(temp_project, [opportunity])

        async def fake_discover(payload):
            return []

        seen_topics = []

        async def fake_create_jobs(project_id, knowledge_pack_id, opportunity_id, content_types, **kwargs):
            opp = file_store.get_opportunity(project_id, opportunity_id)
            seen_topics.append(opp.topic)
            return []

        monkeypatch.setattr(
            "backend.api.routers.opportunities.discover_opportunities", fake_discover
        )
        monkeypatch.setattr(scheduler, "create_content_jobs_for_knowledge_pack", fake_create_jobs)

        run1 = SchedulerRun(project_id=project.id)
        await file_store.save_scheduler_run(temp_project, run1)
        await scheduler.run_scheduler_pass(run1.id, uuid.UUID(temp_project))

        run2 = SchedulerRun(project_id=project.id)
        await file_store.save_scheduler_run(temp_project, run2)
        await scheduler.run_scheduler_pass(run2.id, uuid.UUID(temp_project))

        assert seen_topics == ["Only Topic"]  # only the first pass selected it

        finished2 = file_store.get_scheduler_run(temp_project, run2.id)
        assert finished2.opportunities_selected == 0


class TestSelectTopic:
    @pytest.mark.asyncio
    async def test_creates_new_pack_when_none_exists(self, temp_project, project_factory, opportunity_factory):
        project = project_factory(id=uuid.UUID(temp_project))
        opportunity = opportunity_factory(temp_project, topic="Brand New Topic")

        pack_id = await scheduler._select_topic(project, opportunity)

        packs = file_store.list_knowledge_packs(temp_project)
        assert len(packs) == 1
        assert packs[0].id == pack_id
        assert packs[0].topic == "Brand New Topic"

    @pytest.mark.asyncio
    async def test_reuses_existing_pack_for_same_topic(
        self, temp_project, project_factory, opportunity_factory, knowledge_pack_factory
    ):
        project = project_factory(id=uuid.UUID(temp_project))
        existing_pack = knowledge_pack_factory(temp_project, topic="Shared Topic")
        await file_store.save_knowledge_pack(temp_project, existing_pack)

        opportunity = opportunity_factory(temp_project, topic="Shared Topic")
        pack_id = await scheduler._select_topic(project, opportunity)

        assert pack_id == existing_pack.id
        assert len(file_store.list_knowledge_packs(temp_project)) == 1


class TestMaybePublish:
    @pytest.mark.asyncio
    async def test_leaves_for_manual_review_when_policy_disallows(
        self, temp_project, project_factory, content_job_factory
    ):
        project = project_factory(id=uuid.UUID(temp_project))
        job = content_job_factory(
            temp_project, uuid.uuid4(), uuid.uuid4(), publish_policy="always_review"
        )
        run = SchedulerRun(project_id=project.id)

        await scheduler._maybe_publish(project, job, run)

        assert job.status == "QUEUED"  # untouched
        assert run.content_jobs_published == 0
        assert any("leaving for manual review" in line for line in run.decision_log)

    @pytest.mark.asyncio
    async def test_routes_to_human_review_below_threshold(
        self, temp_project, project_factory, content_job_factory
    ):
        project = project_factory(id=uuid.UUID(temp_project), auto_publish_threshold=85)
        content_item_id = uuid.uuid4()
        job = content_job_factory(
            temp_project,
            uuid.uuid4(),
            uuid.uuid4(),
            publish_policy="auto_if_quality_pass",
            content_item_id=content_item_id,
        )
        # Below auto_publish_threshold even though it would technically PASS
        # the quality gate's own (lower) threshold.
        report = _quality_report(seo_score=10.0, geo_score=10.0)
        await file_store.append_quality_report(temp_project, content_item_id, report)

        run = SchedulerRun(project_id=project.id)
        await scheduler._maybe_publish(project, job, run)

        assert job.status == "HUMAN_REVIEW"
        assert run.content_jobs_human_review == 1
        assert run.content_jobs_published == 0

    @pytest.mark.asyncio
    async def test_publishes_when_policy_allows_and_score_clears_threshold(
        self, temp_project, project_factory, content_job_factory, monkeypatch
    ):
        project = project_factory(id=uuid.UUID(temp_project), auto_publish_threshold=85)
        content_item_id = uuid.uuid4()
        job = content_job_factory(
            temp_project,
            uuid.uuid4(),
            uuid.uuid4(),
            publish_policy="auto_if_quality_pass",
            content_item_id=content_item_id,
        )
        report = _quality_report()  # all 90s -> overall_score well above 85
        await file_store.append_quality_report(temp_project, content_item_id, report)

        called_with = {}

        async def fake_export_content(content_id):
            called_with["content_id"] = content_id

        monkeypatch.setattr(
            "backend.api.routers.content.export_content", fake_export_content
        )

        run = SchedulerRun(project_id=project.id)
        await scheduler._maybe_publish(project, job, run)

        assert called_with["content_id"] == content_item_id
        assert job.status == "PUBLISHED"
        assert run.content_jobs_published == 1

    @pytest.mark.asyncio
    async def test_routes_to_human_review_below_humanization_floor(
        self, temp_project, project_factory, content_job_factory
    ):
        """Even with all 8 pre-existing dimensions at 90, a narrative_voice_score
        below the project's humanization floor must route to HUMAN_REVIEW."""
        project = project_factory(
            id=uuid.UUID(temp_project), auto_publish_threshold=85, humanization_auto_publish_floor=70
        )
        content_item_id = uuid.uuid4()
        job = content_job_factory(
            temp_project,
            uuid.uuid4(),
            uuid.uuid4(),
            publish_policy="auto_if_quality_pass",
            content_item_id=content_item_id,
        )
        report = _quality_report(narrative_voice_score=50.0)
        await file_store.append_quality_report(temp_project, content_item_id, report)

        run = SchedulerRun(project_id=project.id)
        await scheduler._maybe_publish(project, job, run)

        assert job.status == "HUMAN_REVIEW"
        assert run.content_jobs_human_review == 1
        assert run.content_jobs_published == 0
        assert any("humanization floor" in line for line in run.decision_log)

    @pytest.mark.asyncio
    async def test_publishes_when_narrative_voice_score_at_floor(
        self, temp_project, project_factory, content_job_factory, monkeypatch
    ):
        """A narrative_voice_score at/above the floor must not block publish
        when everything else already clears the bar."""
        project = project_factory(
            id=uuid.UUID(temp_project), auto_publish_threshold=85, humanization_auto_publish_floor=70
        )
        content_item_id = uuid.uuid4()
        job = content_job_factory(
            temp_project,
            uuid.uuid4(),
            uuid.uuid4(),
            publish_policy="auto_if_quality_pass",
            content_item_id=content_item_id,
        )
        report = _quality_report(narrative_voice_score=70.0)
        await file_store.append_quality_report(temp_project, content_item_id, report)

        async def fake_export_content(content_id):
            pass

        monkeypatch.setattr(
            "backend.api.routers.content.export_content", fake_export_content
        )

        run = SchedulerRun(project_id=project.id)
        await scheduler._maybe_publish(project, job, run)

        assert job.status == "PUBLISHED"
        assert run.content_jobs_published == 1

    @pytest.mark.asyncio
    async def test_missing_narrative_voice_score_does_not_block_publish(
        self, temp_project, project_factory, content_job_factory, monkeypatch
    ):
        """narrative_voice_score=None simulates a pre-cutover QualityReport --
        it must fail open and not block publish."""
        project = project_factory(
            id=uuid.UUID(temp_project), auto_publish_threshold=85, humanization_auto_publish_floor=70
        )
        content_item_id = uuid.uuid4()
        job = content_job_factory(
            temp_project,
            uuid.uuid4(),
            uuid.uuid4(),
            publish_policy="auto_if_quality_pass",
            content_item_id=content_item_id,
        )
        report = _quality_report(narrative_voice_score=None)
        await file_store.append_quality_report(temp_project, content_item_id, report)

        async def fake_export_content(content_id):
            pass

        monkeypatch.setattr(
            "backend.api.routers.content.export_content", fake_export_content
        )

        run = SchedulerRun(project_id=project.id)
        await scheduler._maybe_publish(project, job, run)

        assert job.status == "PUBLISHED"
        assert run.content_jobs_published == 1

    @pytest.mark.asyncio
    async def test_blocks_publish_when_explicitly_ungrounded(
        self, temp_project, project_factory, content_job_factory
    ):
        """is_grounded=False must block auto-publish even with a perfect score."""
        project = project_factory(id=uuid.UUID(temp_project), auto_publish_threshold=85)
        content_item_id = uuid.uuid4()
        job = content_job_factory(
            temp_project,
            uuid.uuid4(),
            uuid.uuid4(),
            publish_policy="auto_if_quality_pass",
            content_item_id=content_item_id,
        )
        report = _quality_report(is_grounded=False)
        await file_store.append_quality_report(temp_project, content_item_id, report)

        run = SchedulerRun(project_id=project.id)
        await scheduler._maybe_publish(project, job, run)

        assert job.status == "HUMAN_REVIEW"
        assert run.content_jobs_human_review == 1
        assert run.content_jobs_published == 0
        assert any("not adequately grounded" in line for line in run.decision_log)

    @pytest.mark.asyncio
    async def test_missing_is_grounded_does_not_block_publish(
        self, temp_project, project_factory, content_job_factory, monkeypatch
    ):
        """is_grounded=None simulates a pre-cutover QualityReport -- it must
        fail open and not block publish."""
        project = project_factory(id=uuid.UUID(temp_project), auto_publish_threshold=85)
        content_item_id = uuid.uuid4()
        job = content_job_factory(
            temp_project,
            uuid.uuid4(),
            uuid.uuid4(),
            publish_policy="auto_if_quality_pass",
            content_item_id=content_item_id,
        )
        report = _quality_report(is_grounded=None)
        await file_store.append_quality_report(temp_project, content_item_id, report)

        async def fake_export_content(content_id):
            pass

        monkeypatch.setattr(
            "backend.api.routers.content.export_content", fake_export_content
        )

        run = SchedulerRun(project_id=project.id)
        await scheduler._maybe_publish(project, job, run)

        assert job.status == "PUBLISHED"
        assert run.content_jobs_published == 1

    @pytest.mark.asyncio
    async def test_marks_publish_failed_when_export_raises(
        self, temp_project, project_factory, content_job_factory, monkeypatch
    ):
        project = project_factory(id=uuid.UUID(temp_project), auto_publish_threshold=85)
        content_item_id = uuid.uuid4()
        job = content_job_factory(
            temp_project,
            uuid.uuid4(),
            uuid.uuid4(),
            publish_policy="auto_if_quality_pass",
            content_item_id=content_item_id,
        )
        report = _quality_report()
        await file_store.append_quality_report(temp_project, content_item_id, report)

        async def failing_export_content(content_id):
            raise RuntimeError("ggcms unreachable")

        monkeypatch.setattr(
            "backend.api.routers.content.export_content", failing_export_content
        )

        run = SchedulerRun(project_id=project.id)
        await scheduler._maybe_publish(project, job, run)

        assert job.status == "PUBLISH_FAILED"
        assert run.content_jobs_published == 0


class TestRunSchedulerPass:
    @pytest.mark.asyncio
    async def test_selects_by_score_and_respects_daily_limit(
        self, temp_project, project_factory, opportunity_factory, monkeypatch
    ):
        project = project_factory(
            id=uuid.UUID(temp_project), min_opportunity_score=50, daily_limit=1
        )
        await file_store.save_project(project)

        low = opportunity_factory(temp_project, topic="Low", score=40)
        high = opportunity_factory(temp_project, topic="High", score=95)
        mid = opportunity_factory(temp_project, topic="Mid", score=70)
        await file_store.append_opportunities(temp_project, [low, high, mid])

        run = SchedulerRun(project_id=project.id)
        await file_store.save_scheduler_run(temp_project, run)

        async def fake_discover(payload):
            return []

        monkeypatch.setattr(
            "backend.api.routers.opportunities.discover_opportunities", fake_discover
        )

        seen_topics = []

        async def fake_create_jobs(project_id, knowledge_pack_id, opportunity_id, content_types, **kwargs):
            opp = file_store.get_opportunity(project_id, opportunity_id)
            seen_topics.append(opp.topic)
            return []

        monkeypatch.setattr(
            scheduler, "create_content_jobs_for_knowledge_pack", fake_create_jobs
        )

        await scheduler.run_scheduler_pass(run.id, uuid.UUID(temp_project))

        # Only the single highest-scoring eligible opportunity should have
        # been selected (daily_limit=1); "Low" (score=40) is below
        # min_opportunity_score=50 and must never be selected regardless.
        assert seen_topics == ["High"]

        finished = file_store.get_scheduler_run(temp_project, run.id)
        assert finished.status == "SUCCEEDED"
        assert finished.opportunities_selected == 1

    @pytest.mark.asyncio
    async def test_circuit_breaker_halts_after_consecutive_failures(
        self, temp_project, project_factory, opportunity_factory, content_job_factory, monkeypatch
    ):
        project = project_factory(
            id=uuid.UUID(temp_project), min_opportunity_score=0, daily_limit=10
        )
        await file_store.save_project(project)

        opportunities = [
            opportunity_factory(temp_project, topic=f"Topic {i}", score=99)
            for i in range(scheduler.MAX_CONSECUTIVE_FAILURES + 2)
        ]
        await file_store.append_opportunities(temp_project, opportunities)

        run = SchedulerRun(project_id=project.id)
        await file_store.save_scheduler_run(temp_project, run)

        async def fake_discover(payload):
            return []

        monkeypatch.setattr(
            "backend.api.routers.opportunities.discover_opportunities", fake_discover
        )

        created_job_ids = []

        async def fake_create_jobs(project_id, knowledge_pack_id, opportunity_id, content_types, **kwargs):
            job = content_job_factory(project_id, opportunity_id, knowledge_pack_id, status="QUEUED")
            await file_store.save_content_job(project_id, job)
            created_job_ids.append(job.id)
            return [job]

        async def fake_run_content_job(project_id, content_job_id):
            job = file_store.get_content_job(project_id, content_job_id)
            job.status = "FAILED"
            await file_store.save_content_job(project_id, job)

        monkeypatch.setattr(scheduler, "create_content_jobs_for_knowledge_pack", fake_create_jobs)
        monkeypatch.setattr(scheduler, "run_content_job", fake_run_content_job)

        await scheduler.run_scheduler_pass(run.id, uuid.UUID(temp_project))

        finished = file_store.get_scheduler_run(temp_project, run.id)
        assert finished.status == "FAILED"
        assert finished.content_jobs_failed == scheduler.MAX_CONSECUTIVE_FAILURES
        # The pass must have stopped early -- not every opportunity should
        # have gotten a ContentJob created for it.
        assert len(created_job_ids) < len(opportunities)
