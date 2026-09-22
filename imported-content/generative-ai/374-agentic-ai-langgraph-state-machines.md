# Multi-Agent Orchestration: Designing Stateful Graphs with LangGraph

**The Problem:** The standard ReAct loop is a single `while True` statement executing a single LLM over and over. When scaling to complex enterprise tasks, a single prompt cannot hold the instructions for 50 tools, and a single LLM cannot maintain focus across 20 intermediate steps without getting confused.

**The Solution:** Stateful Graph Architectures (e.g., LangGraph). We model the agentic workflow as a Directed Cyclic Graph (DCG). Each node is a specialized agent (with a narrow prompt) or a python function, passing a shared State object along edges based on conditional logic.

### Architecture

```text
       [START]
          |
          v
+-------------------+
|  Supervisor Node  | ----> [END]
+-------------------+
  |      ^      |
  |      |      |
  v      |      v
[Coder Node]  [Reviewer Node]
```

### The State Object

The core of a LangGraph is the `State`. It is a TypedDict that holds the entire memory of the graph. As nodes execute, they return updates to this state (often using reducer functions to append messages rather than overwrite them).

```python
from typing import TypedDict, Annotated
import operator

class AgentState(TypedDict):
    # Annotated with operator.add means this list will append, not overwrite
    messages: Annotated[list, operator.add]
    task_status: str
    current_code: str
```

### Robust Implementation (Python)

Let's build a multi-agent system: a Supervisor that routes tasks to either a Coder or a Reviewer.

```python
from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage

llm = ChatOpenAI(model="gpt-4-turbo")

# 1. Node Functions
def coder_node(state: AgentState):
    prompt = f"Write python code based on this history: {state['messages']}"
    response = llm.invoke(prompt)
    return {"messages": [AIMessage(content=response.content, name="Coder")], "current_code": response.content}

def reviewer_node(state: AgentState):
    prompt = f"Review this code and provide feedback: {state['current_code']}"
    response = llm.invoke(prompt)
    return {"messages": [AIMessage(content=response.content, name="Reviewer")]}

def supervisor_node(state: AgentState):
    # Determine the next step based on the last message
    last_msg = state['messages'][-1]
    
    if last_msg.name == "Reviewer" and "LGTM" in last_msg.content:
        return {"task_status": "DONE"}
    elif last_msg.name == "Coder":
        return {"task_status": "NEEDS_REVIEW"}
    else:
        return {"task_status": "NEEDS_CODE"}

# 2. Conditional Routing Function
def router(state: AgentState):
    status = state.get("task_status")
    if status == "DONE":
        return END
    elif status == "NEEDS_REVIEW":
        return "Reviewer"
    else:
        return "Coder"

# 3. Build the Graph
workflow = StateGraph(AgentState)

workflow.add_node("Supervisor", supervisor_node)
workflow.add_node("Coder", coder_node)
workflow.add_node("Reviewer", reviewer_node)

workflow.set_entry_point("Supervisor")

workflow.add_conditional_edges("Supervisor", router)
workflow.add_edge("Coder", "Supervisor")
workflow.add_edge("Reviewer", "Supervisor")

app = workflow.compile()

# 4. Execute
inputs = {"messages": [HumanMessage(content="Write a function to calculate fibonacci.")], "task_status": ""}
for output in app.stream(inputs):
    print(list(output.keys())[0], "executed.")
```

### Benefits of State Machines
1. **Interruptibility:** LangGraph allows pausing the graph, asking for human-in-the-loop approval, and resuming from the exact state.
2. **Specialization:** The `Coder` gets a prompt heavily optimized for coding, while the `Reviewer` gets a prompt optimized for security.
3. **Debuggability:** You can trace exactly which node failed and inspect the exact `State` payload at that moment.
