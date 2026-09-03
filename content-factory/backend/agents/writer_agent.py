import logging
from pydantic import BaseModel
from backend.services.model_provider import get_llm
from backend.configs.settings import settings
from backend.schemas.evidence_pack import EvidencePack
from backend.schemas.content_plan import ContentPlan
from backend.schemas.agent_error import AgentError
from backend.agents.base import AgentExecutionError
from backend.prompts.loader import load_prompt

logger = logging.getLogger(__name__)

AGENT_NAME = "WriterAgent"

class DraftSection(BaseModel):
    title: str
    body_markdown: str

class DraftContent(BaseModel):
    title: str
    summary: str
    sections: list[DraftSection]

class WriterAgent:
    def __init__(self):
        # We use the designated writing model (e.g. gemini-1.5-pro)
        self.llm = get_llm("writer", temperature=0.7)
        self.structured_llm = self.llm.with_structured_output(DraftContent)

    async def run(self, evidence: EvidencePack, plan: ContentPlan, learning_plan=None, brand_voice: str = "Not specified") -> DraftContent:
        """
        Drafts the content strictly using facts from the EvidencePack.
        """
        if settings.mock_mode:
            return DraftContent(
                title="MOCK Draft Title",
                summary="MOCK summary",
                sections=[DraftSection(title="MOCK Section", body_markdown="MOCK body content")],
            )

        evidence_json = evidence.model_dump_json(indent=2)
        plan_json = plan.model_dump_json(indent=2)
        learning_plan_json = learning_plan.model_dump_json(indent=2) if learning_plan else "Not provided"
        prompt = load_prompt("writer").format(
            evidence_pack=evidence_json,
            learning_plan=learning_plan_json,
            content_plan=plan_json,
            brand_voice=brand_voice,
        )

        try:
            result = await self.structured_llm.ainvoke(prompt)
            return result
        except Exception as e:
            logger.error(f"[{AGENT_NAME}] LLM call failed for plan '{plan.title}': {e}")
            raise AgentExecutionError(AgentError(
                error_type="LLM_CALL_FAILED",
                agent_name=AGENT_NAME,
                message=str(e),
                retryable=True,
            )) from e
