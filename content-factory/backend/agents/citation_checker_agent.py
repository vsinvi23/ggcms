import logging
from pydantic import BaseModel
from backend.services.model_provider import get_llm
from backend.configs.settings import settings
from backend.schemas.agent_error import AgentError
from backend.agents.base import AgentExecutionError
from backend.prompts.loader import load_prompt

logger = logging.getLogger(__name__)

AGENT_NAME = "CitationCheckerAgent"

class CitationCheckReport(BaseModel):
    passed: bool
    missing_citations: list[str] = []
    feedback: str

class CitationCheckerAgent:
    def __init__(self):
        self.llm = get_llm("reviewer", temperature=0.1)
        self.structured_llm = self.llm.with_structured_output(CitationCheckReport)

    async def run(self, draft: dict) -> CitationCheckReport:
        """
        Validates that external statistics or quotes have proper citation placeholders.
        """
        if settings.mock_mode:
            return CitationCheckReport(passed=True, missing_citations=[], feedback="MOCK citation-check feedback")

        prompt = load_prompt("citation_checker").format(draft=draft)

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
