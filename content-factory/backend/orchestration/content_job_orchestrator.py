from __future__ import annotations
"""
Content Job orchestrator (Autonomous Content Factory plan §6.3/§9/§10,
Wave 2 workstream 2).

A `ContentJob` is the higher-level "what and why" that fans out from one
`KnowledgePack`: which content_type, for whom, under what publish policy.
This module is the thin layer that:

  1. Creates ContentJob rows for a KnowledgePack (`create_content_jobs_for_knowledge_pack`).
  2. Dispatches one ContentJob through the existing, unmodified LangGraph
     pipeline (`backend.workflows.content_pipeline.build_graph`) and maps
     the pipeline's result back onto the ContentJob's own status lifecycle
     (`run_content_job`).

It deliberately reuses -- rather than duplicates -- the exact ContentItem/
ContentVersion/QualityReport persistence logic already used by
`POST /api/generate` (see `backend.api.routers.generation.run_pipeline_job`).
`run_content_job` calls that function directly (creating a `GenerationJob`
row first, exactly as `POST /api/generate` does) instead of re-implementing
draft -> ContentItem mapping here, then re-reads the GenerationJob afterwards
to pull `content_item_id`/final status back onto the ContentJob.

Content type dispatch: only `article` and `course` are wired below.
`content_pipeline.py`'s `generate_draft` node only has two real code paths --
the flat-article `ContentPlan` path (via `ContentPlannerAgent`) and the
per-lesson `course_outline` path (via `course_agent.plan_course_outline` +
per-lesson `WriterAgent` calls, see content_pipeline.py's `generate_draft`).
`quiz`, `cheat_sheet`, `exercises`, and `faq` -- all listed as valid
`ContentJob.content_type` values in the plan (§6.3) -- have NO corresponding
pipeline/agent implementation anywhere in this codebase today (grepped: no
QuizAgent/CheatSheetAgent/FaqAgent, no dedicated planner/writer path, no
prompt template). Creating a ContentJob for one of those types would run the
flat-article path against a content_type the Writer/ContentPlanner prompts
were never designed for, silently mislabeling the output. So
`create_content_jobs_for_knowledge_pack` raises for any content_type outside
`SUPPORTED_CONTENT_TYPES` rather than silently stubbing a fake pipeline for
it -- this is the "note the gap, don't invent handling" instruction from the
assignment.
"""
import logging
import uuid
from typing import Optional

from backend.models.base import utcnow
from backend.models.domain import ContentJob, GenerationJob
from backend.storage import file_store

logger = logging.getLogger(__name__)

# The only content_types content_pipeline.py can actually generate today.
# quiz/cheat_sheet/exercises/faq are real ContentJob.content_type values per
# the plan (§6.3) but have no agent/pipeline path yet -- see module docstring.
SUPPORTED_CONTENT_TYPES = ("article", "course")


class UnsupportedContentTypeError(ValueError):
    """Raised when asked to create a ContentJob for a content_type the
    existing pipeline has no generation path for (see module docstring)."""


async def create_content_jobs_for_knowledge_pack(
    project_id: uuid.UUID | str,
    knowledge_pack_id: uuid.UUID | str,
    opportunity_id: uuid.UUID | str,
    content_types: list[str],
    audience: Optional[str] = None,
    difficulty: Optional[str] = None,
    learning_objectives: Optional[list[str]] = None,
    publish_policy: str = "always_review",
) -> list[ContentJob]:
    """
    Creates and persists one QUEUED ContentJob per requested content_type,
    fanning out from a single KnowledgePack -- the literal "one research
    effort -> many content assets" contract (plan §2/§10).

    Raises UnsupportedContentTypeError (without persisting anything) if any
    requested content_type isn't in SUPPORTED_CONTENT_TYPES, so a caller gets
    an explicit, fail-loud signal rather than a job that will error out (or
    worse, silently mis-generate) once dispatched.
    """
    unsupported = [ct for ct in content_types if ct not in SUPPORTED_CONTENT_TYPES]
    if unsupported:
        raise UnsupportedContentTypeError(
            f"content_type(s) {unsupported} have no generation path in "
            f"content_pipeline.py yet -- supported types are {SUPPORTED_CONTENT_TYPES}. "
            "See backend/orchestration/content_job_orchestrator.py module docstring."
        )

    project_id = uuid.UUID(str(project_id))
    knowledge_pack_id = uuid.UUID(str(knowledge_pack_id))
    opportunity_id = uuid.UUID(str(opportunity_id))

    jobs: list[ContentJob] = []
    for content_type in content_types:
        job = ContentJob(
            project_id=project_id,
            opportunity_id=opportunity_id,
            knowledge_pack_id=knowledge_pack_id,
            content_type=content_type,
            audience=audience,
            difficulty=difficulty,
            learning_objectives=learning_objectives or [],
            publish_policy=publish_policy,
            status="QUEUED",
        )
        await file_store.save_content_job(project_id, job)
        jobs.append(job)

    return jobs


async def run_content_job(project_id: uuid.UUID | str, content_job_id: uuid.UUID | str) -> None:
    """
    Loads a ContentJob, marks it RUNNING, dispatches the existing content
    pipeline via the existing generation.run_pipeline_job (so ContentItem/
    ContentVersion/QualityReport/GenerationJob persistence is exactly the
    same code path `POST /api/generate` already uses -- no duplicated
    mapping logic), then maps the outcome onto ContentJob.status:

        RUNNING -> GENERATED    (pipeline succeeded, is_approved True)
        RUNNING -> QUALITY_FAILED -> HUMAN_REVIEW
                                    (pipeline succeeded, is_approved False --
                                     collapsed straight to HUMAN_REVIEW since
                                     this workstream doesn't build the
                                     publish/quality-gate step; that's the
                                     parallel quality-gate workstream's scope)
        RUNNING -> FAILED       (the pipeline run raised / GenerationJob
                                  itself ended FAILED -- not one of the
                                  plan's named statuses, but ContentJob.status
                                  is a loose string like every other status
                                  field in this codebase, e.g. Opportunity/
                                  Source, so this doesn't require a schema
                                  change; documented here rather than
                                  silently reusing QUALITY_FAILED for a
                                  different failure mode)

    `content_job_id` is threaded into the pipeline's initial state purely for
    traceability (PipelineState.content_job_id, logged, never branched on).
    """
    # Imported lazily to avoid a module-level import cycle: generation.py
    # imports content_pipeline (build_graph) at import time and is itself
    # imported by content.py; importing it here keeps
    # content_job_orchestrator.py free of any import-order requirement
    # relative to the API routers.
    from backend.api.routers.generation import run_pipeline_job

    project_id = uuid.UUID(str(project_id))
    job = file_store.get_content_job(project_id, content_job_id)
    if job is None:
        logger.error(f"ContentJob {content_job_id} not found in project {project_id}")
        return

    opportunity = file_store.get_opportunity(project_id, job.opportunity_id)
    if opportunity is None:
        job.status = "FAILED"
        job.updated_at = utcnow()
        await file_store.save_content_job(project_id, job)
        logger.error(
            f"ContentJob {content_job_id}: linked Opportunity {job.opportunity_id} not found"
        )
        return

    job.status = "RUNNING"
    job.updated_at = utcnow()
    await file_store.save_content_job(project_id, job)

    generation_job = GenerationJob(
        project_id=project_id,
        topic=opportunity.topic,
        status="QUEUED",
    )
    await file_store.save_job(project_id, generation_job)

    job.generation_job_id = generation_job.id
    job.updated_at = utcnow()
    await file_store.save_content_job(project_id, job)

    try:
        await run_pipeline_job(
            job_id=generation_job.id,
            project_id=project_id,
            topic=opportunity.topic,
            content_type=job.content_type,
            audience=job.audience,
            difficulty=job.difficulty,
            content_item_id=None,
            knowledge_pack_ids=[job.knowledge_pack_id],
            enable_web_research=True,
            course_outline=None,
            opportunity_id=job.opportunity_id,
            content_job_id=job.id,
        )
    except Exception as e:
        # run_pipeline_job already fail-loud-catches AgentExecutionError
        # internally and writes GenerationJob.status="FAILED" -- this except
        # only guards against something escaping that (e.g. a bug in
        # run_pipeline_job itself), so ContentJob never gets stuck RUNNING.
        logger.error(f"ContentJob {content_job_id}: run_pipeline_job raised unexpectedly: {e}")
        job = file_store.get_content_job(project_id, content_job_id) or job
        job.status = "FAILED"
        job.updated_at = utcnow()
        await file_store.save_content_job(project_id, job)
        return

    generation_job = file_store.get_job(project_id, generation_job.id)
    job = file_store.get_content_job(project_id, content_job_id) or job

    if generation_job is None or generation_job.status != "SUCCEEDED":
        job.status = "FAILED"
        job.updated_at = utcnow()
        await file_store.save_content_job(project_id, job)
        logger.error(
            f"ContentJob {content_job_id}: underlying GenerationJob "
            f"{generation_job.id if generation_job else '?'} did not succeed "
            f"(status={generation_job.status if generation_job else None})"
        )
        return

    job.content_item_id = generation_job.content_item_id
    is_approved = False
    if generation_job.content_item_id is not None:
        quality_reports = file_store.list_quality_reports(project_id, generation_job.content_item_id)
        if quality_reports:
            is_approved = bool(quality_reports[-1].passed)

    if is_approved:
        job.status = "GENERATED"
    else:
        job.status = "HUMAN_REVIEW"

    job.updated_at = utcnow()
    await file_store.save_content_job(project_id, job)
    logger.info(f"ContentJob {content_job_id} finished with status={job.status}")
