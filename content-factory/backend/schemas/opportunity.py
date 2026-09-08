import uuid
from datetime import datetime

from pydantic import BaseModel, Field

class Opportunity(BaseModel):
    topic: str
    score: float = Field(ge=0, le=100)
    demand: str
    trend: str
    competition: str
    content_gap: str
    audience: str
    recommended_content_type: str
    reason: str
    # Raw 0-100 sub-scores behind `score` (SLAD_AI_CONTENT_FACTORY.md section 5.2 weights).
    # Optional/additive: populated by OpportunityAgent, may be partially missing upstream.
    demand_score: float | None = Field(default=None, ge=0, le=100)
    trend_score: float | None = Field(default=None, ge=0, le=100)
    content_gap_score: float | None = Field(default=None, ge=0, le=100)
    competition_score: float | None = Field(default=None, ge=0, le=100)
    audience_relevance_score: float | None = Field(default=None, ge=0, le=100)
    business_value_score: float | None = Field(default=None, ge=0, le=100)
    # Populated when discovery expands a free-text statement into headline
    # candidates (see OpportunityAgent.expand_statement_to_headlines).
    brief: str | None = None
    references: list[str] | None = None
    reference_source: str | None = None
    # Autonomous Content Factory extensions (docs/architecture/
    # AUTONOMOUS_CONTENT_FACTORY_IMPLEMENTATION_PLAN.md section 6.1), mirrored
    # here from backend/models/domain.py::Opportunity so these values can
    # round-trip through the API once a caller populates/reads them. All
    # optional/additive -- not populated by OpportunityAgent's LLM call today.
    canonical_topic: str | None = None
    freshness_score: float | None = None
    evidence_strength_score: float | None = None
    opportunity_score_version: str | None = None
    evaluated_at: datetime | None = None
    last_generated_at: datetime | None = None
    cooldown_until: datetime | None = None
    knowledge_pack_id: uuid.UUID | None = None
    scoring_breakdown: dict | None = None

