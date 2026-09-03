import logging
from backend.services.model_provider import get_llm
from backend.configs.settings import settings
from backend.schemas.evidence_pack import EvidencePack
from backend.schemas.learning_plan import LearningPlan
from backend.schemas.agent_error import AgentError
from backend.agents.base import AgentExecutionError
from backend.prompts.loader import load_prompt

logger = logging.getLogger(__name__)

AGENT_NAME = "LearningArchitectAgent"

class LearningArchitectAgent:
    def __init__(self):
        self.llm = get_llm("planner", temperature=0.3)
        self.structured_llm = self.llm.with_structured_output(LearningPlan)

    async def run(self, evidence: EvidencePack) -> LearningPlan:
        """
        Designs the educational curriculum based on the extracted evidence.
        """
        if settings.mock_mode:
            return LearningPlan(
                learner_profile="MOCK learner profile",
                problem_statement="MOCK problem statement",
                objectives=["MOCK objective"],
                prerequisites=["MOCK prerequisite"],
                difficulty="intermediate",
                sequence=["MOCK step 1"],
            )

        evidence_json = evidence.model_dump_json(indent=2)
        prompt = load_prompt("learning_architect").format(topic=evidence.topic, evidence_json=evidence_json)

        try:
            return await self.structured_llm.ainvoke(prompt)
        except Exception as e:
            logger.error(f"[{AGENT_NAME}] LLM call failed for topic '{evidence.topic}': {e}")
            raise AgentExecutionError(AgentError(
                error_type="LLM_CALL_FAILED",
                agent_name=AGENT_NAME,
                message=str(e),
                retryable=True,
            )) from e
