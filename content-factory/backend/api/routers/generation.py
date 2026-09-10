import logging
import re
import uuid
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from backend.models.base import utcnow
from backend.models.domain import ContentItem, ContentVersion, GenerationJob, QualityReport, ResourceLink
from backend.services.cost_tracker import BudgetExceededError, CostTracker
from backend.storage import file_store
from backend.workflows.content_pipeline import build_graph

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/generate", tags=["Generation"])


def _monthly_spend_so_far() -> float:
    """Sums GenerationJob.cost_estimate across every project for jobs
    created in the current UTC month -- the running total CostTracker checks
    new spend against."""
    now = utcnow()
    total = 0.0
    for project in file_store.list_projects():
        for job in file_store.list_jobs(project.id):
            if job.cost_estimate is None:
                continue
            if job.created_at.year == now.year and job.created_at.month == now.month:
                total += job.cost_estimate
    return total


class GenerateRequest(BaseModel):
    project_id: uuid.UUID
    opportunity_id: uuid.UUID
    content_type: str
    knowledge_pack_ids: List[uuid.UUID] = Field(default_factory=list)
    enable_web_research: bool = True
    target_length: Optional[int] = None
    audience: Optional[str] = None
    difficulty: Optional[str] = None
    # Operator-reviewed CourseOutline (see backend/schemas/course.py) from a
    # prior POST /api/content/course-outline call. Required to actually get
    # per-lesson course generation out of the pipeline when content_type ==
    # "course" -- if omitted, generation falls back to the flat article path.
    course_outline: Optional[dict] = None


class GenerateResponse(BaseModel):
    job_id: uuid.UUID


# Instantiate the compiled graph once
graph = build_graph()


def _slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-")
    return slug or "untitled"


def _flatten_sections_markdown(sections: list[dict]) -> str:
    """
    Flattens a draft's `sections` into one markdown string for
    `ContentItem.body_markdown`. Handles both shapes `draft_json["sections"]`
    can take: flat article sections (`{title, body_markdown}`) and course
    sections (`{title, lessons: [{title, markdown_body}, ...]}`).
    """
    parts = []
    for section in sections or []:
        title = section.get("title", "")
        lessons = section.get("lessons")
        if lessons is not None:
            parts.append(f"## {title}")
            for lesson in lessons:
                lesson_title = lesson.get("title", "")
                lesson_body = (
                    lesson.get("markdown_body")
                    or lesson.get("markdown")
                    or lesson.get("content")
                    or ""
                )
                parts.append(f"### {lesson_title}\n\n{lesson_body}")
        else:
            body = section.get("body_markdown", "")
            parts.append(f"## {title}\n\n{body}")
    return "\n\n".join(parts)


async def run_pipeline_job(
    job_id: uuid.UUID,
    project_id: uuid.UUID,
    topic: str,
    content_type: str,
    audience: Optional[str] = None,
    difficulty: Optional[str] = None,
    content_item_id: Optional[uuid.UUID] = None,
    knowledge_pack_ids: Optional[List[uuid.UUID]] = None,
    enable_web_research: bool = True,
    course_outline: Optional[dict] = None,
    opportunity_id: Optional[uuid.UUID] = None,
    content_job_id: Optional[uuid.UUID] = None,
    seed_context_chunks: Optional[List[str]] = None,
    strict_originality: bool = False,
) -> None:
    """
    Background task: runs the LangGraph content pipeline end-to-end, keeping
    the `generation_job` row's status/current_node in step with progress
    (QUEUED -> RUNNING -> SUCCEEDED | FAILED per
    IMPLEMENTATION_SPECIFICATION.md sections 2/6), and persists a
    ContentItem/ContentVersion/QualityReport on success.

    `content_job_id` (new, additive, plan §10) is optional and used purely
    for traceability -- passed through to PipelineState.content_job_id for
    logging, never branched on. Only the Content Job orchestrator
    (backend/orchestration/content_job_orchestrator.py) passes it; the
    existing `/api/generate` and `/api/content/{id}/refresh` call sites are
    unaffected (it defaults to None).

    `seed_context_chunks`/`strict_originality` back Mode B (user-provided-
    source generation, see backend/api/routers/source_generation.py): when
    given, `seed_context_chunks` becomes the pipeline's starting
    context_chunks (so research_web's web-search branch augments rather than
    replaces them) and `strict_originality=True` makes quality_check hard-
    fail on originality_check's near_copy_flag instead of only warning.
    Both default to no-ops for every existing call site.
    """
    job = file_store.get_job(project_id, job_id)
    if job is None:
        logger.error(f"GenerationJob {job_id} vanished before pipeline start")
        return

    monthly_spend_so_far = _monthly_spend_so_far()
    tracker = CostTracker(str(job_id), monthly_spend_so_far=monthly_spend_so_far)

    # There's no flat pre-flight charge anymore -- real per-call cost accrues
    # token-by-token as the pipeline runs (CostTracker.add_usage, called from
    # invoke_structured). But a project that's *already* over its monthly cap
    # should still be blocked before wasting any API calls, so this check
    # mirrors the previous pre-flight guard using the same
    # _monthly_spend_so_far() function and BudgetExceededError pattern.
    if monthly_spend_so_far >= tracker.max_monthly_ai_budget:
        e = BudgetExceededError(
            f"Job '{job_id}' blocked: monthly spend {monthly_spend_so_far:.4f} "
            f"already at/over cap {tracker.max_monthly_ai_budget:.4f}",
            cap_type="monthly",
            current=monthly_spend_so_far,
            limit=tracker.max_monthly_ai_budget,
        )
        logger.error(f"GenerationJob {job_id} blocked before start: {e}")
        job.status = "FAILED"
        job.error_type = e.error_type
        job.error_message = str(e)
        job.cost_estimate = 0.0
        job.completed_at = utcnow()
        await file_store.save_job(project_id, job)
        return

    job.status = "RUNNING"
    job.started_at = utcnow()
    await file_store.save_job(project_id, job)

    # For an existing content item (refresh), fall back to whatever
    # CourseOutline was already attached rather than requiring the caller to
    # re-pass it every time.
    if course_outline is None and content_item_id is not None:
        existing_item = file_store.get_content_item(project_id, content_item_id)
        if existing_item is not None:
            course_outline = existing_item.course_outline

    initial_state = {
        "project_id": str(project_id),
        "topic": topic,
        "knowledge_pack_ids": [str(pid) for pid in (knowledge_pack_ids or [])],
        "knowledge_pack_id": str(knowledge_pack_ids[0]) if knowledge_pack_ids else None,
        "content_job_id": str(content_job_id) if content_job_id is not None else None,
        "enable_web_research": enable_web_research,
        "content_type": content_type,
        "course_outline": course_outline,
        "context_chunks": seed_context_chunks,
        "strict_originality": strict_originality,
        "revisions_count": 0,
        "is_approved": False,
        "evidence_pack": None,
        "learning_plan": None,
        "content_plan": None,
        "draft_json": None,
        "quality_report": None,
        "cost_tracker": tracker,
    }

    final_state: dict = dict(initial_state)
    try:
        logger.info(f"--- STARTING MULTI-AGENT PIPELINE FOR: {topic} (job={job_id}) ---")
        async for step in graph.astream(initial_state):
            node_name = next(iter(step))
            final_state.update(step[node_name])
            job = file_store.get_job(project_id, job_id)
            if job is not None:
                job.current_node = node_name
                await file_store.save_job(project_id, job)

        job = file_store.get_job(project_id, job_id)
        if job is None:
            return

        draft = final_state.get("draft_json") or {}
        quality = final_state.get("quality_report") or {}
        is_approved = bool(final_state.get("is_approved"))
        title = draft.get("title") or topic

        content_item: Optional[ContentItem] = None
        if content_item_id is not None:
            content_item = file_store.get_content_item(project_id, content_item_id)

        if content_item is None:
            # Seed the resources list from the approved Opportunity's
            # references (signals["references"], see backend/api/routers/
            # opportunities.py), tagged so the UI can distinguish them from
            # ones the operator adds later via POST /api/content/{id}/resources.
            seeded_resources: list[ResourceLink] = []
            if opportunity_id is not None:
                opportunity = file_store.get_opportunity(project_id, opportunity_id)
                references = (opportunity.signals or {}).get("references") if opportunity else None
                for url in references or []:
                    if isinstance(url, str) and url:
                        seeded_resources.append(ResourceLink(url=url, source="carried_from_opportunity"))

            content_item = ContentItem(
                project_id=project_id,
                content_type=content_type,
                title=title,
                slug=_slugify(title),
                summary=draft.get("summary"),
                audience=audience,
                difficulty=difficulty,
                course_outline=course_outline,
                resources=seeded_resources,
            )
        else:
            content_item.current_version += 1
            content_item.title = title
            content_item.summary = draft.get("summary")
            if course_outline is not None:
                content_item.course_outline = course_outline

        content_item.body_markdown = _flatten_sections_markdown(draft.get("sections", []))
        content_item.body_json = draft
        # ContentItem.status is now Literal["draft", "exported"] (stage 1) --
        # the old READY/REVISION CHECK-constraint values no longer exist.
        # Generation always leaves a content item in "draft"; only the export
        # router (a later stage) flips it to "exported".
        content_item.generated_at = utcnow()

        if is_approved:
            try:
                from backend.services.taxonomy_suggest import suggest_taxonomy
                content_item.taxonomy_suggestions = await suggest_taxonomy(
                    content_item.title, content_item.summary
                )
            except Exception as e:
                logger.warning(f"[run_pipeline_job] taxonomy suggestion failed (non-blocking): {e}")

        await file_store.save_content_item(project_id, content_item)

        version = ContentVersion(
            content_item_id=content_item.id,
            version=content_item.current_version,
            parent_version=content_item.current_version - 1 if content_item.current_version > 1 else None,
            body_markdown=content_item.body_markdown,
            body_json=draft,
            provenance={
                "job_id": str(job_id),
                "topic": topic,
                "revisions_count": final_state.get("revisions_count", 0),
            },
        )
        await file_store.append_content_version(project_id, content_item.id, version)

        await file_store.append_quality_report(project_id, content_item.id, QualityReport(
            content_version_id=version.id,
            factuality_score=quality.get("factuality_score"),
            citation_score=quality.get("citation_score"),
            learning_quality_score=quality.get("learning_quality_score"),
            originality_score=quality.get("originality_score"),
            readability_score=quality.get("readability_score"),
            seo_score=quality.get("seo_score"),
            geo_score=quality.get("geo_score"),
            source_integrity_score=quality.get("source_integrity_score"),
            overall_score=quality.get("overall_score"),
            passed=bool(quality.get("passed", is_approved)),
            issues=quality.get("issues", []) or [],
            is_grounded=quality.get("is_grounded"),
            narrative_voice_score=quality.get("narrative_voice_score"),
            source_overlap_ratio=quality.get("source_overlap_ratio"),
            near_copy_flag=bool(quality.get("near_copy_flag", False)),
        ))

        job.content_item_id = content_item.id
        job.status = "SUCCEEDED"
        job.current_node = "export_package"
        job.cost_estimate = tracker.job_cost
        job.completed_at = utcnow()
        await file_store.save_job(project_id, job)

        logger.info(f"--- PIPELINE COMPLETED (job={job_id}). Approved: {final_state.get('is_approved')} ---")
    except BudgetExceededError as e:
        logger.error(f"--- PIPELINE FAILED (job={job_id}): budget exceeded mid-run: {e} ---")
        job = file_store.get_job(project_id, job_id)
        if job is not None:
            job.status = "FAILED"
            job.error_type = e.error_type
            job.error_message = str(e)
            job.cost_estimate = tracker.job_cost
            job.completed_at = utcnow()
            await file_store.save_job(project_id, job)
    except Exception as e:
        logger.error(f"--- PIPELINE FAILED (job={job_id}): {e} ---")
        job = file_store.get_job(project_id, job_id)
        if job is not None:
            job.status = "FAILED"
            job.error_type = type(e).__name__
            job.error_message = str(e)
            job.cost_estimate = tracker.job_cost
            job.completed_at = utcnow()
            await file_store.save_job(project_id, job)


@router.post("", response_model=GenerateResponse, status_code=202)
async def start_generation(req: GenerateRequest, bg_tasks: BackgroundTasks):
    """
    Kicks off the autonomous multi-agent generation pipeline in the background,
    persisting a `generation_job` row so GET /api/jobs/{id} can report progress.
    In a full production scenario, this pushes to the River queue. Here we use
    FastAPI BackgroundTasks for immediate testing.
    """
    opportunity = file_store.get_opportunity(req.project_id, req.opportunity_id)
    if opportunity is None:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    job = GenerationJob(
        project_id=req.project_id,
        topic=opportunity.topic,
        status="QUEUED",
    )
    await file_store.save_job(req.project_id, job)

    bg_tasks.add_task(
        run_pipeline_job,
        job.id,
        req.project_id,
        opportunity.topic,
        req.content_type,
        req.audience,
        req.difficulty,
        None,
        req.knowledge_pack_ids,
        req.enable_web_research,
        req.course_outline,
        req.opportunity_id,
    )

    return GenerateResponse(job_id=job.id)
