# Agentic AI: The ReAct (Reason + Act) Loop Pattern

**The Problem:** LLMs are static instruction followers. When faced with multi-step problems, they hallucinate or stall because they cannot dynamically interact with the world, query databases, or execute code based on intermediate observations.

**The Solution:** The ReAct (Reason + Act) pattern. It forces the LLM into a deliberate loop: thinking about the current state, choosing an action, observing the result, and repeating until a final answer is synthesized. 

### Architecture

```text
+-------------------+       +-----------------------+
|   User Prompt     | ----> |  ReAct Agent (LLM)    |
+-------------------+       +-----------------------+
                                ^       |
                          (3)   |       | (1) 
                     Observe    |       | Reason & Act
                                |       v
                            +-------------------+
                            |  Tool Executor    |
                            | (Search, DB, API) |
                            +-------------------+
                                   | (2) 
                                Execute Action
```

The core premise of ReAct is interleaving logical deduction (`Thought`) with environment interaction (`Action`), leading to a subsequent `Observation`. 

### The Prompt Structure

The ReAct pattern relies on a highly specific system prompt template that acts as the operating system for the agent:

```text
Answer the following questions as best you can. You have access to the following tools:
{tools}

Use the following format:
Question: the input question you must answer
Thought: you should always think about what to do
Action: the action to take, should be one of [{tool_names}]
Action Input: the input to the action
Observation: the result of the action
... (this Thought/Action/Action Input/Observation can repeat N times)
Thought: I now know the final answer
Final Answer: the final answer to the original input question
```

### Robust Implementation (Python)

Let's implement a minimal, robust ReAct loop using Python. We avoid heavy abstractions to expose the raw state machine.

```python
import re
import os
import openai

class ReActAgent:
    def __init__(self, tools, system_prompt):
        self.tools = {t.name: t for t in tools}
        self.system_prompt = system_prompt
        self.client = openai.Client(api_key=os.getenv("OPENAI_API_KEY"))
    
    def run(self, question, max_steps=5):
        prompt = self.system_prompt.replace("{tool_names}", ", ".join(self.tools.keys()))
        messages = [
            {"role": "system", "content": prompt},
            {"role": "user", "content": f"Question: {question}"}
        ]
        
        for step in range(max_steps):
            response = self.client.chat.completions.create(
                model="gpt-4",
                messages=messages,
                temperature=0.0
            ).choices[0].message.content
            
            messages.append({"role": "assistant", "content": response})
            print(response)
            
            # Check for final answer
            if "Final Answer:" in response:
                return response.split("Final Answer:")[-1].strip()
            
            # Parse Action and Action Input
            action_match = re.search(r"Action: (.*?)\n", response)
            input_match = re.search(r"Action Input: (.*?)\n", response)
            
            if action_match and input_match:
                action = action_match.group(1).strip()
                action_input = input_match.group(1).strip()
                
                if action in self.tools:
                    observation = self.tools[action].execute(action_input)
                    obs_msg = f"Observation: {observation}\n"
                    messages.append({"role": "user", "content": obs_msg})
                    print(obs_msg)
                else:
                    messages.append({"role": "user", "content": f"Observation: Tool {action} not found.\n"})
            else:
                messages.append({"role": "user", "content": "Observation: Format error. Please use Thought/Action/Action Input format.\n"})
                
        return "Agent stalled: Max steps reached."
```

### Trade-offs & Tuning
1. **Loop Unrolling:** LLMs easily get trapped in infinite loops (repeating the exact same failed action). We counteract this via the `max_steps` barrier and by injecting strict error messages directly into the observation block.
2. **Context Window Saturation:** ReAct consumes massive token counts rapidly. If your actions return 5000 lines of JSON, the loop will crash. Truncate and synthesize observations before feeding them back into the loop.
3. **Latency:** Sequential generation (Thought -> wait -> Action -> wait -> Observation -> wait) makes the ReAct loop fundamentally high-latency. Use it only when determinism and multi-step tool usage are strictly required. 
