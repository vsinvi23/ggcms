import logging
from typing import Any
from pydantic import BaseModel
from backend.services.model_provider import get_llm, get_model_name
from backend.configs.settings import settings
from backend.schemas.evidence_pack import EvidencePack
from backend.schemas.agent_error import AgentError
from backend.agents.base import AgentExecutionError, invoke_structured, record_mock_usage
from backend.prompts.loader import load_prompt

logger = logging.getLogger(__name__)

AGENT_NAME = "FactCheckerAgent"

class FactCheckReport(BaseModel):
    passed: bool
    unsupported_claims: list[str] = []
    evidence_drift_claims: list[str] = []
    feedback: str

class FactCheckerAgent:
    def __init__(self):
        self.llm = get_llm("reviewer", temperature=0.1)
        self.structured_llm = self.llm.with_structured_output(FactCheckReport)

    async def run(
        self,
        draft: dict,
        evidence: EvidencePack,
        source_chunks: list[str] | None = None,
        *,
        tracker: Any | None = None,
        project_id: Any | None = None,
        job_id: Any | None = None,
    ) -> FactCheckReport:
        """
        Cross-references every claim in the drafted text against the strict Evidence Pack.

        If `source_chunks` is provided, the raw source excerpts are also included in
        the prompt so the LLM can additionally flag claims whose wording drifts from
        or contradicts what the excerpts actually say (`evidence_drift_claims`), as
        distinct from claims with no source attribution at all (`unsupported_claims`).
        """
        if settings.mock_mode:
            record_mock_usage(tracker, get_model_name("reviewer"))
            return FactCheckReport(
                passed=True,
                unsupported_claims=[],
                evidence_drift_claims=[],
                feedback="MOCK fact-check feedback",
            )

        evidence_json = evidence.model_dump_json(indent=2)
        source_text = "\n\n".join(source_chunks) if source_chunks else "N/A"
        prompt = load_prompt("fact_checker").format(
            evidence_json=evidence_json,
            draft=draft,
            source_text=source_text,
        )

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
