import logging
from pydantic import BaseModel, Field
from backend.services.model_provider import get_llm, get_model_name
from backend.configs.settings import settings
from backend.services.quality_scoring import compute_overall_quality_score, determine_pass
from backend.services import originality_check
from backend.agents.writer_agent import DraftContent
from backend.schemas.agent_error import AgentError
from backend.agents.base import AgentExecutionError, invoke_structured, record_mock_usage
from backend.prompts.loader import load_prompt

logger = logging.getLogger(__name__)

AGENT_NAME = "QualityAgent"


class NarrativeVoiceIssue(BaseModel):
    """
    A single narrative-voice problem flagged by the LLM within
    QualityReport.narrative_voice_issues -- e.g. a section that slips into
    generic/robotic prose or breaks the established voice.
    """
    section_title: str
    rule_violated: str
    detail: str


def _flatten_draft_text(draft: dict) -> str:
    """
    Flattens a draft dict's `sections` into one plain text blob for
    overlap-checking against source_chunks, mirroring the exact shape logic
    in backend/api/routers/generation.py::_flatten_sections_markdown --
    flat article sections are `{title, body_markdown}`, course sections are
    `{title, lessons: [{title, markdown_body}, ...]}`.
    """
    parts = []
    for section in draft.get("sections") or []:
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
    # v2 dimension (see backend/services/quality_scoring.py
    # QUALITY_WEIGHTS_V2): does the content read in a consistent, engaging
    # voice rather than generic/robotic prose.
    narrative_voice_score: float = Field(ge=0.0, le=100.0)
    narrative_voice_issues: list[NarrativeVoiceIssue] = []
    # Not LLM-scored -- populated deterministically below (see
    # source_integrity_score note in QualityAgent.run).
    source_integrity_score: float | None = None
    overall_score: float | None = None
    # Not LLM-scored -- plumbed straight through from wherever it is
    # computed upstream (see QualityAgent.run's `is_grounded` param). No
    # logic on it here; the actual computation and gating happens elsewhere.
    is_grounded: bool | None = None
    # Not LLM-scored -- populated deterministically from
    # originality_check.compute_source_overlap when source_chunks is
    # provided (see QualityAgent.run). Mirrors backend.models.domain.
    # QualityReport's fields of the same name so generation.py's
    # quality.get("source_overlap_ratio")/quality.get("near_copy_flag")
    # (used when persisting the domain QualityReport) actually get real
    # values instead of always falling through to the default.
    source_overlap_ratio: float | None = None
    near_copy_flag: bool = False
    issues: list[str] = []
    feedback: str = ""

class QualityAgent:
    def __init__(self):
        # We use a fast flash model for deterministic/cheap auditing
        self.llm = get_llm("reviewer", temperature=0.1)
        self.structured_llm = self.llm.with_structured_output(QualityReport)

    async def run(
        self,
        draft: dict,
        source_chunks: list[str] | None = None,
        is_grounded: bool | None = None,
        tracker=None,
        project_id=None,
        job_id=None,
    ) -> QualityReport:
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
            record_mock_usage(tracker, get_model_name("reviewer"))
            result = QualityReport(
                passed=False,  # placeholder -- overwritten deterministically below
                factuality_score=95.0,
                citation_score=90.0,
                learning_quality_score=92.0,
                originality_score=88.0,
                readability_score=93.0,
                seo_score=85.0,
                geo_score=85.0,
                narrative_voice_score=90.0,
                issues=[],
                feedback="MOCK quality feedback",
            )
            result.is_grounded = is_grounded
            return self._finalize(result)

        prompt = load_prompt("quality").format(draft=draft)

        try:
            result = await invoke_structured(
                self.structured_llm,
                prompt,
                agent_name=AGENT_NAME,
                tracker=tracker,
                project_id=project_id,
                job_id=job_id,
            )

            result.is_grounded = is_grounded

            if source_chunks is not None:
                flattened = _flatten_draft_text(draft)
                overlap = originality_check.compute_source_overlap(flattened, source_chunks)
                result.source_overlap_ratio = overlap["overlap_ratio"]
                result.near_copy_flag = overlap["near_copy_flag"]
                # Per explicit product decision, grounded quotes legitimately
                # overlap with source text -- this is surfaced as a WARNING
                # only here, never a hard failure. A caller that needs a hard
                # fail (Mode B / strict_originality, see content_pipeline.py's
                # quality_check node) enforces that itself using
                # near_copy_flag, rather than this agent's contract changing
                # per caller.
                result.issues = list(result.issues) + [
                    f"WARNING: source overlap ratio={overlap['overlap_ratio']:.2f}, "
                    f"longest_verbatim_run={overlap['longest_verbatim_run']}, "
                    f"near_copy_flag={overlap['near_copy_flag']}"
                ]

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
            "narrative_voice_score": result.narrative_voice_score,
        }
        computed = compute_overall_quality_score(report_scores, version="v2")
        result.overall_score = computed["overall_score"]
        result.passed = determine_pass(report_scores, result.overall_score, version="v2")
        return result
