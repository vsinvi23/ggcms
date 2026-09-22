# Agentic AI: The ReAct (Reason + Act) Loop Pattern

### The Problem: Static Execution vs. Real-World Interaction

Standard zero-shot or chain-of-thought (CoT) prompting models LLM generation as a static, linear feedforward pass. While CoT encourages step-by-step reasoning, it remains confined to the model's static parameters. If a task requires real-world data (e.g., retrieving stock prices, checking weather APIs, or reading system logs), a standard LLM cannot fetch this information on its own.

```
Standard Chain-of-Thought (Static):
  User Prompt -> [Reasoning Step 1 -> Reasoning Step 2] -> Static Output (No tools, prone to hallucination)

ReAct Pattern (Dynamic Loop):
  User Prompt -> [Thought -> Action -> Tool Run -> Observation] -> Iterate -> Final Answer
```

Furthermore, if an LLM is forced to generate a complex multi-step plan without feedback, any error early in the plan will cascade, leading to a completely incorrect final output. An autonomous agent needs a dynamic, stateful loop that allows it to reason, interact with external systems, observe the results, and adjust its plan in real time.

---

### Technical Architectures

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

The **ReAct** (Reasoning + Acting) pattern addresses this by combining reasoning and action into a unified, iterative loop. The agent's prompt template guides the LLM to output its response in a structured format:

1. **Thought:** The model analyzes the current state and determines the next logical step.
2. **Action:** The model selects an external tool and generates the exact input parameters for it.
3. **Observation:** The execution environment runs the selected tool, captures the output, and appends it to the conversation history as a new observation.

By feeding this updated context back to the model, the agent can verify its progress, correct mistakes, and determine when it has gathered enough information to output the final answer.

---

### The ReAct Lifecycle Phases

| Phase | Purpose | Target Format / Output |
| :--- | :--- | :--- |
| **Thought** | Analyze current context and formulate the next goal. | `Thought: I need to query API X to find Y.` |
| **Action** | Select a tool and define its execution arguments. | `Action: tool_name[{"arg": "value"}]` |
| **Observation**| Execute the tool and capture its raw output. | `Observation: {"result": "success", "data": ...}` |
| **Synthesis** | Evaluate the observation and decide whether to stop or loop. | `Thought` or `Final Answer: ...` |

---

### Implementation: A Robust, Native ReAct Loop

This Python script implements a complete, self-contained ReAct agent loop from scratch. It uses regex parsing to run a state machine with mock math and lookup tools, without relying on external agent frameworks.

```python
import re
from typing import Callable, Dict, Any

# Define a simple math tool and database lookup tool
def calculate_expression(expr: str) -> str:
    """Safely evaluates basic mathematical operations."""
    try:
        # Limit vocabulary for safety
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
    def __init__(self, system_prompt: str, tools: Dict[str, Callable[[str], str]]):
        self.system_prompt = system_prompt
        self.tools = tools
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
    for turn in mock_llm_turns:
        is_finished, result = agent.execute_step(turn)
        if is_finished:
            print(f"\n[Execution Completed] Output:\n{result}")
            break
```

### Key Takeaway
The ReAct framework transforms static LLMs into dynamic problem-solving engines. By separating execution into distinct Thought, Action, and Observation phases, ReAct-style agents can leverage external tools, correct errors, and handle complex multi-step tasks that are impossible with standard prompting.
