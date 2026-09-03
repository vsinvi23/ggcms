import logging
from pydantic import BaseModel, Field
from backend.services.model_provider import get_llm
from backend.configs.settings import settings
from backend.agents.writer_agent import DraftContent
from backend.schemas.agent_error import AgentError
from backend.agents.base import AgentExecutionError
from backend.prompts.loader import load_prompt

logger = logging.getLogger(__name__)

AGENT_NAME = "QualityAgent"

class QualityReport(BaseModel):
    passed: bool
    accuracy_score: float = Field(ge=0.0, le=10.0)
    readability_score: float = Field(ge=0.0, le=10.0)
    issues: list[str] = []
    feedback: str

class QualityAgent:
    def __init__(self):
        # We use a fast flash model for deterministic/cheap auditing
        self.llm = get_llm("reviewer", temperature=0.1)
        self.structured_llm = self.llm.with_structured_output(QualityReport)

    async def run(self, draft: dict) -> QualityReport:
        """
        Audits the generated draft against quality, SEO, and GEO standards.
        """
        if settings.mock_mode:
            return QualityReport(
                passed=True,
                accuracy_score=10.0,
                readability_score=10.0,
                issues=[],
                feedback="MOCK quality feedback",
            )

        prompt = load_prompt("quality").format(draft=draft)

        try:
            result = await self.structured_llm.ainvoke(prompt)
            # Hard fallback rule
            if result.accuracy_score < 7.0 or result.readability_score < 7.0:
                result.passed = False
            return result
        except Exception as e:
            logger.error(f"[{AGENT_NAME}] LLM call failed: {e}")
            raise AgentExecutionError(AgentError(
                error_type="LLM_CALL_FAILED",
                agent_name=AGENT_NAME,
                message=str(e),
                retryable=True,
            )) from e
