from typing import Type, TypeVar, Protocol
from pydantic import BaseModel
from backend.schemas.agent_error import AgentError

TIn = TypeVar("TIn", bound=BaseModel)
TOut = TypeVar("TOut", bound=BaseModel)

class AgentExecutionError(Exception):
    """
    Raised when an agent's LLM call fails and settings.mock_mode is False.
    Carries a structured AgentError payload instead of silently returning
    fabricated/empty data.
    """
    def __init__(self, error: AgentError):
        self.error = error
        super().__init__(error.message)

class RunContext(BaseModel):
    project_id: str
    job_id: str | None = None
    campaign_id: str | None = None

class Agent(Protocol[TIn, TOut]):
    name: str
    input_schema: Type[TIn]
    output_schema: Type[TOut]
    prompt_path: str
    tools: list[str]
    max_retries: int

    async def run(self, input_data: TIn, ctx: RunContext) -> TOut | AgentError:
        """
        Executes the agent logic.
        Must load the markdown prompt, bind tools, call the configured LLM,
        and strictly parse the output into output_schema.
        """
        ...

