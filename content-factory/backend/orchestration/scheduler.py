"""
Autonomous Scheduler (Autonomous Content Factory plan, Wave 3, §9/§16/§17).

`run_scheduler_pass` is the single entry point that drives one full
discover -> score -> select -> knowledge-pack -> content-jobs -> generate ->
publish pass for a project, backing `POST /api/autonomous/run`. It is the
"one component touching almost everything" the plan calls for doing last
(§17) -- it deliberately does not reimplement any stage; it only sequences
existing building blocks:

  1. Discovery + scoring: `backend.api.routers.opportunities.discover_opportunities`
     (reused directly -- it's a plain async function, no HTTP machinery
     needed to call it in-process).
  2. Selection: opportunities with `status == "DISCOVERED"` and
     `score >= project.min_opportunity_score`, ordered by score desc, capped
     by `project.daily_limit` for this pass.
  3. Knowledge Pack: reuse an existing pack for the topic
     (`file_store.list_knowledge_packs`, match by `topic`) or create one via
     `backend.knowledge.packs.create_knowledge_pack`. One pack per topic,
     reused across every content_type generated from it -- the literal
     "one research effort -> many content assets" contract (plan §2).
  4. Content Jobs: `backend.orchestration.content_job_orchestrator
     .create_content_jobs_for_knowledge_pack` + `.run_content_job`, run with
     bounded concurrency (`project.max_concurrent_generation_jobs`) via an
     `asyncio.Semaphore` -- these are the only two functions in this module
     doing real work; everything else is sequencing/bookkeeping.
  5. Publish: after a ContentJob finishes with `status == "GENERATED"`, if
     `publish_policy == "auto_if_quality_pass"` and the linked
     QualityReport's deterministic `passed` (see
     `backend.services.quality_scoring`, scored with the v2/9-dimension
     weight set) is true AND its `overall_score` clears
     `project.auto_publish_threshold` AND its `narrative_voice_score` clears
     `project.humanization_auto_publish_floor` (fail-open if the score is
     absent -- pre-cutover reports) AND it is not explicitly marked
     `is_grounded=False` (fail-open if unset), call
     `backend.api.routers.content.export_content` directly. Otherwise the
     job is left at GENERATED/HUMAN_REVIEW for a human to publish manually --
     the scheduler never force-publishes content that didn't clear the bar.

Circuit breaker (plan §16): the pass halts (marks the run FAILED with a
`decision_reason`-style message) if `MAX_CONSECUTIVE_FAILURES` ContentJobs in
a row end FAILED, so a systemic problem (e.g. a broken API key) doesn't burn
through the entire opportunity list one job at a time.

Every opportunity/topic selection decision and publish decision is appended
to `SchedulerRun.decision_log` (plain strings) so `GET
/api/autonomous/status/{run_id}` gives an operator a readable trace without
needing to cross-reference agent_runs.jsonl.
"""
import asyncio
import logging
import uuid

from backend.models.base import utcnow
from backend.models.domain import Project
from backend.orchestration.content_job_orchestrator import (
    UnsupportedContentTypeError,
    create_content_jobs_for_knowledge_pack,
    run_content_job,
)
from backend.services.dedup import compute_cooldown_until, is_in_cooldown
from backend.storage import file_store

logger = logging.getLogger(__name__)

# Circuit breaker (plan §16): halt a pass after this many ContentJobs in a
# row end FAILED, rather than continuing to burn budget on a systemic issue.
MAX_CONSECUTIVE_FAILURES = 3

# content_pipeline.py only has generation paths for these two types today
# (see backend/orchestration/content_job_orchestrator.py docstring) -- the
# scheduler restricts itself to the same set so it never creates a
# ContentJob doomed to raise UnsupportedContentTypeError.
DEFAULT_CONTENT_TYPES = ("article",)


def passes_floor(score: float | None, floor: float) -> bool:
    """True if `score` is None (fail-open -- backward compat with
    pre-cutover QualityReports that don't have this field yet) or `score`
    clears `floor`."""
    return score is None or score >= floor


async def _select_topic(project: Project, opportunity) -> uuid.UUID:
    """Reuses an existing KnowledgePack for this topic if one exists, else
    creates a new one. Returns the KnowledgePack id. One pack per topic is
    the whole point of the reuse optimization (plan §2/§10)."""
    from backend.retrieval.vector_store import list_knowledge_packs

    existing = [
        p for p in list_knowledge_packs(project.id)
        if p.topic == opportunity.topic
    ]
    if existing:
        return existing[0].id

    from backend.knowledge.packs import create_knowledge_pack

    return await create_knowledge_pack(
        project.id,
        topic=opportunity.topic,
        description=f"Autonomous scheduler pack for opportunity {opportunity.id}",
        source_ids=[],
    )


async def _maybe_publish(project: Project, content_job, run) -> None:
    """Auto-publishes a GENERATED ContentJob if its publish_policy allows it
    and its quality report clears the project's bar. Never force-publishes
    otherwise -- leaves the job for manual review/export."""
    from backend.api.routers.content import export_content
    from backend.services.quality_scoring import compute_overall_quality_score, determine_pass

    if content_job.publish_policy != "auto_if_quality_pass":
        run.decision_log.append(
            f"ContentJob {content_job.id}: publish_policy={content_job.publish_policy!r}, "
            "leaving for manual review/export"
        )
        return

    if content_job.content_item_id is None:
        return

    reports = file_store.list_quality_reports(project.id, content_job.content_item_id)
    if not reports:
        run.decision_log.append(f"ContentJob {content_job.id}: no QualityReport found, skipping publish")
        return

    report = reports[-1]
    report_scores = {
        "factuality_score": report.factuality_score,
        "citation_score": report.citation_score,
        "source_integrity_score": report.source_integrity_score,
        "learning_quality_score": report.learning_quality_score,
        "originality_score": report.originality_score,
        "readability_score": report.readability_score,
        "seo_score": report.seo_score,
        "geo_score": report.geo_score,
    }
    if any(v is None for v in report_scores.values()):
        run.decision_log.append(
            f"ContentJob {content_job.id}: QualityReport missing dimension score(s), skipping publish"
        )
        return

    # narrative_voice_score is a v2-only dimension -- a pre-cutover
    # QualityReport won't have it populated. Only fold it into the weighted
    # v2 scoring when present; otherwise fall back to v1 (its absence is
    # handled separately, and fail-open, by the humanization floor gate
    # below via `passes_floor`).
    if report.narrative_voice_score is not None:
        report_scores["narrative_voice_score"] = report.narrative_voice_score
        scoring_version = "v2"
    else:
        scoring_version = "v1"

    result = compute_overall_quality_score(report_scores, version=scoring_version)
    passed = determine_pass(report_scores, result["overall_score"], version=scoring_version)
    meets_threshold = passed and result["overall_score"] >= project.auto_publish_threshold
    meets_humanization_floor = passes_floor(
        report.narrative_voice_score, project.humanization_auto_publish_floor
    )
    # Fails closed only when explicitly marked ungrounded (`is_grounded is
    # False`) -- an old report with `is_grounded is None` (pre-cutover, field
    # never populated) still passes through unaffected.
    meets_grounding_gate = report.is_grounded is not False

    if not (meets_threshold and meets_humanization_floor and meets_grounding_gate):
        # Checked in this order (floor before threshold) so the decision_log
        # names the actual root cause: a low narrative_voice_score also drags
        # down the v2 weighted overall_score (it's one of the nine weighted
        # dimensions -- see QUALITY_WEIGHTS_V2), so meets_threshold can be
        # simultaneously false purely as a side effect. When the floor itself
        # is the thing that failed, that's what the log should say, not a
        # generic "below auto_publish_threshold" that hides the real reason.
        if not meets_humanization_floor:
            run.decision_log.append(
                f"ContentJob {content_job.id}: blocked: narrative voice score "
                f"({report.narrative_voice_score:.1f}) below humanization floor "
                f"({project.humanization_auto_publish_floor}) -- routed to human review"
            )
        elif not meets_threshold:
            run.decision_log.append(
                f"ContentJob {content_job.id}: overall_score={result['overall_score']:.1f} "
                f"passed={passed}, below auto_publish_threshold={project.auto_publish_threshold} -- "
                "routed to human review"
            )
        else:
            run.decision_log.append(
                f"ContentJob {content_job.id}: blocked: content not adequately grounded "
                "in sources -- routed to human review"
            )
        content_job.status = "HUMAN_REVIEW"
        content_job.updated_at = utcnow()
        await file_store.save_content_job(project.id, content_job)
        run.content_jobs_human_review += 1
        return

    try:
        await export_content(content_job.content_item_id)
    except Exception as e:
        run.decision_log.append(f"ContentJob {content_job.id}: publish failed: {e}")
        content_job.status = "PUBLISH_FAILED"
        content_job.updated_at = utcnow()
        await file_store.save_content_job(project.id, content_job)
        return

    run.decision_log.append(
        f"ContentJob {content_job.id}: overall_score={result['overall_score']:.1f} cleared threshold, published"
    )
    content_job.status = "PUBLISHED"
    content_job.updated_at = utcnow()
    await file_store.save_content_job(project.id, content_job)
    run.content_jobs_published += 1


async def run_scheduler_pass(run_id: uuid.UUID, project_id: uuid.UUID) -> None:
    """
    Drives one autonomous pass for `project_id`, persisting progress onto the
    SchedulerRun row `run_id` (created and QUEUED by the caller before this
    is dispatched, exactly like run_pipeline_job's GenerationJob contract).
    """
    from backend.api.routers.opportunities import OpportunityDiscoverIn, discover_opportunities

    run = file_store.get_scheduler_run(project_id, run_id)
    if run is None:
        logger.error(f"SchedulerRun {run_id} not found in project {project_id}")
        return

    project = file_store.load_project(project_id)
    if project is None:
        run.status = "FAILED"
        run.error_message = f"Project {project_id} not found"
        run.completed_at = utcnow()
        run.updated_at = utcnow()
        await file_store.save_scheduler_run(project_id, run)
        return

    run.status = "RUNNING"
    run.started_at = utcnow()
    run.current_stage = "discover"
    run.updated_at = utcnow()
    await file_store.save_scheduler_run(project_id, run)

    try:
        discovered = await discover_opportunities(OpportunityDiscoverIn(project_id=project.id))
        run.opportunities_discovered = len(discovered)
        run.decision_log.append(f"Discovered/refreshed {len(discovered)} opportunities")

        run.current_stage = "select"
        candidates = [
            o for o in file_store.list_opportunities(project.id)
            if o.status == "DISCOVERED" and o.score is not None
            and o.score >= project.min_opportunity_score
            and not is_in_cooldown(o)
        ]
        candidates.sort(key=lambda o: o.score, reverse=True)
        selected = candidates[: project.daily_limit]
        run.opportunities_selected = len(selected)
        run.decision_log.append(
            f"Selected {len(selected)} of {len(candidates)} eligible opportunities "
            f"(min_opportunity_score={project.min_opportunity_score}, daily_limit={project.daily_limit})"
        )
        await file_store.save_scheduler_run(project.id, run)

        run.current_stage = "generate"
        semaphore = asyncio.Semaphore(max(1, project.max_concurrent_generation_jobs))
        consecutive_failures = 0
        circuit_broken = False

        for opportunity in selected:
            if circuit_broken:
                break

            # Claim immediately so a concurrent/rerun pass never re-selects
            # this opportunity while it's in flight (finding #1/#2 of the
            # architecture review: DISCOVERED opportunities were never
            # advanced, so reruns duplicated ContentJobs/publishes).
            opportunity.status = "GENERATING"
            opportunity.last_generated_at = utcnow()
            await file_store.update_opportunity(project.id, opportunity)

            knowledge_pack_id = await _select_topic(project, opportunity)
            opportunity.knowledge_pack_id = knowledge_pack_id
            await file_store.update_opportunity(project.id, opportunity)

            try:
                jobs = await create_content_jobs_for_knowledge_pack(
                    project.id,
                    knowledge_pack_id,
                    opportunity.id,
                    list(DEFAULT_CONTENT_TYPES),
                    audience=(project.audience[0] if project.audience else None),
                    difficulty=(project.levels[0] if project.levels else None),
                    publish_policy=(
                        "auto_if_quality_pass" if not project.require_human_approval else "always_review"
                    ),
                )
            except UnsupportedContentTypeError as e:
                run.decision_log.append(f"Opportunity {opportunity.id}: {e}")
                opportunity.status = "FAILED"
                await file_store.update_opportunity(project.id, opportunity)
                continue

            run.content_jobs_created += len(jobs)
            await file_store.save_scheduler_run(project.id, run)

            outcomes: list[str] = []

            async def _run_one(job):
                nonlocal consecutive_failures, circuit_broken
                async with semaphore:
                    if circuit_broken:
                        return
                    await run_content_job(project.id, job.id)
                    finished = file_store.get_content_job(project.id, job.id)
                    if finished is None:
                        return
                    if finished.status == "FAILED":
                        consecutive_failures += 1
                        run.content_jobs_failed += 1
                        run.decision_log.append(f"ContentJob {job.id}: FAILED")
                        outcomes.append("FAILED")
                        if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                            circuit_broken = True
                            run.decision_log.append(
                                f"Circuit breaker tripped after {consecutive_failures} "
                                "consecutive ContentJob failures -- halting this pass"
                            )
                        return
                    consecutive_failures = 0
                    if finished.status == "GENERATED":
                        run.content_jobs_generated += 1
                        await _maybe_publish(project, finished, run)
                        outcomes.append(finished.status)
                    elif finished.status == "HUMAN_REVIEW":
                        run.content_jobs_human_review += 1
                        outcomes.append("HUMAN_REVIEW")

            await asyncio.gather(*(_run_one(job) for job in jobs))
            await file_store.save_scheduler_run(project.id, run)

            # Advance the Opportunity to a terminal status so a rerun of this
            # (or a concurrent) pass never re-selects it -- this is the fix
            # for the architecture review's #1 finding (duplicate
            # ContentJobs/publishes on repeated passes).
            if "PUBLISHED" in outcomes:
                final_status = "PUBLISHED"
            elif "HUMAN_REVIEW" in outcomes:
                final_status = "HUMAN_REVIEW"
            elif outcomes and all(o == "FAILED" for o in outcomes):
                final_status = "FAILED"
            elif "GENERATED" in outcomes:
                final_status = "QUALITY_REVIEW"
            else:
                final_status = "FAILED"
            opportunity.status = final_status
            opportunity.cooldown_until = compute_cooldown_until(final_status)
            await file_store.update_opportunity(project.id, opportunity)

        run.status = "FAILED" if circuit_broken else "SUCCEEDED"
        if circuit_broken:
            run.error_message = "Circuit breaker halted the pass after repeated ContentJob failures"

    except Exception as e:
        logger.exception(f"SchedulerRun {run_id} raised unexpectedly")
        run.status = "FAILED"
        run.error_message = str(e)

    run.current_stage = None
    run.completed_at = utcnow()
    run.updated_at = utcnow()
    await file_store.save_scheduler_run(project.id, run)
    logger.info(f"SchedulerRun {run_id} finished with status={run.status}")
