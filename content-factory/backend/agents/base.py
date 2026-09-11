from __future__ import annotations
import uuid
from typing import Any, Type, TypeVar, Protocol

from langchain_core.callbacks.usage import get_usage_metadata_callback
from pydantic import BaseModel

from backend.models.agent_run import AgentRunLogEntry
from backend.models.base import utcnow
from backend.schemas.agent_error import AgentError
from backend.storage.agent_run_log import append_agent_run

TIn = TypeVar("TIn", bound=BaseModel)
TOut = TypeVar("TOut", bound=BaseModel)
TStruct = TypeVar("TStruct", bound=BaseModel)

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


def record_mock_usage(tracker: Any | None, model_name: str) -> None:
    """
    Best-effort CostTracker.add_usage() call for an agent's settings.mock_mode
    short-circuit branch, using a nominal fixed token count.

    Mock mode never calls invoke_structured (no real LLM call to meter), which
    otherwise leaves CostTracker.job_cost stuck at 0.0 for every job run in
    mock mode -- including in the test suite, where mock_mode is forced on
    for every test (tests/conftest.py::mock_mode_on). That defeats the whole
    point of GenerationJob.cost_estimate / the budget-cap wiring: it would
    never be exercised outside of a real, paid LLM call. Charging a nominal
    simulated usage here keeps that wiring live under mock mode too, while
    still making zero network calls.

    Silently a no-op when `tracker` is None, exactly like invoke_structured's
    own tracker handling -- callers pass `tracker=state.get("cost_tracker")`
    unconditionally and rely on this never raising when it's absent.
    """
    if tracker is None:
        return
    tracker.add_usage(model_name=model_name, input_tokens=500, output_tokens=500)


async def invoke_structured(
    structured_llm: Any,
    prompt: Any,
    *,
    agent_name: str,
    tracker: Any | None = None,
    project_id: Any | None = None,
    job_id: Any | None = None,
) -> Any:
    """
    Shared helper for calling a structured-output LLM runnable while
    capturing per-model token usage and (best-effort) recording an
    `AgentRunLogEntry` for observability.

    Contract (relied on by fact_checker_agent.py, writer_agent.py,
    quality_agent.py, citation_checker_agent.py, learning_architect_agent.py,
    content_planner_agent.py, opportunity_agent.py, course_agent.py -- do not
    change this signature without updating all of those callers):

        await invoke_structured(structured_llm, prompt, agent_name="...",
                                 tracker=..., project_id=..., job_id=...)

    `structured_llm` and `prompt` are positional; `agent_name` is a required
    keyword; `tracker`/`project_id`/`job_id` are optional keywords that
    default to None. With `tracker=None` and/or `project_id=None`, the
    corresponding step (budget tracking / run logging) is skipped entirely --
    this function never raises on their absence.

    Any `BudgetExceededError` raised by `tracker.add_usage(...)` propagates
    uncaught -- that's intentional, it's meant to abort the pipeline.
    Failures while constructing/persisting the agent-run log entry are
    swallowed (best-effort observability must never break the actual agent
    call).
    """
    start_time = utcnow()

    with get_usage_metadata_callback() as cb:
        result = await structured_llm.ainvoke(
            prompt, config={"callbacks": [cb]}
        )
        usage_metadata = dict(cb.usage_metadata)

    if tracker is not None:
        for model_name, usage in usage_metadata.items():
            tracker.add_usage(
                model_name=model_name,
                input_tokens=usage.get("input_tokens", 0),
                output_tokens=usage.get("output_tokens", 0),
            )

    if project_id is not None:
        try:
            end_time = utcnow()
            model_name = next(iter(usage_metadata), None)
            token_usage = None
            if usage_metadata:
                token_usage = {
                    "prompt_tokens": sum(
                        u.get("input_tokens", 0) for u in usage_metadata.values()
                    ),
                    "completion_tokens": sum(
                        u.get("output_tokens", 0) for u in usage_metadata.values()
                    ),
                }
            estimated_cost = None
            if tracker is not None:
                estimated_cost = getattr(tracker, "job_cost", None)

            entry = AgentRunLogEntry(
                run_id=uuid.uuid4(),
                job_id=job_id,
                agent_name=agent_name,
                start_time=start_time,
                end_time=end_time,
                status="SUCCEEDED",
                model=model_name,
                token_usage=token_usage,
                estimated_cost=estimated_cost,
            )
            await append_agent_run(project_id, entry)
        except Exception:
            # Observability logging must never break the actual agent call.
            pass

    return result

