import logging
from backend.services.model_provider import get_llm, get_model_name
from backend.configs.settings import settings
from backend.schemas.evidence_pack import EvidencePack
from backend.schemas.learning_plan import LearningPlan
from backend.schemas.content_plan import ContentPlan
from backend.schemas.agent_error import AgentError
from backend.agents.base import AgentExecutionError, invoke_structured, record_mock_usage
from backend.prompts.loader import load_prompt

logger = logging.getLogger(__name__)

AGENT_NAME = "ContentPlannerAgent"

class ContentPlannerAgent:
    def __init__(self):
        self.llm = get_llm("planner", temperature=0.3)
        self.structured_llm = self.llm.with_structured_output(ContentPlan)

    async def run(
        self,
        evidence: EvidencePack,
        learning_plan: LearningPlan,
        tracker=None,
        project_id=None,
        job_id=None,
    ) -> ContentPlan:
        """
        Creates the structured outline and section directives for the Writer.
        """
        if settings.mock_mode:
            record_mock_usage(tracker, get_model_name("planner"))
            return ContentPlan(
                content_type="article",
                title="MOCK Content Plan Title",
                audience="MOCK audience",
                objectives=["MOCK objective"],
                sections=[{"title": "MOCK Section", "content": "MOCK content"}],
                examples=[{"example": "MOCK example"}],
                exercises=[{"exercise": "MOCK exercise"}],
                citations_required=True,
            )

        evidence_json = evidence.model_dump_json(indent=2)
        plan_json = learning_plan.model_dump_json(indent=2)
        prompt = load_prompt("planner").format(topic=evidence.topic, plan_json=plan_json, evidence_json=evidence_json)

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
            logger.error(f"[{AGENT_NAME}] LLM call failed for topic '{evidence.topic}': {e}")
            raise AgentExecutionError(AgentError(
                error_type="LLM_CALL_FAILED",
                agent_name=AGENT_NAME,
                message=str(e),
                retryable=True,
            )) from e
