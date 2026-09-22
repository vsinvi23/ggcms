# Agentic AI: The ReAct (Reason + Act) Loop Pattern

### The Problem: Static Generation vs. Dynamic Execution
Standard Large Language Models are static sequence generators. When asked a question like "What is the current temperature in Tokyo?", a standard LLM will either hallucinate a number or apologize for not having real-time data. It cannot *do* things. 

To transition from a static conversationalist to an autonomous Agent, the LLM needs a structural pattern that allows it to break down complex goals, query external tools, observe the results, and update its state. The most robust architectural pattern for this is **ReAct (Reason + Act)**.

### The ReAct Architecture
Introduced in a 2022 paper by Princeton and Google researchers, ReAct forces the LLM to output its internal monologue (Reasoning) interweaved with API executions (Acting). 

This solves two massive problems:
1. **Explainability & Grounding**: The LLM explicitly states *why* it is taking an action, reducing hallucinations.
2. **Error Recovery**: If an API returns an error, the LLM reads the error in the "Observation" step, reasons about what went wrong, and adjusts its next action.

```text
+-------------------------------------------------------+
|                 The ReAct Loop                        |
+-------------------------------------------------------+
| User: "What is the weather in Tokyo?"                 |
|                                                       |
| +---> [ Thought ] "I need to check the weather API."  |
| |                                                     |
| |     [ Action  ]  get_weather(location="Tokyo")      |
| |                                                     |
| |     [ Observe ]  { "temp": 22, "condition": "Sun" } |
| |                                                     |
| +---> [ Thought ] "The temperature is 22C."           |
|                                                       |
|       [ Final Answer ] "It is currently 22°C..."      |
+-------------------------------------------------------+
```

### State Machine Implementation
A ReAct agent is essentially a `while` loop that parses specific text tags or JSON schemas from the LLM. The system prompt heavily coerces the LLM to strictly follow the `Thought -> Action -> Observation` format.

#### System Prompt Example
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

#### Code Implementation: The Loop Controller
Here is a robust Python architecture demonstrating the host loop that executes the ReAct pattern.

```python
import re

class ReActAgent:
    def __init__(self, llm_client, tools, max_iterations=5):
        self.llm = llm_client
        self.tools = tools
        self.max_iterations = max_iterations
        self.prompt_template = "..." # (See system prompt above)

    def run(self, user_query):
        context = self.prompt_template + f"\nQuestion: {user_query}\n"
        
        for step in range(self.max_iterations):
            # 1. LLM Generation
            response = self.llm.generate(context)
            context += response
            
            # 2. Check for Final Answer
            if "Final Answer:" in response:
                return response.split("Final Answer:")[-1].strip()
            
            # 3. Parse Action and Action Input
            action_match = re.search(r"Action: (.*?)\n", response)
            input_match = re.search(r"Action Input: (.*?)\n", response)
            
            if action_match and input_match:
                action_name = action_match.group(1).strip()
                action_input = input_match.group(1).strip()
                
                # 4. Execute Tool (Act)
                if action_name in self.tools:
                    observation = self.tools[action_name](action_input)
                else:
                    observation = f"Error: Tool {action_name} not found."
                
                # 5. Append Observation and Loop
                obs_text = f"\nObservation: {observation}\n"
                context += obs_text
                print(f"Step {step}: {action_name}({action_input}) -> {observation}")
            else:
                return "Agent failed to format output correctly."
                
        return "Agent hit max iterations."
```

### Moving Beyond Text: JSON and Tool Calling
While the original ReAct paper relied on text parsing (`Action: ...`), modern implementations (like OpenAI's Function Calling or Anthropic's Tool Use) abstract the text parsing away. The LLM natively returns structured JSON. However, the *logical pattern* remains exactly the same: The agent pauses generation, outputs a JSON intent (Thought + Action), the host executes the API, and returns a JSON `tool_result` (Observation) to resume generation.

### Conclusion
The ReAct loop is the foundational OS scheduler for Agentic AI. By forcing LLMs to externalize their reasoning and interact with environment states via a standard loop, developers can build reliable, fault-tolerant autonomous systems that bridge the gap between language generation and real-world execution.
