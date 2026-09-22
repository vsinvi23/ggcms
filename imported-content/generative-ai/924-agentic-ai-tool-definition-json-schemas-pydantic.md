# LLM Tool Calling: Wiring APIs and JSON Function Definitions

**The Problem:** In agentic workflows, parsing raw text (like the ReAct pattern) using Regex is brittle. LLMs often generate malformed strings, inject conversational filler, or hallucinate parameters. For robust API integration, the LLM must natively understand structured data schemas and output deterministic, strictly-typed payloads. Tool Calling (Function Calling) solves this by fine-tuning models to output JSON based on explicit schema definitions.

## The Tool Calling Architecture

Instead of prompting an LLM with text instructions on how to use a tool, the developer passes a structured JSON Schema representing the tool's signature alongside the prompt. The model is specifically trained to recognize these schemas and emit a specialized JSON object containing the function name and arguments.

```text
[ System Prompt ] + [ User Prompt ] + [ Tool Schemas (JSON) ]
                              |
                     [ LLM Inference ]
                              |
             +----------------+-----------------+
             |                                  |
     [ Text Response ]                [ Tool Call payload ]
                                      { "name": "get_weather",
                                        "arguments": {"location": "SF"} }
```

## JSON Schema Definition

Modern APIs (like OpenAI's or Anthropic's) utilize JSON Schema to define tools. A robust definition includes descriptions for every parameter, as the LLM uses these descriptions to reason about the input.

```json
{
  "type": "function",
  "function": {
    "name": "query_database",
    "description": "Executes a SQL SELECT query to retrieve user data.",
    "parameters": {
      "type": "object",
      "properties": {
        "sql_query": {
          "type": "string",
          "description": "The read-only SQL query to execute."
        },
        "limit": {
          "type": "integer",
          "description": "Max rows to return. Default 100."
        }
      },
      "required": ["sql_query"]
    }
  }
}
```

## Pydantic: The Python Standard for Tool Definitions

Writing raw JSON schemas is error-prone. In Python architectures, `Pydantic` is used to define models. Pydantic leverages Python type hints to automatically generate the JSON Schema and validate the LLM's output.

```python
from pydantic import BaseModel, Field

class DatabaseQueryTool(BaseModel):
    """Executes a SQL SELECT query to retrieve user data."""
    sql_query: str = Field(
        ..., 
        description="The read-only SQL query to execute."
    )
    limit: int = Field(
        default=100, 
        description="Max rows to return."
    )

# Automatically generate the JSON Schema for the LLM
schema = DatabaseQueryTool.model_json_schema()
```

## The Execution Flow

When the LLM triggers a tool, the client must execute it and return the result as a specialized `Tool Message` to close the loop.

1. **LLM Emits Call:** The API response indicates `finish_reason="tool_calls"`.
2. **Client Validation:** The client parses the JSON string. Using Pydantic, the client validates the payload to prevent injection attacks or type errors.
3. **Execution:** The client executes the actual Python function.
4. **Return Observation:** The result is appended to the message history and sent back to the LLM.

```python
import json

# 1. Mocking the LLM's response payload
llm_response = {
    "tool_calls": [
        {"id": "call_123", "function": {"name": "query_database", "arguments": "{\"sql_query\": \"SELECT * FROM users;\"}"}}
    ]
}

# 2. Client-side execution loop
for tool_call in llm_response['tool_calls']:
    name = tool_call['function']['name']
    raw_args = tool_call['function']['arguments']
    
    if name == "query_database":
        try:
            # 2a. Validate with Pydantic
            args = DatabaseQueryTool.model_validate_json(raw_args)
            
            # 3. Execute
            result = run_sql(args.sql_query, args.limit)
            status = "success"
        except Exception as e:
            result = str(e)
            status = "error"
            
        # 4. Construct Tool Message
        tool_message = {
            "role": "tool",
            "tool_call_id": tool_call['id'],
            "content": json.dumps({"status": status, "data": result})
        }
        # Append to history and re-prompt LLM...
```

## Best Practices for Tool Schemas

1. **Enum Enforcement:** If a parameter only accepts specific strings, use `Enum` in Pydantic. The LLM will strictly adhere to the provided enum values.
2. **Defensive Descriptions:** Do not just define *what* a parameter is; define *how* to generate it (e.g., "Use ISO-8601 format like 2024-01-01").
3. **Limit Scope:** Give the LLM narrow, composable tools rather than a single `do_everything` tool with 20 optional parameters. LLMs struggle with highly branched parameter logic.
