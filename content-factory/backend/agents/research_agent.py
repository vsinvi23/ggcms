import logging
from pydantic import BaseModel
from backend.services.model_provider import get_llm
from backend.configs.settings import settings
from backend.schemas.evidence_pack import EvidencePack, Claim
from backend.schemas.agent_error import AgentError
from backend.agents.base import AgentExecutionError
from backend.prompts.loader import load_prompt

logger = logging.getLogger(__name__)

AGENT_NAME = "ResearchAgent"

class ResearchAgent:
    def __init__(self):
        # We use a reasoning/research model, wrapping it to strictly return the EvidencePack schema
        self.llm = get_llm("researcher", temperature=0.2)
        self.structured_llm = self.llm.with_structured_output(EvidencePack)

    async def run(self, topic: str, context_chunks: list[str] = None) -> EvidencePack:
        """
        Synthesizes an EvidencePack from the provided topic and context chunks.
        """
        if settings.mock_mode:
            return EvidencePack(
                topic=topic,
                claims=[Claim(claim="MOCK claim", evidence="MOCK evidence", source="MOCK source", confidence=1.0)],
                definitions=["MOCK definition"],
                examples=["MOCK example"],
                limitations=["MOCK limitation"],
                controversies=["MOCK controversy"],
                open_questions=["MOCK open question"],
                citations=["MOCK citation"],
            )

        context_str = "\n".join(context_chunks) if context_chunks else "No external context provided. Rely on internal knowledge safely."
        prompt = load_prompt("research").format(topic=topic, context_str=context_str)

        try:
            # Langchain automatically parses the Gemini JSON output into our Pydantic model
            result = await self.structured_llm.ainvoke(prompt)
            return result
        except Exception as e:
            logger.error(f"[{AGENT_NAME}] LLM call failed for topic '{topic}': {e}")
            raise AgentExecutionError(AgentError(
                error_type="LLM_CALL_FAILED",
                agent_name=AGENT_NAME,
                message=str(e),
                retryable=True,
            )) from e
