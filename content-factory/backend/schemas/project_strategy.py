from pydantic import BaseModel, Field


class ProjectStrategy(BaseModel):
    """
    Normalized/validated project strategy, produced by StrategyAgent from the
    raw Project Configuration form (docs/architecture/IMPLEMENTATION_SPECIFICATION.md
    section 4, `project` / `project_strategy` tables).
    """
    niche: list[str] = Field(default_factory=list)
    audience: list[str] = Field(default_factory=list)
    language: str = "en"
    content_goals: list[str] = Field(default_factory=list)
    prohibited_topics: list[str] = Field(default_factory=list)
    preferred_sources: list[str] = Field(default_factory=list)
    publishing_frequency: str | None = None
