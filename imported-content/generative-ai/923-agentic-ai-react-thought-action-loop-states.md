# Agentic AI: The ReAct (Reason + Act) Loop Pattern

**The Problem:** Traditional LLMs act as static input-output engines. They suffer from hallucinations, lack access to real-time data, and cannot perform multi-step procedural tasks reliably. To execute complex workflows, an LLM must break out of the single-turn generation paradigm and adopt a framework for cyclical reasoning and external environment interaction.

## The ReAct Paradigm

ReAct (Reason + Act) is an agentic pattern that forces the LLM to interleave explicit "thought" traces with executable "actions." By exposing its internal reasoning step-by-step, the LLM maintains a coherent context, handles exceptions dynamically, and utilizes external tools (APIs, databases, bash shells).

### Architecture of the Loop

The core engine is a `While` loop managed by an orchestration layer (like LangChain or a custom script).

```text
[ User Prompt ]
      |
      v
+-------------+
| System Loop | <-------------------------------+
+-------------+                                 |
      |                                         |
      |--> LLM Output:                          |
      |    - Thought: "I need to find X."       |
      |    - Action: `Search(X)`                |
      |                                         |
      |--> Executor:                            |
      |    - Runs `Search(X)`                   |
      |    - Returns `Observation: Data...` ----+
      v
LLM Output: 
- Thought: "I have the data. I can answer."
- Final Answer: "X is Y."
```

## Prompt Engineering for ReAct

The foundation of ReAct is a highly structured system prompt. It defines the available tools, the required output format, and the strict adherence to the loop.

```markdown
You are a problem-solving agent. You have access to the following tools:
- search_web(query: string): Searches the internet.
- calculator(expression: string): Evaluates math.

You must follow this exact format:
Question: the input question you must answer
Thought: you should always think about what to do next
Action: the tool name to use, one of [search_web, calculator]
Action Input: the input to the tool
Observation: the result of the action (provided by the system)
... (this Thought/Action/Action Input/Observation can repeat N times)
Thought: I now know the final answer
Final Answer: the final answer to the original input question
```

## Implementation of the Loop

A robust ReAct loop requires a state machine to parse the LLM's text, execute the function, and append the context back into the conversation history.

```python
import re

class ReActAgent:
    def __init__(self, llm, tools):
        self.llm = llm
        self.tools = {t.name: t.func for t in tools}
        self.history = [SYSTEM_PROMPT]
        
    def step(self):
        # Generate next token sequence from LLM
        response = self.llm.generate(self.history)
        self.history.append(response)
        
        # Check for termination
        if "Final Answer:" in response:
            return response.split("Final Answer:")[1].strip()
            
        # Parse Action and Action Input using Regex
        action_match = re.search(r'Action: (.*)', response)
        input_match = re.search(r'Action Input: (.*)', response)
        
        if action_match and input_match:
            action_name = action_match.group(1).strip()
            action_input = input_match.group(1).strip()
            
            # Execute tool safely
            try:
                observation = self.tools[action_name](action_input)
            except Exception as e:
                observation = f"Error executing {action_name}: {e}"
                
            # Append observation for the next iteration
            self.history.append(f"Observation: {observation}\n")
            return None # Continue loop
        else:
            raise ValueError("LLM failed to output correct format.")

    def run(self, prompt, max_steps=10):
        self.history.append(f"Question: {prompt}\n")
        for _ in range(max_steps):
            result = self.step()
            if result: return result
        return "Agent exhausted max steps."
```

## Strengths and Limitations

**Strengths:**
- **Interpretability:** The `Thought` trace provides full transparency into the model's decision-making.
- **Error Recovery:** If an API returns a 404, the agent observes the error and can reason a new approach (e.g., "Thought: The exact match failed, I will try a fuzzy search.").

**Limitations:**
- **Context Window Exhaustion:** Long observations rapidly consume the context window.
- **Cost:** Each step of the loop requires processing the entire accumulated history, leading to high token costs and latency compared to single-shot generation.

To resolve these, modern architectures use structured JSON outputs rather than raw text parsing, and leverage Graph-based state machines (like LangGraph) for better memory management.
