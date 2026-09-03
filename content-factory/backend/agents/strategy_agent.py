import logging
from backend.schemas.project_strategy import ProjectStrategy
from backend.schemas.agent_error import AgentError
from backend.agents.base import AgentExecutionError

logger = logging.getLogger(__name__)

AGENT_NAME = "StrategyAgent"


def _as_str_list(value) -> list[str]:
    """Normalizes a raw config value into a clean list[str] (dropping blanks)."""
    if value is None:
        return []
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, (list, tuple, set)):
        raise ValueError(f"Expected a string or list of strings, got {type(value).__name__}: {value!r}")
    return [str(item).strip() for item in value if str(item).strip()]


class StrategyAgent:
    """
    Deterministic agent -- no LLM call. Normalizes and validates a raw project
    configuration dict (as submitted via the Project Configuration form,
    docs/architecture/IMPLEMENTATION_SPECIFICATION.md section 4) into a strict
    ProjectStrategy schema.
    """

    def run(self, project_config: dict) -> ProjectStrategy:
        try:
            language = str(project_config.get("language") or "en").strip().lower() or "en"

            publishing_frequency = project_config.get("publishing_frequency")
            if publishing_frequency is not None:
                publishing_frequency = str(publishing_frequency).strip() or None

            return ProjectStrategy(
                niche=_as_str_list(project_config.get("niche")),
                audience=_as_str_list(project_config.get("audience")),
                language=language,
                content_goals=_as_str_list(project_config.get("content_goals")),
                prohibited_topics=_as_str_list(project_config.get("prohibited_topics")),
                preferred_sources=_as_str_list(project_config.get("preferred_sources")),
                publishing_frequency=publishing_frequency,
            )
        except Exception as e:
            logger.error(f"[{AGENT_NAME}] Failed to normalize project config: {e}")
            raise AgentExecutionError(AgentError(
                error_type="VALIDATION_FAILED",
                agent_name=AGENT_NAME,
                message=str(e),
                retryable=False,
            )) from e
