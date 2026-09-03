import logging
from pydantic import BaseModel, Field
from backend.services.model_provider import get_llm
from backend.configs.settings import settings
from backend.schemas.opportunity import Opportunity
from backend.schemas.agent_error import AgentError
from backend.agents.base import AgentExecutionError
from backend.prompts.loader import load_prompt

# Already implemented by the scoring workstream (SLAD_AI_CONTENT_FACTORY.md section 5.2
# weights: demand 25%, trend 20%, content_gap 20%, competition 15%,
# audience_relevance 10%, business_value 10%). Wired in directly below.
from backend.services.scoring import compute_opportunity_score

logger = logging.getLogger(__name__)

AGENT_NAME = "OpportunityAgent"

SUB_SCORE_KEYS = ("demand", "trend", "content_gap", "competition", "audience_relevance", "business_value")


class OpportunitySubScores(BaseModel):
    """LLM-estimated sub-scores (0-100) + reasoning for a single topic candidate."""
    demand: float = Field(ge=0, le=100)
    trend: float = Field(ge=0, le=100)
    content_gap: float = Field(ge=0, le=100)
    competition: float = Field(ge=0, le=100)
    audience_relevance: float = Field(ge=0, le=100)
    business_value: float = Field(ge=0, le=100)
    reasoning: str


class HeadlineCandidate(BaseModel):
    """A single article/tutorial headline expanded from a broad statement."""
    headline: str
    angle: str
    why_now: str
    brief: str
    suggested_references: list[str] = Field(default_factory=list)


class HeadlineExpansion(BaseModel):
    candidates: list[HeadlineCandidate]


async def expand_statement_to_headlines(statement: str, project) -> list[HeadlineCandidate]:
    """
    Expands a broad free-text statement (e.g. "AI security") into several
    distinct, publishable article/tutorial headline candidates, each carrying
    a brief and LLM-suggested (unverified) reference URLs.

    Used only for explicit free-text `topics` passed to discovery -- the
    niche-driven autonomy path treats each niche entry as an already-concrete
    topic and skips expansion.
    """
    if settings.mock_mode:
        return [
            HeadlineCandidate(
                headline=f"MOCK headline for {statement}",
                angle="MOCK angle",
                why_now="MOCK reasoning",
                brief="MOCK brief",
                suggested_references=["https://example.com/mock-reference"],
            )
        ]

    llm = get_llm("planner", temperature=0.3)
    structured_llm = llm.with_structured_output(HeadlineExpansion)

    prompt = load_prompt("headline_expansion").format(
        platform_style="an Educative/GeeksforGeeks-style article and tutorial",
        statement=statement,
        audience=", ".join(project.audience) or "general developers",
        levels=", ".join(project.levels) or "beginner, intermediate, advanced",
        content_types=", ".join(project.content_types) or "article, tutorial",
    )

    try:
        result = await structured_llm.ainvoke(prompt)
    except Exception as e:
        logger.error(f"[{AGENT_NAME}] headline expansion failed for statement '{statement}': {e}")
        raise AgentExecutionError(AgentError(
            error_type="LLM_CALL_FAILED",
            agent_name=AGENT_NAME,
            message=str(e),
            retryable=True,
        )) from e

    return result.candidates


def _band(score: float) -> str:
    """Coarse qualitative label for a 0-100 sub-score (used for Opportunity's legacy string fields)."""
    if score >= 66:
        return "high"
    if score >= 33:
        return "medium"
    return "low"


class OpportunityAgent:
    def __init__(self):
        self.llm = get_llm("planner", temperature=0.2)
        self.structured_llm = self.llm.with_structured_output(OpportunitySubScores)

    async def run(
        self,
        candidates: list[str],
        signals: dict[str, dict] | None = None,
        meta: dict[str, dict] | None = None,
    ) -> list[Opportunity]:
        """
        For each topic candidate, fills in any missing sub-scores (demand, trend,
        content_gap, competition, audience_relevance, business_value -- each 0-100,
        `signals[topic]` may be partially or entirely missing them) via the LLM,
        producing reasoning per candidate, then computes the final weighted score
        and assembles an Opportunity.

        `signals` maps candidate topic -> a dict that may already contain some of
        the six sub-score keys; those are trusted as-is and never overridden by
        the LLM, which only fills the gaps.

        `meta` maps candidate topic -> a dict with optional "brief", "references",
        "reference_source" keys (populated by expand_statement_to_headlines for
        statement-driven discovery), passed through onto the resulting Opportunity.
        """
        signals = signals or {}
        meta = meta or {}
        opportunities: list[Opportunity] = []

        for topic in candidates:
            raw = signals.get(topic, {}) or {}
            topic_meta = meta.get(topic, {}) or {}

            if settings.mock_mode:
                opportunities.append(Opportunity(
                    topic=topic,
                    score=50.0,
                    demand="MOCK", trend="MOCK", competition="MOCK",
                    content_gap="MOCK", audience="MOCK",
                    recommended_content_type="MOCK content type",
                    reason=f"MOCK reasoning for {topic}",
                    demand_score=50.0, trend_score=50.0, content_gap_score=50.0,
                    competition_score=50.0, audience_relevance_score=50.0, business_value_score=50.0,
                    brief=topic_meta.get("brief"),
                    references=topic_meta.get("references"),
                    reference_source=topic_meta.get("reference_source"),
                ))
                continue

            missing = [key for key in SUB_SCORE_KEYS if raw.get(key) is None]
            if missing:
                prompt = load_prompt("opportunity").format(
                    topic=topic,
                    demand=raw.get("demand", "null"),
                    trend=raw.get("trend", "null"),
                    content_gap=raw.get("content_gap", "null"),
                    competition=raw.get("competition", "null"),
                    audience_relevance=raw.get("audience_relevance", "null"),
                    business_value=raw.get("business_value", "null"),
                )
                try:
                    estimate = await self.structured_llm.ainvoke(prompt)
                except Exception as e:
                    logger.error(f"[{AGENT_NAME}] LLM call failed for candidate '{topic}': {e}")
                    raise AgentExecutionError(AgentError(
                        error_type="LLM_CALL_FAILED",
                        agent_name=AGENT_NAME,
                        message=str(e),
                        retryable=True,
                    )) from e
                reasoning = estimate.reasoning
            else:
                estimate = None
                reasoning = "All sub-scores provided by upstream signals; no LLM estimate needed."

            # Raw signals win when present -- the LLM only fills gaps, never overrides real data.
            sub_scores = {
                key: float(raw[key]) if raw.get(key) is not None else float(getattr(estimate, key))
                for key in SUB_SCORE_KEYS
            }

            score = compute_opportunity_score(
                demand=sub_scores["demand"],
                trend=sub_scores["trend"],
                content_gap=sub_scores["content_gap"],
                competition=sub_scores["competition"],
                audience_relevance=sub_scores["audience_relevance"],
                business_value=sub_scores["business_value"],
            )

            opportunities.append(Opportunity(
                topic=topic,
                score=score,
                demand=_band(sub_scores["demand"]),
                trend=_band(sub_scores["trend"]),
                competition=_band(sub_scores["competition"]),
                content_gap=_band(sub_scores["content_gap"]),
                audience=_band(sub_scores["audience_relevance"]),
                recommended_content_type="article",
                reason=reasoning,
                demand_score=sub_scores["demand"],
                trend_score=sub_scores["trend"],
                content_gap_score=sub_scores["content_gap"],
                competition_score=sub_scores["competition"],
                audience_relevance_score=sub_scores["audience_relevance"],
                business_value_score=sub_scores["business_value"],
                brief=topic_meta.get("brief"),
                references=topic_meta.get("references"),
                reference_source=topic_meta.get("reference_source"),
            ))

        return opportunities
