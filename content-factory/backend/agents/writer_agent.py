from __future__ import annotations
import logging
from pydantic import BaseModel
from backend.services.model_provider import get_llm, get_model_name
from backend.configs.settings import settings
from backend.schemas.evidence_pack import EvidencePack
from backend.schemas.content_plan import ContentPlan
from backend.schemas.agent_error import AgentError
from backend.agents.base import AgentExecutionError, invoke_structured, record_mock_usage
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

    async def run(
        self,
        evidence: EvidencePack,
        plan: ContentPlan,
        learning_plan=None,
        brand_voice: str = "Not specified",
        revision_feedback: str = "",
        tracker=None,
        project_id=None,
        job_id=None,
    ) -> DraftContent:
        """
        Drafts the content strictly using facts from the EvidencePack.

        `revision_feedback`, when non-empty, is feedback from a prior review
        pass (e.g. the quality agent's narrative_voice_issues) that this
        rewrite must specifically address.
        """
        if settings.mock_mode:
            record_mock_usage(tracker, get_model_name("writer"))
            return DraftContent(
                title="MOCK Draft Title",
                summary="MOCK summary",
                sections=[DraftSection(title="MOCK Section", body_markdown="MOCK body content")],
            )

        evidence_json = evidence.model_dump_json(indent=2)
        plan_json = plan.model_dump_json(indent=2)
        learning_plan_json = learning_plan.model_dump_json(indent=2) if learning_plan else "Not provided"
        revision_feedback_section = (
            f"## Revision Feedback\n"
            f"The previous draft was reviewed and must be rewritten to specifically "
            f"address each of the following pieces of feedback:\n{revision_feedback}\n"
            if revision_feedback
            else ""
        )
        prompt = load_prompt("writer").format(
            evidence_pack=evidence_json,
            learning_plan=learning_plan_json,
            content_plan=plan_json,
            brand_voice=brand_voice,
            revision_feedback_section=revision_feedback_section,
        )

        try:
            result = await invoke_structured(
                self.structured_llm,
                prompt,
                agent_name=AGENT_NAME,
                tracker=tracker,
                project_id=project_id,
                job_id=job_id,
            )
            return result
        except Exception as e:
            logger.error(f"[{AGENT_NAME}] LLM call failed for plan '{plan.title}': {e}")
            raise AgentExecutionError(AgentError(
                error_type="LLM_CALL_FAILED",
                agent_name=AGENT_NAME,
                message=str(e),
                retryable=True,
            )) from e
