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

