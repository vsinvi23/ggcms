# Multi-Agent Orchestration: Designing Stateful Graphs with LangGraph

### The Problem: The Limits of Linear Agent Loops
Basic agentic patterns, like the ReAct (Reason + Act) loop, operate on a linear, while-loop architecture. The agent loops indefinitely until it outputs a "Final Answer." While suitable for simple Q&A, this paradigm breaks down for complex, multi-step enterprise workflows (e.g., Code Review, Data Engineering, or Customer Support Escalation).

Complex workflows require:
1.  **Multiple Personas**: A "Researcher" agent handing off data to a "Writer" agent.
2.  **Cyclic State Machines**: Conditional routing where a "Reviewer" agent can reject the "Writer's" draft and loop it back for revision.
3.  **State Persistence**: The ability to pause the agentic flow, wait for a Human-in-the-Loop (HITL) approval, and resume exactly where it left off.

Standard linear loops cannot model this. We need **Graph-based State Machines**. **LangGraph** (built on top of LangChain) is the industry standard for this orchestration.

### The LangGraph Architecture
LangGraph models multi-agent systems as a Directed Cyclic Graph (DCG).
*   **State**: A typed, globally shared object (usually a Python `TypedDict` or Pydantic model) that is passed between nodes. Every node reads and mutates this state.
*   **Nodes**: Python functions (or LLM chains) representing actors or tools. They take the State as input, perform work, and return an updated State.
*   **Edges**: Directed paths connecting Nodes.
*   **Conditional Edges**: Logic routers that look at the current State and decide which Node should execute next (enabling `if/else` loops and human-in-the-loop pauses).

```text
+-------------------------------------------------------+
|               Multi-Agent State Graph                 |
+-------------------------------------------------------+
|                                                       |
|   [ Start ] ---> ( Researcher Node )                  |
|                         |                             |
|                         v                             |
|                  ( Writer Node )                      |
|                         |                             |
|                         v                             |
|                 ( Reviewer Node )                     |
|                         |                             |
|       +---(REJECT)------+------(APPROVE)---+          |
|       |                                    |          |
|       v                                    v          |
|  [ Rewriter Node ]                      [ End ]       |
|       |                                               |
|       +-----------------> ( Reviewer Node )           |
+-------------------------------------------------------+
```

### Implementing a Stateful Graph
In LangGraph, the most critical component is defining the `State`. Reducers define how state is updated when a node returns data. For message histories, we typically append new messages rather than overwriting them.

#### Code Architecture: Writer/Reviewer Loop
```python
from typing import TypedDict, Annotated, List
from langgraph.graph import StateGraph, END
import operator

# 1. Define the Global State
class AgentState(TypedDict):
    task: str
    draft: str
    feedback: str
    revision_count: int
    messages: Annotated[List[str], operator.add] # Append new messages

# 2. Define Node Functions
def writer_node(state: AgentState):
    # (Simulated LLM call to write/rewrite based on task/feedback)
    prompt = f"Task: {state['task']}\nFeedback: {state['feedback']}"
    new_draft = simulate_llm_write(prompt) 
    
    return {
        "draft": new_draft,
        "revision_count": state.get("revision_count", 0) + 1,
        "messages": ["Writer submitted draft."]
    }

def reviewer_node(state: AgentState):
    # (Simulated LLM call to review draft)
    verdict, feedback = simulate_llm_review(state["draft"])
    
    return {
        "feedback": feedback,
        "messages": [f"Reviewer decision: {verdict}"]
    }

# 3. Define Conditional Routing
def review_router(state: AgentState) -> str:
    if "Looks good" in state["feedback"]:
        return "approved"
    if state["revision_count"] >= 3:
        return "max_revisions_reached"
    return "rejected"

# 4. Compile the Graph
workflow = StateGraph(AgentState)

# Add Nodes
workflow.add_node("writer", writer_node)
workflow.add_node("reviewer", reviewer_node)

# Add Edges
workflow.set_entry_point("writer")
workflow.add_edge("writer", "reviewer")

# Add Conditional Edges
workflow.add_conditional_edges(
    "reviewer",         # Origin node
    review_router,      # Routing function
    {
        "approved": END,               # Route to end
        "max_revisions_reached": END,  # Route to end
        "rejected": "writer"           # Loop back to writer
    }
)

app = workflow.compile()
```

### Checkpointing and Human-in-the-Loop
Because the graph relies on a strongly typed State object, LangGraph natively supports **Checkpointers** (e.g., SQLite, Postgres). After every node execution, the entire state is serialized to a database. 

This enables "Time Travel" and HITL. An execution can be paused at a specific node (e.g., before sending an email), allowing a human to query the database, review the `draft` inside the State, manually edit it, and then resume the graph execution.

### Conclusion
Linear agent loops are toys; State Graphs are production architectures. By explicitly defining state schemas, atomic node operations, and conditional routing logic, tools like LangGraph enable AI Engineers to build deterministic, resilient, and highly complex Multi-Agent Systems that integrate safely into enterprise environments.
