---
title: "AI Agent Authorization: Decoupling Policy Decisions with OPA and Rego"
description: "How to move authorization out of agent tool-wrapper code and into a centralized Open Policy Agent (OPA) Policy Decision Point, with a full Rego policy example."
categorySlug: "ai-llm-security"
articleType: "GUIDE"
tags:
  - "ai-agents"
  - "open-policy-agent"
  - "rego"
  - "authorization"
  - "prompt-injection"
  - "zero-trust"
---

# AI Agent Authorization: Decoupling Policy Decisions with OPA and Rego

## Problem Statement

Autonomous AI agents are highly susceptible to prompt injection, jailbreaking, and execution hijacking. When an agent decides *which* tool to call and with *what* parameters, we cannot let the LLM make the final decision of whether that call is authorized. If an attacker injects instructions into a document processed by a customer support agent, forcing it to call a tool like `kubernetes.delete_namespace`, a naive execution layer will run it without hesitation.

Hardcoding authorization rules directly into agentic tool wrapper scripts leads to tightly-coupled, unmaintainable, and non-auditable policy structures. To secure agentic tool execution, we must implement a centralized, decoupled policy decision framework that intercepts and validates every proposed tool call against zero-trust policies before execution.

---

## Technical Architecture

Decoupling authorization from execution requires a central Policy Decision Point (PDP) using Open Policy Agent (OPA).

1. **The Proposal:** The LLM Agent decides to execute a tool (e.g., `run_sql_query`) with proposed arguments.
2. **The Interception:** The Agent Host interceptor (Policy Enforcement Point - PEP) halts execution.
3. **The Inquiry:** The host packages the agent's identity, the tool name, environmental metadata, and the proposed arguments, and queries the local OPA Daemon.
4. **The Decision:** OPA evaluates the payload against strict, declarative Rego policies and returns a Boolean result.
5. **The Execution:** If allowed, execution proceeds; if denied, a structured rejection is logged and optionally returned to the LLM as an error to handle.

```text
+-------------+         +-------------+         +------------+         +-------------+
|  LLM Agent  |         | Agent Host  |         | OPA Engine |         | Target Env  |
+-------------+         +-------------+         +------------+         +-------------+
       |                       |                       |                      |
       | 1. Generate Tool Call |                       |                      |
       |---------------------->|                       |                      |
       |                       | 2. Query /v1/data     |                      |
       |                       |---------------------->|                       |
       |                       |   (Tool, Args, Role)  |                      |
       |                       |                       |                      |
       |                       | 3. Evaluate Policy    |                      |
       |                       |    (Rego Rules)       |                      |
       |                       |                       |                      |
       |                       | 4. Return Decision    |                      |
       |                       |<----------------------|                      |
       |                       |    (Allow: True/False)|                      |
       |                       |                       |                      |
       |                       | 5. Execute (If Allow) |                      |
       |                       |--------------------------------------------->|
       |                       |                       |                      | (Allowed Action)
```

---

## Implementation: Pre-Execution Tool Check & Rego Policy

The following Python interceptor validates a proposed tool execution against OPA, accompanied by the corresponding declarative Rego policy.

### Python Tool Interceptor

```python
import requests
from typing import Dict, Any

OPA_URL = "http://localhost:8181/v1/data/agent/authz"

class UnauthorizedToolExecution(Exception):
    pass

def verify_and_execute_tool(
    agent_identity: Dict[str, Any],
    proposed_tool_call: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Intercepts the tool call proposed by the LLM and executes
    a pre-flight authorization check against the OPA engine.
    """
    payload = {
        "input": {
            "agent": agent_identity,       # e.g., {"id": "data-agent-1", "role": "analyst"}
            "tool": proposed_tool_call["name"],  # e.g., "query_user_db"
            "arguments": proposed_tool_call["arguments"] # e.g., {"query": "DROP TABLE transactions;"}
        }
    }

    try:
        response = requests.post(OPA_URL, json=payload, timeout=2.0)
        response.raise_for_status()
        decision = response.json().get("result", {})
    except Exception as e:
        raise UnauthorizedToolExecution(f"Policy Engine unreachable: {e}")

    if not decision.get("allow", False):
        reason = decision.get("reason", "Action denied by OPA policy.")
        raise UnauthorizedToolExecution(f"Security Policy Denied Execution: {reason}")

    # Execution is authorized, proceed to the safe sandbox
    return {"status": "success", "result": f"Executed {proposed_tool_call['name']} successfully."}
```

### OPA Rego Policy (`policy.rego`)

```rego
package agent.authz

default allow = false
default reason = "Default deny: No matching authorization policy rules found."

# Rule: Allow read-only operations for analyst roles
allow {
    input.agent.role == "analyst"
    is_safe_read_tool(input.tool)
    not contains_destructive_args(input.arguments)
}

# Rule: Allow full administrative execution for system-admin roles
allow {
    input.agent.role == "system-admin"
}

# Helper: Match safe, non-mutating tools
is_safe_read_tool(tool) {
    safe_tools := ["query_user_db", "fetch_report", "describe_schema"]
    safe_tools[_] == tool
}

# Helper: Detect destructive keywords in SQL arguments
contains_destructive_args(arguments) {
    destructive_keywords := ["drop", "truncate", "delete", "alter", "update"]
    keyword := destructive_keywords[_]
    contains(lower(arguments.query), keyword)
}

# Custom rejection explanation for policy auditing
reason = "Forbidden: Analyst role is barred from executing SQL write/destructive operations." {
    input.agent.role == "analyst"
    contains_destructive_args(input.arguments)
}
```

---

## Strategic Remediations

1. **Decouple Policy Decision Point (PDP):** Never let the agent host be the sole evaluator of its rules. Delegate decision-making to dedicated services like OPA or AWS Verified Permissions to ensure policies are managed independently of application code.
2. **Context-Aware Dynamic Evaluation:** Policies must evaluate dynamic environmental properties (e.g., target environment, call frequency, or time windows) to counter LLM prompt-injection-driven API exhaustion attacks.
3. **Strict Structured Schemas:** Force agents to output parameters matching strict JSON schemas (e.g., integers, enums) instead of raw text strings. This enables Rego policies to easily inspect variable bounds, preventing injection commands disguised as payload fields.
