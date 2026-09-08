import logging
from pydantic import BaseModel, Field
from backend.services.model_provider import get_llm
from backend.configs.settings import settings
from backend.services.quality_scoring import compute_overall_quality_score, determine_pass
from backend.agents.writer_agent import DraftContent
from backend.schemas.agent_error import AgentError
from backend.agents.base import AgentExecutionError
from backend.prompts.loader import load_prompt

logger = logging.getLogger(__name__)

AGENT_NAME = "QualityAgent"

class QualityReport(BaseModel):
    """
    LLM-scored quality dimensions for a drafted ContentItem, on the same
    0-100 scale as backend.models.domain.QualityReport (renamed here from
    the previous 0-10 accuracy_score/readability_score pair so all seven
    LLM-judged dimensions line up 1:1 with the domain model's field names --
    see backend/prompts/quality.md for the scoring rubric). `passed` and
    `overall_score` are NOT set by the LLM: they are filled in
    deterministically by `QualityAgent.run` after the LLM call returns, via
    backend/services/quality_scoring.py. The LLM's job is limited to
    per-dimension scores + issues/feedback; it never makes the pass/fail
    call itself.
    """
    passed: bool = False
    factuality_score: float = Field(ge=0.0, le=100.0)
    citation_score: float = Field(ge=0.0, le=100.0)
    learning_quality_score: float = Field(ge=0.0, le=100.0)
    originality_score: float = Field(ge=0.0, le=100.0)
    readability_score: float = Field(ge=0.0, le=100.0)
    seo_score: float = Field(ge=0.0, le=100.0)
    geo_score: float = Field(ge=0.0, le=100.0)
    # Not LLM-scored -- populated deterministically below (see
    # source_integrity_score note in QualityAgent.run).
    source_integrity_score: float | None = None
    overall_score: float | None = None
    issues: list[str] = []
    feedback: str = ""

class QualityAgent:
    def __init__(self):
        # We use a fast flash model for deterministic/cheap auditing
        self.llm = get_llm("reviewer", temperature=0.1)
        self.structured_llm = self.llm.with_structured_output(QualityReport)

    async def run(self, draft: dict) -> QualityReport:
        """
        Audits the generated draft against quality, SEO, and GEO standards.

        The LLM produces the seven per-dimension scores (factuality,
        citation, learning_quality, originality, readability, seo, geo).
        Everything after that is deterministic, per plan section 8:

        - source_integrity_score: this codebase does not (yet) have a
          dedicated LLM-judged "source integrity" dimension separate from
          citation checking (see docs/architecture/
          AUTONOMOUS_CONTENT_FACTORY_IMPLEMENTATION_PLAN.md section 8 --
          "currently folded into factuality_score/citation checks
          implicitly"). Rather than add an eighth LLM-scored dimension
          (which would mean the LLM is effectively asked to re-judge
          "are the sources trustworthy" with no additional signal beyond
          what it already used for factuality/citation), this derives it
          as a deterministic proxy: the mean of factuality_score and
          citation_score, which are exactly the two dimensions plan section
          8 says source integrity is "folded into implicitly" today. This
          keeps the new dimension honest (it moves only when the signals it
          is documented to derive from move) without inventing a new LLM
          judgment call that would just restate the other two.
        - overall_score: the weighted average of all 8 dimensions, via
          compute_overall_quality_score.
        - passed: fully deterministic via determine_pass -- the overall
          score must clear the pass threshold AND no single dimension may
          fall below the minimum floor. The LLM's own opinion on pass/fail
          is not consulted (the schema above doesn't even ask for it as an
          LLM output field beyond an unused default).
        """
        if settings.mock_mode:
            result = QualityReport(
                passed=False,  # placeholder -- overwritten deterministically below
                factuality_score=95.0,
                citation_score=90.0,
                learning_quality_score=92.0,
                originality_score=88.0,
                readability_score=93.0,
                seo_score=85.0,
                geo_score=85.0,
                issues=[],
                feedback="MOCK quality feedback",
            )
            return self._finalize(result)

        prompt = load_prompt("quality").format(draft=draft)

        try:
            result = await self.structured_llm.ainvoke(prompt)
            return self._finalize(result)
        except Exception as e:
            logger.error(f"[{AGENT_NAME}] LLM call failed: {e}")
            raise AgentExecutionError(AgentError(
                error_type="LLM_CALL_FAILED",
                agent_name=AGENT_NAME,
                message=str(e),
                retryable=True,
            )) from e

    @staticmethod
    def _finalize(result: "QualityReport") -> "QualityReport":
        """
        Deterministically derives source_integrity_score/overall_score/passed
        from the LLM-produced per-dimension scores. Pure function of
        `result`'s existing fields -- same input always yields the same
        output, which is what makes the quality gate's pass/fail decision
        reproducible rather than an LLM judgment call.
        """
        result.source_integrity_score = round(
            (result.factuality_score + result.citation_score) / 2, 4
        )

        report_scores = {
            "factuality_score": result.factuality_score,
            "citation_score": result.citation_score,
            "source_integrity_score": result.source_integrity_score,
            "learning_quality_score": result.learning_quality_score,
            "originality_score": result.originality_score,
            "readability_score": result.readability_score,
            "seo_score": result.seo_score,
            "geo_score": result.geo_score,
        }
        computed = compute_overall_quality_score(report_scores)
        result.overall_score = computed["overall_score"]
        result.passed = determine_pass(report_scores, result.overall_score)
        return result
