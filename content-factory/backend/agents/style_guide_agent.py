from __future__ import annotations
import logging

from backend.services.model_provider import get_llm
from backend.configs.settings import settings
from backend.schemas.agent_error import AgentError
from backend.agents.base import AgentExecutionError
from backend.prompts.loader import load_prompt

logger = logging.getLogger(__name__)

AGENT_NAME = "StyleGuideAgent"


class StyleGuideAgent:
    def __init__(self):
        self.llm = get_llm("reviewer", temperature=0.0)

    async def run(self, lesson_markdown: str) -> str:
        """
        Produces a ~150-word "voice fingerprint" describing the tone, style,
        and vocabulary patterns of the given lesson markdown, so later
        lessons in the same course can be kept stylistically consistent.

        Unlike the other review agents, this returns raw text (no structured
        schema) -- the fingerprint is meant to be dropped straight into a
        later prompt as free-form guidance, not parsed programmatically.
        """
        if settings.mock_mode:
            return (
                "MOCK voice fingerprint: conversational second-person tone, "
                "short punchy sentences mixed with the occasional longer "
                "explanatory one, rhetorical questions used to open sections, "
                "concrete real-world analogies before formal definitions, "
                "light encouraging asides, minimal jargon introduced only "
                "after being motivated by an example."
            )

        prompt = load_prompt("style_guide").format(lesson_markdown=lesson_markdown)

        try:
            response = await self.llm.ainvoke(prompt)
            return response.content
        except Exception as e:
            logger.error(f"[{AGENT_NAME}] LLM call failed: {e}")
            raise AgentExecutionError(AgentError(
                error_type="LLM_CALL_FAILED",
                agent_name=AGENT_NAME,
                message=str(e),
                retryable=True,
            )) from e
