import logging
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

from backend.agents.opportunity_agent import OpportunityAgent, expand_statement_to_headlines
from backend.configs.settings import settings
from backend.models.domain import Opportunity
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
    await file_store.update_opportunity(project_id, opportunity)
    return {"id": opportunity.id, "status": opportunity.status}


@router.post("/discover", response_model=List[OpportunityOut], status_code=201)
async def discover_opportunities(payload: OpportunityDiscoverIn):
    """
    Runs OpportunityAgent against the project's niche (or explicit `topics`,
    if given) and persists the resulting candidates as DISCOVERED opportunities.

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

    meta: dict[str, dict] = {}

    if payload.topics:
        candidates = []
        for statement in payload.topics:
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
    else:
        candidates = project.niche
        if not candidates:
            raise HTTPException(
                status_code=400,
                detail="No topics to discover from -- set a niche on the project or pass explicit topics.",
            )

    agent = OpportunityAgent()
    results = await agent.run(candidates, meta=meta)

    rows = [
        Opportunity(
            project_id=project.id,
            topic=r.topic,
            score=r.score,
            demand=r.demand,
            trend=r.trend,
            competition=r.competition,
            content_gap=r.content_gap,
            audience=r.audience,
            recommended_content_type=r.recommended_content_type,
            reason=r.reason,
            signals={
                "brief": r.brief,
                "references": r.references,
                "reference_source": r.reference_source,
            } if r.brief or r.references else None,
        )
        for r in results
    ]
    await file_store.append_opportunities(project.id, rows)
    return [OpportunityOut.from_orm_with_signals(row) for row in rows]
