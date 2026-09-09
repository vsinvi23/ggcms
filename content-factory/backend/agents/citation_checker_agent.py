import logging
from typing import Any
from pydantic import BaseModel
from backend.services.model_provider import get_llm, get_model_name
from backend.configs.settings import settings
from backend.schemas.agent_error import AgentError
from backend.agents.base import AgentExecutionError, invoke_structured, record_mock_usage
from backend.prompts.loader import load_prompt

logger = logging.getLogger(__name__)

AGENT_NAME = "CitationCheckerAgent"

class CitationCheckReport(BaseModel):
    passed: bool
    missing_citations: list[str] = []
    citation_drift_claims: list[str] = []
    feedback: str

class CitationCheckerAgent:
    def __init__(self):
        self.llm = get_llm("reviewer", temperature=0.1)
        self.structured_llm = self.llm.with_structured_output(CitationCheckReport)

    async def run(
        self,
        draft: dict,
        source_chunks: list[str] | None = None,
        *,
        tracker: Any | None = None,
        project_id: Any | None = None,
        job_id: Any | None = None,
    ) -> CitationCheckReport:
        """
        Validates that external statistics or quotes have proper citation placeholders.

        If `source_chunks` is provided, the raw source excerpts are also included in
        the prompt so the LLM can additionally flag citations whose quoted/attributed
        text drifts from or contradicts what the excerpt actually says
        (`citation_drift_claims`), as distinct from citations missing outright
        (`missing_citations`) -- the same evidence-drift distinction FactCheckerAgent
        applies to claims.
        """
        if settings.mock_mode:
            record_mock_usage(tracker, get_model_name("reviewer"))
            return CitationCheckReport(
                passed=True,
                missing_citations=[],
                citation_drift_claims=[],
                feedback="MOCK citation-check feedback",
            )

        source_text = "\n\n".join(source_chunks) if source_chunks else "N/A"
        prompt = load_prompt("citation_checker").format(draft=draft, source_text=source_text)

        try:
            return await invoke_structured(
                self.structured_llm,
                prompt,
                agent_name=AGENT_NAME,
                tracker=tracker,
                project_id=project_id,
                job_id=job_id,
            )
        except Exception as e:
            logger.error(f"[{AGENT_NAME}] LLM call failed: {e}")
            raise AgentExecutionError(AgentError(
                error_type="LLM_CALL_FAILED",
                agent_name=AGENT_NAME,
                message=str(e),
                retryable=True,
            )) from e
