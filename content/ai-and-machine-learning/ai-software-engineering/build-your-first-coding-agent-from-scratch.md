---
title: "Building Your First Coding Agent from Scratch"
description: "A dependency-free Python walkthrough of the read-eval-write agent loop — an LLM coordinator, a tool executor, and an observation feedback loop — that shows exactly how a coding agent writes code, fails a test, and self-corrects."
categorySlug: "ai-software-engineering"
articleType: "GUIDE"
tags:
  - "ai-coding-agents"
  - "agent-loop"
  - "tool-calling"
  - "python"
  - "self-correction"
---

# Building Your First Coding Agent from Scratch

Commercial coding agents can seem complex, wrapped in heavy layers and databases. This hides the elegant simplicity of their core operational loop. At their foundation, all agents rely on a read-eval-write cycle. Building a coding agent from scratch in Python demystifies how these systems interact with environments and recover from errors.

## The Problem: De-Bloating the Agentic Pipeline

Framework abstractions make it difficult to debug LLM tool-calling failures. Developers often struggle to understand:

- How the model decides to call a specific tool.
- How tool outputs are structured and returned to the model's history.
- How the system captures syntax errors and feeds them back for self-repair.

By building a dependency-free agent loop, we can expose these mechanics directly.

## The Mental Model: The Read-Eval-Write Loop (REWL)

The architecture of a minimal coding agent consists of an LLM coordinator connected to a local workspace through a deterministic tool executor.

```
       +---------------------------------------------+
       |               User Instruction               |
       +----------------------+----------------------+
                              |
                              v
       +----------------------v----------------------+
+----->|             LLM Coordinator                 |
|      | - Generates Thought and JSON-formatted Action|
|      +----------------------+----------------------+
|                             |
|                             v (Extract & Parse JSON)
|      +----------------------v----------------------+
|      |               Tool Executor                 |
|      | - Executes: WRITE, READ, or RUN_TESTS        |
|      +----------------------+----------------------+
|                             |
|                             v (Execute in Local Workspace)
|      +----------------------v----------------------+
|      |            Local Workspace State             |
|      | - Reads files, updates code, runs tests      |
|      +----------------------+----------------------+
|                             |
|                             v (Capture stdout/stderr)
+----------------------[Observation]-----------------+
```

## Core Components of the Agent

To build this loop, we need three key components:

1. **The System Prompt**: Establishes strict rules, forcing the model to output a structured JSON command rather than conversational prose.
2. **The Tool Executor**: A Python routing layer that executes file reads, writes, and test-running processes, capturing standard output and error streams.
3. **The Observation Feedback Loop**: The engine that formats execution results and appends them to the LLM's conversation history.

## Concrete Implementation: An Executable Coding Agent

The following script implements a fully functional coding agent. To make it self-contained and runnable without external API keys, it uses a mock LLM service that simulates a real API call. The mock model responds to instructions, attempts to write code, encounters a test failure, and uses the failure message to correct its code.

```python
import sys
import json
import subprocess
from typing import Dict, List, Any

# Mock LLM API representing the model's response sequence
class MockLLMService:
    def __init__(self):
        self.turn = 0

    def generate(self, messages: List[Dict[str, str]]) -> str:
        self.turn += 1
        # Turn 1: Agent writes buggy code
        if self.turn == 1:
            return json.dumps({
                "thought": "I need to write a divide function in math_utils.py.",
                "action": "write_file",
                "param": "math_utils.py:def divide(a, b):\n    return a / b"
            })
        # Turn 2: Agent runs tests and realizes b=0 isn't handled
        elif self.turn == 2:
            return json.dumps({
                "thought": "The user wants a division function. Let's run pytest to verify.",
                "action": "run_test",
                "param": "math_utils.py"
            })
        # Turn 3: Agent sees test failure and patches the bug
        elif self.turn == 3:
            return json.dumps({
                "thought": "The test run failed due to division by zero. Let me add a check.",
                "action": "write_file",
                "param": "math_utils.py:def divide(a, b):\n    if b == 0:\n        raise ValueError('Cannot divide by zero')\n    return a / b"
            })
        # Turn 4: Agent verifies again
        elif self.turn == 4:
            return json.dumps({
                "thought": "Now let me run the tests again to verify.",
                "action": "run_test",
                "param": "math_utils.py"
            })
        # Turn 5: Finished
        return json.dumps({
            "thought": "The code is written, verified, and complete.",
            "action": "stop",
            "param": ""
        })

class LocalWorkspace:
    def __init__(self):
        self.files: Dict[str, str] = {}

    def execute_tool(self, action: str, param: str) -> str:
        if action == "write_file":
            filename, content = param.split(":", 1)
            self.files[filename] = content
            return f"Success: Wrote to {filename}."

        elif action == "run_test":
            filename = param
            code = self.files.get(filename, "")
            # Simulating execution & validation of tests
            if "if b == 0" not in code:
                return "FAIL: ZeroDivisionError occurred during verification of divide(10, 0)."
            return "PASS: All math test assertions passed."

        return "Unknown action."

# The main Agent Loop
def run_agent():
    llm = MockLLMService()
    workspace = LocalWorkspace()
    messages = [{"role": "user", "content": "Write a safe division function in math_utils.py."}]

    print("[Agent Initiated]")
    for step in range(1, 6):
        print(f"\n--- STEP {step} ---")
        response_text = llm.generate(messages)
        response_data = json.loads(response_text)

        print(f"Thought: {response_data['thought']}")
        action = response_data["action"]
        param = response_data["param"]

        if action == "stop":
            print("[Agent Completed Successfully]")
            break

        print(f"Executing Action [{action}] with param: {param}")
        observation = workspace.execute_tool(action, param)
        print(f"Observation: {observation}")

        # Append turn to message history
        messages.append({"role": "assistant", "content": response_text})
        messages.append({"role": "system", "content": f"Observation: {observation}"})

if __name__ == "__main__":
    run_agent()
```

Running this script prints five steps: the agent writes a naive `divide` function, runs the (simulated) test suite and sees it fail on division by zero, patches the function with a guard clause, re-runs the tests to confirm the fix, and stops. Nothing here calls a real LLM API — swapping `MockLLMService.generate` for a real client call (OpenAI, Anthropic, or a local model) that returns the same `{"thought", "action", "param"}` JSON shape is the only change needed to make this a working agent against a real workspace and a real test runner.

By mastering this foundational loop, you can build custom, highly secure agents designed to automate repetitive refactoring pipelines while retaining complete control over the execution boundary.

## Key Takeaways

- Every coding agent, however elaborate its framework, is built on the same read-eval-write cycle: the model emits a structured action, a deterministic executor runs it against real state, and the observation is fed back into the next turn.
- Forcing the model to emit strict JSON (`thought`/`action`/`param`) rather than free-form prose is what makes the tool executor's routing reliable — a parser has nothing to guess at.
- Self-repair isn't magic: it's the loop feeding a test failure's exact text back into the conversation history so the next generation turn has the diagnostic it needs to produce a fix.
