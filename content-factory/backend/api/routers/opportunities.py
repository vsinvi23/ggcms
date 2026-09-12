from __future__ import annotations
import logging
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, ConfigDict

from backend.agents.opportunity_agent import OpportunityAgent, expand_statement_to_headlines
from backend.configs.settings import settings
from backend.models.base import utcnow
from backend.models.domain import GenerationJob, Opportunity, Project
from backend.services.dedup import compute_cooldown_until, find_duplicate_opportunity, is_in_cooldown
from backend.services.web_search_service import web_search
from backend.storage import file_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/opportunities", tags=["Opportunities"])


class OpportunityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    topic: str
    score: float
    demand: Optional[str] = None
    trend: Optional[str] = None
    competition: Optional[str] = None
    content_gap: Optional[str] = None
    audience: Optional[str] = None
    recommended_content_type: Optional[str] = None
    reason: Optional[str] = None
    brief: Optional[str] = None
    references: Optional[List[str]] = None
    reference_source: Optional[str] = None
    status: str
    created_at: datetime

    @classmethod
    def from_orm_with_signals(cls, row: Opportunity) -> "OpportunityOut":
        signals = row.signals or {}
        return cls(
            id=row.id,
            project_id=row.project_id,
            topic=row.topic,
            score=row.score,
            demand=row.demand,
            trend=row.trend,
            competition=row.competition,
            content_gap=row.content_gap,
            audience=row.audience,
            recommended_content_type=row.recommended_content_type,
            reason=row.reason,
            brief=signals.get("brief"),
            references=signals.get("references"),
            reference_source=signals.get("reference_source"),
            status=row.status,
            created_at=row.created_at,
        )


class OpportunityApproveOut(BaseModel):
    id: uuid.UUID
    status: str


class OpportunityDiscoverIn(BaseModel):
    project_id: uuid.UUID
    topics: Optional[List[str]] = None


class OpportunityDiscoverBulkIn(BaseModel):
    project_id: uuid.UUID
    topics: List[str]


class OpportunityDiscoverBulkOut(BaseModel):
    job_id: uuid.UUID


@router.get("", response_model=List[OpportunityOut])
async def list_opportunities(
    project_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
):
    if project_id is not None:
        rows = file_store.list_opportunities(project_id)
    else:
        rows = [o for p in file_store.list_projects() for o in file_store.list_opportunities(p.id)]
    if status is not None:
        rows = [o for o in rows if o.status == status]
    rows.sort(key=lambda o: o.score, reverse=True)
    return [OpportunityOut.from_orm_with_signals(row) for row in rows]


def _find_opportunity_project(opportunity_id: uuid.UUID) -> tuple[Optional[uuid.UUID], Optional[Opportunity]]:
    """
    The route (unchanged from the pre-file_store API) only carries
    opportunity_id, not project_id -- the old `db.get(Opportunity, id)`
    looked it up by global PK. There's no cross-project index, so scan
    every project's opportunities.yaml for the matching id.
    """
    for p in file_store.list_projects():
        opportunity = file_store.get_opportunity(p.id, opportunity_id)
        if opportunity is not None:
            return p.id, opportunity
    return None, None


@router.post("/{opportunity_id}/approve", response_model=OpportunityApproveOut)
async def approve_opportunity(opportunity_id: uuid.UUID):
    project_id, opportunity = _find_opportunity_project(opportunity_id)
    if opportunity is None:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    opportunity.status = "APPROVED"
    await file_store.update_opportunity(project_id, opportunity)
    return {"id": opportunity.id, "status": opportunity.status}


@router.post("/{opportunity_id}/reject", response_model=OpportunityApproveOut)
async def reject_opportunity(opportunity_id: uuid.UUID):
    project_id, opportunity = _find_opportunity_project(opportunity_id)
    if opportunity is None:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    opportunity.status = "REJECTED"
    # Cooldown (plan §4/§6.1): a rejected topic shouldn't be immediately
    # re-discovered next run -- give it COOLDOWN_DAYS_REJECTED before it's
    # eligible again. See services/dedup.compute_cooldown_until. The
    # PUBLISHED-side cooldown is set wherever an Opportunity actually
    # transitions to PUBLISHED, which today is nowhere yet (that status is
    # only reachable via the not-yet-built scheduler, per plan §17 Wave 3) --
    # this is the one call site that exists today.
    opportunity.cooldown_until = compute_cooldown_until(opportunity.status)
    await file_store.update_opportunity(project_id, opportunity)
    return {"id": opportunity.id, "status": opportunity.status}


async def _persist_opportunity_results(project_id: uuid.UUID, results: list) -> List[Opportunity]:
    """
    Persists a batch of OpportunityAgent.run() results, applying topic
    dedup/cooldown (plan §6.1/§17 Wave 2). Chosen semantics -- this is the
    judgment call the plan leaves open (§12: "dedup ... reject, not
    duplicate row"):

      - If an existing Opportunity in this project shares `canonical_topic`
        AND is still within its cooldown window (is_in_cooldown), skip
        creating a new row entirely for that candidate. The topic was
        recently rejected/published; re-surfacing it immediately would just
        re-litigate a decision that was just made.
      - If an existing Opportunity shares `canonical_topic` but is NOT (or
        no longer) in cooldown -- e.g. it's still DISCOVERED and just
        hasn't been approved/rejected yet, or its cooldown lapsed -- treat
        this as a re-evaluation rather than a new candidate: bump the
        existing row's score/sub-scores/reasoning/evaluated_at in place
        (via update_opportunity) instead of appending a duplicate. This
        keeps exactly one row per canonical topic per project at any time,
        matching "reject, not duplicate row" while still letting fresh
        signals refresh a stale-but-still-open Opportunity.
      - Only genuinely new canonical topics are appended as new rows.

    Returns the combined new + refreshed rows (order not guaranteed).
    """
    existing_opportunities = file_store.list_opportunities(project_id)
    new_rows: list[Opportunity] = []
    refreshed_rows: list[Opportunity] = []
    skipped_topics: list[str] = []

    for r in results:
        signals = {
            "brief": r.brief,
            "references": r.references,
            "reference_source": r.reference_source,
        } if r.brief or r.references else None

        canonical_topic = getattr(r, "canonical_topic", None)
        duplicate = find_duplicate_opportunity(existing_opportunities, canonical_topic)

        if duplicate is not None and is_in_cooldown(duplicate):
            skipped_topics.append(r.topic)
            continue

        if duplicate is not None:
            duplicate.score = r.score
            duplicate.demand = r.demand
            duplicate.trend = r.trend
            duplicate.competition = r.competition
            duplicate.content_gap = r.content_gap
            duplicate.audience = r.audience
            duplicate.recommended_content_type = r.recommended_content_type
            duplicate.reason = r.reason
            duplicate.demand_score = r.demand_score
            duplicate.trend_score = r.trend_score
            duplicate.content_gap_score = r.content_gap_score
            duplicate.competition_score = r.competition_score
            duplicate.audience_relevance_score = r.audience_relevance_score
            duplicate.business_value_score = r.business_value_score
            duplicate.opportunity_score_version = getattr(r, "opportunity_score_version", None)
            duplicate.scoring_breakdown = getattr(r, "scoring_breakdown", None)
            duplicate.evaluated_at = getattr(r, "evaluated_at", None) or utcnow()
            if signals is not None:
                duplicate.signals = signals
            refreshed_rows.append(duplicate)
            continue

        new_rows.append(Opportunity(
            project_id=project_id,
            topic=r.topic,
            score=r.score,
            demand=r.demand,
            trend=r.trend,
            competition=r.competition,
            content_gap=r.content_gap,
            audience=r.audience,
            recommended_content_type=r.recommended_content_type,
            reason=r.reason,
            signals=signals,
            canonical_topic=canonical_topic,
            opportunity_score_version=getattr(r, "opportunity_score_version", None),
            scoring_breakdown=getattr(r, "scoring_breakdown", None),
            evaluated_at=getattr(r, "evaluated_at", None),
        ))
        # Keep the in-memory existing list current so later results in this
        # same batch dedup against rows just decided on, not just what was
        # on disk before this call started.
        existing_opportunities.append(new_rows[-1])

    if new_rows:
        await file_store.append_opportunities(project_id, new_rows)
    for row in refreshed_rows:
        await file_store.update_opportunity(project_id, row)
    if skipped_topics:
        logger.info(
            f"[opportunities] skipped {len(skipped_topics)} topic(s) still in "
            f"cooldown for project {project_id}: {skipped_topics}"
        )

    return [*new_rows, *refreshed_rows]


async def _discover_from_statements(project: Project, statements: List[str]) -> List[Opportunity]:
    """
    Shared core of statement-driven discovery, used by both the synchronous
    /discover endpoint (small topic lists) and the background-job-backed
    /discover/bulk endpoint (large pasted topic lists, avoids HTTP timeout).
    Expands each statement into headline candidates, then batches them all
    through one OpportunityAgent.run() call and persists the results
    (dedup/cooldown-aware -- see _persist_opportunity_results).
    """
    meta: dict[str, dict] = {}
    candidates = []
    for statement in statements:
        headlines = await expand_statement_to_headlines(statement, project)
        for h in headlines:
            references = h.suggested_references
            reference_source = "llm_suggested"
            if settings.tavily_api_key:
                try:
                    search_results = await web_search(h.headline)
                    references = [r.url for r in search_results]
                    reference_source = "web_search"
                except Exception as e:
                    logger.warning(f"Live web search failed for headline '{h.headline}', falling back to LLM-suggested references: {e}")

            candidates.append(h.headline)
            meta[h.headline] = {
                "brief": h.brief,
                "references": references,
                "reference_source": reference_source,
            }

    agent = OpportunityAgent()
    results = await agent.run(candidates, meta=meta)
    return await _persist_opportunity_results(project.id, results)


@router.post("/discover", response_model=List[OpportunityOut], status_code=201)
async def discover_opportunities(payload: OpportunityDiscoverIn):
    """
    Runs OpportunityAgent against the project's niche (or explicit `topics`,
    if given) and persists the resulting candidates as DISCOVERED opportunities
    (dedup/cooldown-aware -- see _persist_opportunity_results).

    When `topics` is explicitly provided, it's treated as a free-text statement
    (e.g. "AI security") and first expanded into several distinct article/tutorial
    headline candidates, each carrying a brief and reference URLs (live-searched
    when Tavily is configured, else LLM-suggested and marked unverified). When
    `topics` is omitted, the project's curated `niche` list is used as-is, one
    topic per niche entry, matching today's behavior.
    """
    project = file_store.load_project(payload.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        if payload.topics:
            rows = await _discover_from_statements(project, payload.topics)
        else:
            if not project.niche:
                raise HTTPException(
                    status_code=400,
                    detail="No topics to discover from -- set a niche on the project or pass explicit topics.",
                )
            agent = OpportunityAgent()
            results = await agent.run(project.niche, meta={})
            rows = await _persist_opportunity_results(project.id, results)
        return [OpportunityOut.from_orm_with_signals(row) for row in rows]
    except HTTPException:
        raise
    except Exception as e:
        err_msg = str(e)
        logger.error(f"Opportunity discovery failed: {err_msg}")
        if any(k in err_msg for k in ["API key not valid", "INVALID_ARGUMENT", "API_KEY_INVALID", "400"]):
            raise HTTPException(
                status_code=400,
                detail="Gemini API key is invalid or missing. Please configure a valid Gemini API key in System Settings.",
            ) from e
        raise HTTPException(
            status_code=500,
            detail=f"Opportunity discovery failed: {err_msg}",
        ) from e


async def run_bulk_discover_job(job_id: uuid.UUID, project_id: uuid.UUID, topics: List[str]) -> None:
    """
    Background task: processes a large pasted topic list in small chunks
    (rather than one giant OpportunityAgent.run() call) so job.current_node
    can report incremental progress, and a failure partway through doesn't
    lose already-discovered opportunities (each chunk is persisted as it
    completes via _discover_from_statements -> append_opportunities).
    """
    job = file_store.get_job(project_id, job_id)
    if job is None:
        logger.error(f"bulk-discover job {job_id} vanished before start")
        return
    project = file_store.load_project(project_id)
    if project is None:
        job.status = "FAILED"
        job.error_type = "not_found"
        job.error_message = "Project not found"
        job.completed_at = utcnow()
        await file_store.save_job(project_id, job)
        return

    job.status = "RUNNING"
    job.started_at = utcnow()
    await file_store.save_job(project_id, job)

    CHUNK_SIZE = 5
    chunks = [topics[i:i + CHUNK_SIZE] for i in range(0, len(topics), CHUNK_SIZE)]
    failures = []
    for i, chunk in enumerate(chunks, start=1):
        job.current_node = f"analyzing topics {min(i * CHUNK_SIZE, len(topics))}/{len(topics)}"
        await file_store.save_job(project_id, job)
        try:
            await _discover_from_statements(project, chunk)
        except Exception as exc:  # noqa: BLE001 - one bad chunk must not abort the batch
            logger.warning(f"bulk-discover failed for chunk {chunk}: {exc}")
            failures.extend(chunk)

    job.status = "SUCCEEDED"
    job.current_node = None
    job.completed_at = utcnow()
    if failures:
        job.error_type = "partial_failure"
        job.error_message = f"{len(failures)}/{len(topics)} topics failed: {', '.join(failures)}"
    await file_store.save_job(project_id, job)


@router.post("/discover/bulk", response_model=OpportunityDiscoverBulkOut, status_code=202)
async def discover_opportunities_bulk(payload: OpportunityDiscoverBulkIn, bg_tasks: BackgroundTasks):
    """
    Accepts a batch of topic statements pasted at once, analyzing them in
    chunks in a background job (see run_bulk_discover_job) so the request
    returns immediately regardless of list size. Poll GET /api/jobs/{job_id}
    for progress/completion; resulting Opportunities land incrementally via
    GET /api/opportunities?project_id=...
    """
    project = file_store.load_project(payload.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    topics = [t.strip() for t in payload.topics if t.strip()]
    if not topics:
        raise HTTPException(status_code=400, detail="topics must contain at least one non-empty topic")

    job = GenerationJob(project_id=project.id, topic=f"bulk opportunity discovery ({len(topics)} topics)")
    await file_store.save_job(project.id, job)
    bg_tasks.add_task(run_bulk_discover_job, job.id, project.id, topics)
    return OpportunityDiscoverBulkOut(job_id=job.id)
