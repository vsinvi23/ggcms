# Multi-Agent Orchestration: Designing Stateful Graphs with LangGraph

**The Problem:** Simple agentic loops (like ReAct) operate on a linear `While` loop. As workflows become more complex (e.g., human-in-the-loop approvals, parallel execution, fallback routing, and distinct agent personas), linear loops become unmanageable. Managing the state and memory of multiple agents requires a robust, stateful orchestration framework.

## LangGraph: Agents as Graph Nodes

LangGraph models agent workflows as directed cyclical graphs. The architecture relies on three primitives:
1. **State:** A globally shared, strongly typed data structure that is passed between nodes.
2. **Nodes:** Python functions (or LLM agents) that receive the State, modify it, and return the update.
3. **Edges:** Conditional routing logic that determines the next node based on the current State.

```text
       [ Start ]
           |
           v
    +-------------+
    | Researcher  | <--------+
    | Node (LLM)  |          |
    +-------------+          |
           |                 |
      (Condition:            |
      Needs more data?) -----+
           |
        (No)
           v
    +-------------+
    | Summarizer  |
    | Node (LLM)  |
    +-------------+
           |
           v
        [ End ]
```

## Defining the Global State

The State is typically defined using Python `TypedDict` or `Pydantic`. Unlike traditional variables, State fields usually utilize **Reducers**. A reducer defines how a new update merges with the existing state (e.g., appending a message to a list rather than overwriting it).

```python
from typing import TypedDict, Annotated
import operator

class AgentState(TypedDict):
    # The `operator.add` reducer means updates will be appended to the list
    messages: Annotated[list[str], operator.add]
    research_data: str
    iteration_count: int
```

## Building Nodes and Edges

Nodes are purely functional. They accept the state, perform logic, and return a dictionary of the fields they wish to update.

```python
def researcher_node(state: AgentState):
    # Extract current state
    history = state["messages"]
    count = state.get("iteration_count", 0)
    
    # LLM Call (mocked)
    result = llm.invoke(f"Research this: {history[-1]}")
    
    # Return updates to the state
    return {
        "research_data": result,
        "iteration_count": count + 1
    }

def summarizer_node(state: AgentState):
    data = state["research_data"]
    summary = llm.invoke(f"Summarize: {data}")
    return {"messages": [f"Summary: {summary}"]}

def router(state: AgentState) -> str:
    # Conditional Edge Logic
    if state["iteration_count"] >= 3:
        return "summarizer"
    if "insufficient" in state["research_data"].lower():
        return "researcher"
    return "summarizer"
```

## Compiling the Graph

Once nodes and edges are defined, they are compiled into a highly resilient `StateGraph`.

```python
from langgraph.graph import StateGraph, END

# 1. Initialize Graph with State Definition
workflow = StateGraph(AgentState)

# 2. Add Nodes
workflow.add_node("researcher", researcher_node)
workflow.add_node("summarizer", summarizer_node)

# 3. Add Edges
# Start node flows to researcher
workflow.set_entry_point("researcher")

# Researcher conditionally routes to itself or summarizer
workflow.add_conditional_edges(
    "researcher",
    router,
    # Edge map: {router_output: node_name}
    {"researcher": "researcher", "summarizer": "summarizer"}
)

# Summarizer flows to END
workflow.add_edge("summarizer", END)

# 4. Compile with persistent memory (checkpointing)
from langgraph.checkpoint.sqlite import SqliteSaver
memory = SqliteSaver.from_conn_string(":memory:")

app = workflow.compile(checkpointer=memory)
```

## Advanced Capabilities: Checkpointing and Time Travel

Because the graph execution is managed by a state machine with a checkpointer, LangGraph allows for "Time Travel." You can pause execution, inspect the state, run a human-in-the-loop approval, manually overwrite the state via the API, and resume execution from that exact node.

This shifts LLM orchestration from unpredictable scripts to enterprise-grade, event-driven architectures.
