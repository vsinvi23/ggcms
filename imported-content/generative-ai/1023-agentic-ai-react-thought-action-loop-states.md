# Agentic AI: The ReAct (Reason + Act) Loop Pattern

## The Problem: The Hallucination of Agency
Large Language Models (LLMs) are exceptionally powerful at reasoning over text, but out-of-the-box, they are static. They cannot interact with the real world, fetch live data, or execute code. 

When prompted to "Check the stock price of AAPL and calculate the P/E ratio," a standard LLM will hallucinate a plausible-sounding but factually incorrect response based on its frozen training data. To bridge this gap, we must grant the LLM access to external tools (APIs, calculators, databases). However, simply providing tools isn't enough; the model needs a rigorous cognitive framework to decide *when* and *how* to use them.

## Architecture: The ReAct Pattern
ReAct (Reason + Act) is a prompting and execution paradigm that interleaves internal reasoning with external actions. Instead of attempting to solve a complex problem in a single forward pass, the LLM operates in an autonomous loop, observing the environment after every action.

The state machine for a ReAct loop consists of three distinct phases:
1. **Thought**: The model evaluates the current context and dictates the next logical step.
2. **Action**: The model requests the execution of a specific tool with specific parameters.
3. **Observation**: The system executes the tool and injects the raw result back into the prompt.

```text
[ The ReAct Loop ]

User Query: "What is the capital of France, and what is its population?"

+-----------------------------------------------------------+
| LLM Generation                                            |
|                                                           |
| Thought: I need to find the capital of France first.      |
| Action:  Search[Capital of France]                        |
+-----------------------------------------------------------+
           |
           v
+-----------------------------------------------------------+
| System Execution                                          |
| Observation: Paris.                                       |
+-----------------------------------------------------------+
           |
           v
+-----------------------------------------------------------+
| LLM Generation                                            |
|                                                           |
| Thought: The capital is Paris. Now find its population.   |
| Action:  Search[Population of Paris]                      |
+-----------------------------------------------------------+
           |
           v
+-----------------------------------------------------------+
| System Execution                                          |
| Observation: 2.16 million (2022).                         |
+-----------------------------------------------------------+
           |
           v
+-----------------------------------------------------------+
| LLM Generation                                            |
|                                                           |
| Thought: I have all the information. I can answer now.    |
| Action:  Finish[Paris, 2.16 million]                      |
+-----------------------------------------------------------+
```

## Robust Implementation

Below is a Python implementation of a minimal ReAct loop orchestrator. It uses a naive regex parser to extract actions, though production systems typically use strict JSON schemas.

```python
import re

class ReActAgent:
    def __init__(self, llm_client, tools: dict):
        self.llm = llm_client
        self.tools = tools
        self.system_prompt = """
You are a reasoning agent. Loop through Thought, Action, and Observation.
Use the exact format:
Thought: Describe your reasoning.
Action: ToolName[parameter]
Observation: (will be provided by the system)
If you have the final answer, use Action: Finish[your answer]

Available Tools: {tool_names}
"""
    def execute(self, user_query: str, max_iterations=5):
        context = self.system_prompt.format(tool_names=list(self.tools.keys()))
        context += f"\nUser: {user_query}\n"
        
        for i in range(max_iterations):
            # 1. LLM Generation (Thought + Action)
            response = self.llm.generate(context)
            context += response + "\n"
            
            # 2. Parse the Action
            action_match = re.search(r"Action:\s*(\w+)\[(.*?)\]", response)
            if not action_match:
                raise ValueError("Agent failed to output a valid action format.")
                
            tool_name, tool_param = action_match.groups()
            
            # Exit condition
            if tool_name == "Finish":
                return tool_param
                
            # 3. System Execution & Observation
            if tool_name not in self.tools:
                observation = f"Error: Tool {tool_name} not found."
            else:
                try:
                    observation = self.tools[tool_name](tool_param)
                except Exception as e:
                    observation = f"Tool Error: {str(e)}"
                    
            context += f"Observation: {observation}\n"
            
        return "Agent exhausted maximum iterations."
```

## Strategic Takeaways
The ReAct pattern shifts LLMs from passive text generators to active task solvers. By forcing the model to explicitly output its `Thought` before its `Action`, we leverage Chain-of-Thought (CoT) reasoning to improve accuracy, while the `Observation` step grounds the model in reality, effectively neutralizing hallucinations.