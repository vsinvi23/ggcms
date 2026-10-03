---
title: "Agentic AI: The ReAct (Reason + Act) Loop Pattern"
description: "How the ReAct pattern turns a static LLM into an autonomous agent by interleaving Thought, Action, and Observation steps, with a complete from-scratch Python implementation."
type: "ARTICLE"
categorySlug: "generative-ai"
articleType: "GUIDE"
tags:
  - "agentic-ai"
  - "react-pattern"
  - "llm-agents"
  - "tool-use"
  - "prompt-engineering"
---

# Agentic AI: The ReAct (Reason + Act) Loop Pattern

## The Problem: Static Generation vs. Dynamic Execution

Standard zero-shot or chain-of-thought (CoT) prompting models LLM generation as a static, linear feedforward pass. Ask a plain LLM "What is the current temperature in Tokyo?" and it will either hallucinate a plausible-sounding number or apologize for not having real-time data — it cannot *do* things. While CoT encourages step-by-step reasoning, that reasoning stays confined entirely to the model's frozen parameters. If a task requires real-world data — stock prices, a weather API, a database lookup, a system log — a standard LLM has no way to fetch it mid-generation.

```
Standard Chain-of-Thought (Static):
  User Prompt -> [Reasoning Step 1 -> Reasoning Step 2] -> Static Output (No tools, prone to hallucination)

ReAct Pattern (Dynamic Loop):
  User Prompt -> [Thought -> Action -> Tool Run -> Observation] -> Iterate -> Final Answer
```

Furthermore, if an LLM is forced to generate a complex multi-step plan up front with no feedback, any error early in the plan cascades into a completely incorrect final output. An autonomous agent needs a dynamic, stateful loop that lets it reason, act on external systems, observe the results, and adjust its plan in real time.

## The ReAct Architecture

Introduced in a 2022 paper from Princeton and Google researchers, **ReAct (Reason + Act)** forces the LLM to interleave its internal monologue (reasoning) with API executions (acting) in a single structured output format. This solves two problems at once:

1. **Explainability & grounding.** The model explicitly states *why* it is taking an action, which reduces hallucination because the reasoning step is externalized and checkable rather than hidden inside a single opaque answer.
2. **Error recovery.** If a tool call returns an error or an unexpected result, the model reads that error in the next "Observation" step, reasons about what went wrong, and adjusts its next action instead of committing blindly to a bad plan.

```
+-------------------------------------------------------------------------+
| The ReAct (Reason + Act) State Machine                                  |
+-------------------------------------------------------------------------+
|                                                                         |
|                               User Prompt                               |
|                                    |                                    |
|                                    v                                    |
|                             +------------+                              |
|                             | State Init |                              |
|                             +------------+                              |
|                                    |                                    |
|       +----------------------------+----------------------------+       |
|       |                            |                            |       |
|       v                            v                            v       |
|  +---------+                 +-----------+                +-----------+ |
|  | Thought | --------------> |  Action   | -------------> |Observation| |
|  |         |                 |           |                |           | |
|  | "I need |                 | Call tool |                | Parse tool| |
|  | to run  |                 | with JSON |                | response &| |
|  | tool X" |                 | arguments |                | append to | |
|  +---------+                 +-----------+                | context   | |
|       ^                            |                      +-----------+ |
|       |                            |                            |       |
|       |                            v                            |       |
|       |                    Is Tool Executed?                    |       |
|       |                      /           \                      |       |
|       |                    Yes            No                    |       |
|       |                    /               \                    |       |
|       +---------- [Append Output]      [Emit Final Answer] <----+       |
|                                                                         |
+-------------------------------------------------------------------------+
```

The agent's prompt template guides the LLM to output its response in a structured, repeatable format:

1. **Thought:** The model analyzes the current state and determines the next logical step.
2. **Action:** The model selects an external tool and generates the exact input parameters for it.
3. **Observation:** The execution environment runs the selected tool, captures the output, and appends it to the conversation history as a new observation.

By feeding this updated context back to the model, the agent can verify its progress, correct mistakes, and determine when it has gathered enough information to output the final answer.

### The ReAct Lifecycle Phases

| Phase | Purpose | Target Format / Output |
| :--- | :--- | :--- |
| **Thought** | Analyze current context and formulate the next goal. | `Thought: I need to query API X to find Y.` |
| **Action** | Select a tool and define its execution arguments. | `Action: tool_name[{"arg": "value"}]` |
| **Observation** | Execute the tool and capture its raw output. | `Observation: {"result": "success", "data": ...}` |
| **Synthesis** | Evaluate the observation and decide whether to stop or loop. | `Thought` or `Final Answer: ...` |

### System Prompt Example

A ReAct agent is essentially a `while` loop that parses specific text tags (or, in modern implementations, JSON tool-call payloads) out of the LLM's output. The system prompt heavily coerces the model into strictly following the `Thought -> Action -> Observation` format:

```markdown
You are an autonomous agent. You have access to the following tools:
- get_weather(location: string)
- search_wiki(query: string)

You MUST use the following format:
Question: the input question
Thought: you should always think about what to do
Action: the action to take, should be one of [get_weather, search_wiki]
Action Input: the input to the action
Observation: the result of the action
... (this Thought/Action/Action Input/Observation can repeat N times)
Thought: I now know the final answer
Final Answer: the final answer to the original input
```

## Implementation: A Robust, Native ReAct Loop

This Python script implements a complete, self-contained ReAct agent loop from scratch using regex-based parsing over mock tools, with no external agent framework. It models the whole state machine as a single class with an explicit history log, which is what any production implementation needs for debugging and observability.

```python
import re
from typing import Callable, Dict, Any, Tuple

# Define a simple math tool and database lookup tool
def calculate_expression(expr: str) -> str:
    """Safely evaluates basic mathematical operations."""
    try:
        # Limit vocabulary for safety -- never eval() untrusted arbitrary text
        if not re.match(r'^[\d+\-*/\s().]+$', expr):
            return "Error: Invalid characters in expression."
        return str(eval(expr))
    except Exception as e:
        return f"Error evaluating math: {str(e)}"

def lookup_database(key: str) -> str:
    """Simulates looking up database entries."""
    db = {
        "jupiter_mass_kg": "1.898e27",
        "earth_mass_kg": "5.972e24",
        "gravitational_constant": "6.6743e-11"
    }
    return db.get(key.strip().lower(), f"Key '{key}' not found.")

# Tool Registry
TOOLS: Dict[str, Callable[[str], str]] = {
    "calculate": calculate_expression,
    "db_lookup": lookup_database
}

class ReActAgent:
    def __init__(self, system_prompt: str, tools: Dict[str, Callable[[str], str]], max_iterations: int = 6):
        self.system_prompt = system_prompt
        self.tools = tools
        self.max_iterations = max_iterations
        self.reset()

    def reset(self):
        self.history = []

    def execute_step(self, mock_llm_response: str) -> Tuple[bool, str]:
        """Processes a single step. Returns (is_final_answer, content)."""
        print(f"\n--- Model Response ---\n{mock_llm_response}")
        self.history.append(mock_llm_response)

        # Parse final answer
        if "Final Answer:" in mock_llm_response:
            final_match = mock_llm_response.split("Final Answer:")[-1].strip()
            return True, final_match

        # Parse action block: Action: tool_name[arguments]
        action_match = re.search(r"Action:\s*(\w+)\[(.*)\]", mock_llm_response)
        if not action_match:
            return True, "Error: Model failed to output correct ReAct formatting."

        tool_name = action_match.group(1)
        tool_arg = action_match.group(2)

        if tool_name in self.tools:
            print(f"Executing Tool [{tool_name}] with argument [{tool_arg}]...")
            observation = self.tools[tool_name](tool_arg)
            observation_text = f"Observation: {observation}"
            print(f"--> {observation_text}")
            self.history.append(observation_text)
            return False, observation_text
        else:
            err = f"Observation: Tool '{tool_name}' not available."
            self.history.append(err)
            return False, err

    def run(self, mock_llm_turns: list) -> str:
        """Drives the loop over a bounded number of iterations -- never unbounded."""
        for step, turn in enumerate(mock_llm_turns[: self.max_iterations]):
            is_finished, result = self.execute_step(turn)
            if is_finished:
                return result
        return "Agent hit max iterations without a Final Answer."

# Verification Simulation
if __name__ == "__main__":
    system_prompt = (
        "Solve the user query using the ReAct framework. Use only: calculate[expr] and db_lookup[key].\n"
        "Format: Thought: <reasoning>\nAction: <tool>[<arg>]\nObservation: <result>\n"
        "When finished, conclude with 'Final Answer: <answer>'"
    )

    agent = ReActAgent(system_prompt, TOOLS)

    # Simulating the turn-by-turn LLM generation sequence for a complex question:
    # "How many Earths could fit in Jupiter's mass?"
    mock_llm_turns = [
        # Turn 1: Reason and decide to lookup Jupiter's mass
        "Thought: To answer how many Earths fit in Jupiter's mass, I need to fetch both of their masses.\n"
        "Action: db_lookup[jupiter_mass_kg]",

        # Turn 2: Receive observation, decide to lookup Earth's mass
        "Thought: Jupiter's mass is 1.898e27 kg. Now I need to retrieve Earth's mass.\n"
        "Action: db_lookup[earth_mass_kg]",

        # Turn 3: Calculate the ratio
        "Thought: Jupiter is 1.898e27 kg and Earth is 5.972e24 kg. I need to divide Jupiter's mass by Earth's mass.\n"
        "Action: calculate[1.898e27 / 5.972e24]",

        # Turn 4: Final synthesis
        "Thought: The calculation returns approximately 317.81. I now have the final answer.\n"
        "Final Answer: Approximately 317.81 Earth masses are equal to the mass of Jupiter."
    ]

    print("Initiating ReAct Loop simulation...")
    final_answer = agent.run(mock_llm_turns)
    print(f"\n[Execution Completed] Output:\n{final_answer}")
```

Running this prints each Thought/Action pair, the executed tool call and its observation, and finally the synthesized answer — the exact loop diagrammed above, made concrete.

## Moving Beyond Text: JSON and Native Tool Calling

While the original ReAct paper relied on text parsing (`Action: tool_name[args]`), modern implementations — OpenAI's function calling, Anthropic's tool use, Gemini's function calling — abstract the text parsing away entirely. The LLM natively returns a structured `tool_calls` JSON object instead of a string the host has to regex out of prose:

```text
+-------------------------------------------------------------+
|               The Native Tool-Calling Handshake              |
+-------------------------------------------------------------+
| 1. App -> LLM:  Messages + [JSON Schemas]                   |
| 2. LLM -> App:  "tool_call": {"name": "get_weather",         |
|                                "args": {"city": "SFO"}}      |
| 3. App (Local): executes get_weather("SFO") -> 22 C          |
| 4. App -> LLM:  "tool_result": "22 C"                        |
| 5. LLM -> App:  "It is currently 22 degrees in SFO."         |
+-------------------------------------------------------------+
```

The *logical pattern* is identical to the loop above: the agent pauses generation, outputs a structured intent (Thought + Action), the host executes the API, and returns a structured `tool_result` (Observation) to resume generation. Native tool calling just replaces fragile regex parsing with a guaranteed schema — the underlying ReAct state machine doesn't change. For the mechanics of defining those JSON schemas and validating arguments against them, see this knowledge base's tool-definition article.

## Key Takeaway

The ReAct framework transforms static LLMs into dynamic problem-solving engines by separating execution into distinct Thought, Action, and Observation phases. This lets ReAct-style agents leverage external tools, correct errors mid-task, and handle complex multi-step problems that are impossible under standard prompting — and it remains the foundational loop underneath every more sophisticated agent architecture, including graph-based orchestration frameworks like LangGraph.
