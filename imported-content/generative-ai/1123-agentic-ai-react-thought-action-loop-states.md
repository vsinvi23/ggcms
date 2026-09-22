# Agentic AI: The ReAct (Reason + Act) Loop Pattern

**The Problem:** Standard LLMs suffer from hallucinations, outdated information, and an inability to affect the real world. They are passive text generators. To build autonomous agents that solve complex, multi-step problems, the model needs a cognitive architecture that interleaves thinking with execution.

## The ReAct Framework
ReAct (Reasoning and Acting) is a paradigm introduced by researchers (Yao et al., 2022) that bridges the gap between internal reasoning (Chain-of-Thought) and external actions (Tool usage). 

Instead of just generating a final answer, the ReAct prompt structures the LLM's output into a continuous loop of three states:
1. **Thought:** The model analyzes the current situation and decides what to do next.
2. **Action:** The model emits a command to invoke an external tool (e.g., Search, Calculator, API).
3. **Observation:** The execution environment runs the tool and feeds the result back to the model.

### The Loop Execution

```text
+---------+      Thought      +---------+
|         | ----------------> |         |
|   LLM   |      Action       |  Agent  |
|         | <---------------- | Runtime |
+---------+    Observation    +---------+
     ^                             |
     |                             v
     +-----------------------------+
             Execute Tool
```

### Implementing the Prompt Structure
The magic of ReAct lies in the system prompt. You instruct the LLM strictly to use a specific format.

```text
You are a helpful AI assistant. You have access to the following tools:
- Wikipedia_Search(query: str)
- Calculator(expression: str)

Use the following format:
Question: the input question you must answer
Thought: you should always think about what to do
Action: the action to take, should be one of [Wikipedia_Search, Calculator]
Action Input: the input to the action
Observation: the result of the action
... (this Thought/Action/Action Input/Observation can repeat N times)
Thought: I now know the final answer
Final Answer: the final answer to the original input question
```

### Code Architecture (Python)
An agent runtime is a simple `while` loop parsing the text.

```python
import re

class ReActAgent:
    def __init__(self, llm, tools):
        self.llm = llm
        self.tools = tools
        self.memory = []
        
    def run(self, prompt):
        self.memory.append({"role": "user", "content": prompt})
        
        while True:
            response = self.llm.generate(self.memory)
            self.memory.append({"role": "assistant", "content": response})
            
            # Regex to parse Action and Action Input
            action_match = re.search(r"Action: (.*?)\nAction Input: (.*)", response)
            
            if "Final Answer:" in response:
                return response.split("Final Answer:")[1].strip()
                
            if action_match:
                action_name = action_match.group(1).strip()
                action_input = action_match.group(2).strip()
                
                # Execute tool
                observation = self.tools[action_name](action_input)
                
                # Feed observation back into context
                obs_text = f"Observation: {observation}\nThought:"
                self.memory.append({"role": "user", "content": obs_text})
            else:
                raise ValueError("Agent failed to output correct format.")
```

## Why ReAct Outperforms Chain-of-Thought
Chain-of-Thought (CoT) prompts the model to "think step by step," but its reasoning is completely bounded by its pre-trained weights. If it makes a factual error early in the chain, the error cascades.

ReAct grounds the reasoning. The *Observation* step acts as a reality check. If an API returns an error or a search returns no results, the subsequent *Thought* allows the LLM to self-correct, formulate a new query, and try again, achieving true agentic autonomy.