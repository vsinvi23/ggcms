import logging
from pydantic import BaseModel
from backend.services.model_provider import get_llm
from backend.configs.settings import settings
from backend.schemas.evidence_pack import EvidencePack
from backend.schemas.agent_error import AgentError
from backend.agents.base import AgentExecutionError
from backend.prompts.loader import load_prompt

logger = logging.getLogger(__name__)

AGENT_NAME = "FactCheckerAgent"

class FactCheckReport(BaseModel):
    passed: bool
    unsupported_claims: list[str] = []
    feedback: str

class FactCheckerAgent:
    def __init__(self):
        self.llm = get_llm("reviewer", temperature=0.1)
        self.structured_llm = self.llm.with_structured_output(FactCheckReport)

    async def run(self, draft: dict, evidence: EvidencePack) -> FactCheckReport:
        """
        Cross-references every claim in the drafted text against the strict Evidence Pack.
        """
        if settings.mock_mode:
            return FactCheckReport(passed=True, unsupported_claims=[], feedback="MOCK fact-check feedback")

        evidence_json = evidence.model_dump_json(indent=2)
        prompt = load_prompt("fact_checker").format(evidence_json=evidence_json, draft=draft)

        try:
            return await self.structured_llm.ainvoke(prompt)
        except Exception as e:
            logger.error(f"[{AGENT_NAME}] LLM call failed: {e}")
            raise AgentExecutionError(AgentError(
                error_type="LLM_CALL_FAILED",
                agent_name=AGENT_NAME,
                message=str(e),
                retryable=True,
            )) from e
