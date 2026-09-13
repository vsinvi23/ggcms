import asyncio
import sys
from backend.workflows.content_pipeline import build_graph
from backend.agents.base import AgentExecutionError
from backend.configs.settings import settings

async def main() -> int:
    graph = build_graph()
    initial_state = {
        "project_id": "test_proj_123",
        "topic": "Python Asyncio Fundamentals",
        "revisions_count": 0,
        "is_approved": False
    }

    print(f"Testing Graph Compilation and Execution (MOCK_MODE={settings.mock_mode})...")
    try:
        final_state = await graph.ainvoke(initial_state)
        print("Success! Final State keys:", final_state.keys())
        print("Is Approved:", final_state.get("is_approved"))
        return 0
    except AgentExecutionError as e:
        # Structured, fail-loud path: never swallow this into a bare string.
        # Surface every AgentError field so a failed run is unambiguous and
        # distinguishable from a silently-empty "success".
        print("FAILED: AgentExecutionError raised (fail-loud path working as intended)")
        print("  error_type:", e.error.error_type)
        print("  agent_name:", e.error.agent_name)
        print("  retryable:", e.error.retryable)
        print("  message:", e.error.message)
        return 1
    except Exception as e:
        print("FAILED: Unexpected non-structured error executing graph:", type(e).__name__, str(e))
        return 1

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

