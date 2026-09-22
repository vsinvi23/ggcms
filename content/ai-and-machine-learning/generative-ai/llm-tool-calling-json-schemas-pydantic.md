---
title: "LLM Tool Calling: Wiring APIs with JSON Schemas and Pydantic"
description: "How native tool calling replaced fragile regex-based prompt parsing, how to define tool schemas with Pydantic, and how to validate and execute LLM-issued tool calls safely."
type: "ARTICLE"
categorySlug: "generative-ai"
articleType: "GUIDE"
tags:
  - "tool-calling"
  - "function-calling"
  - "json-schema"
  - "pydantic"
  - "agentic-ai"
---

# LLM Tool Calling: Wiring APIs with JSON Schemas and Pydantic

## The Problem: Bridging LLM Text Outputs with Deterministic APIs

Large Language Models process and generate unstructured natural language. External APIs, databases, and microservices, on the other hand, require structured, deterministic inputs like JSON. If you rely on plain zero-shot prompting and simply ask a model to "output JSON," you run into reliability problems immediately: under load, the model can emit malformed JSON, omit required fields, prepend a conversational preamble ("Sure, here is the JSON you requested:"), or hallucinate parameters that don't match your API at all.

```
Standard Prompt Output (Malformed JSON Risk):
  [LLM] ---> "Sure, here is the JSON: { 'temp': 72F }" (Breaks parser immediately)

Tool-Calling (Structured Schema Enforcement):
  [LLM System] ---> Inject JSON Schemas ---> [LLM] ---> Outputs Exact JSON Arguments ---> [Orchestrator Execution]
```

Before 2023, giving tools to LLMs required intense prompt engineering to coerce the model into a specific text format (`Action: GET /users/123`), and developers wrote fragile regex parsers to pull the API name and arguments back out. If the model missed a quote or hallucinated a parameter, the whole pipeline crashed.

Modern LLMs solve this with **native tool calling (function calling)**. The model is trained to recognize a JSON Schema definition of a function and, when appropriate, output a guaranteed, structured JSON object representing the function call instead of freeform conversational text. To build reliable agents, the orchestration layer supplies the LLM with precise JSON Schema declarations of the available tools; the LLM acts as a structured parser that returns a validated, machine-readable payload containing the function name and arguments, and defers actual execution to the host environment.

## Tool Calling Lifecycle

```
+-----------------------------------------------------------------------------------------+
| Tool Calling Lifecycle Sequence Diagram                                                 |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|  [Orchestrator]                 [LLM Model]               [External API]                |
|       |                              |                           |                      |
|       |--- 1. Inject JSON Schemas -->|                           |                      |
|       |    & User Prompt             |                           |                      |
|       |                              |                           |                      |
|       |                              |--- 2. Parse & Select ---->|                      |
|       |                              |    Best Tool Fit          |                      |
|       |                              |                           |                      |
|       |<-- 3. Emit Tool Call --------|                           |                      |
|       |    Payload (Arguments JSON)  |                           |                      |
|       |                              |                           |                      |
|       |--- 4. Validate & Execute ------------------------------->|                      |
|       |    Parameters locally                                    |                      |
|       |                                                          |<-- 5. Return Raw ----|
|       |                                                          |    Response Data     |
|       |<-- 6. Capture Result ------------------------------------+                      |
|       |                                                                                 |
|       |--- 7. Append Observation Result to Context -----------------> [Next Step / End] |
|                                                                                         |
+-----------------------------------------------------------------------------------------+
```

1. **Definition** — the developer passes an array of JSON Schemas (describing available tools) to the LLM alongside the user prompt.
2. **Trigger** — the LLM decides whether it needs external data to answer. If so, it stops generating conversational text and yields a `tool_call` object instead.
3. **Execution** — the host application intercepts the `tool_call`, parses the JSON arguments, runs the corresponding local function, and captures the result.
4. **Resolution** — the host sends the result back to the LLM as a `tool_result` message. The LLM consumes it and formulates the final answer.

### JSON Schema Injection

Each tool definition uses the industry-standard JSON Schema format to define:
- `name` — the exact function identifier.
- `description` — a detailed explanation of *when* and *how* to use the function; the model's attention mechanism relies on this field to pick the right tool.
- `parameters` — a schema object specifying parameter types, descriptions, nested structures, and required fields.

When the model decides a tool applies, it emits a structured call:

```json
{
  "id": "call_abc123",
  "type": "function",
  "function": {
    "name": "get_weather",
    "arguments": "{\"location\": \"San Francisco, CA\", \"unit\": \"celsius\"}"
  }
}
```

The orchestrator parses this, runs the corresponding local function with the provided arguments, and returns the result to the LLM to continue the conversation.

### Key Stages in the Tool Calling Lifecycle

| Stage | Responsibility | Primary Mechanism |
| :--- | :--- | :--- |
| **Registration** | Orchestrator | Declares Python functions and compiles their signatures into JSON Schema. |
| **Selection & Parsing** | LLM | Analyzes the prompt, matches it to a schema description, and outputs arguments. |
| **Validation** | Orchestrator | Verifies that the LLM's output matches the required schema fields. |
| **Execution** | Orchestrator | Executes the local function using the validated arguments. |

## Defining Tools with Pydantic Instead of Raw JSON Schema

Writing raw JSON Schema by hand is error-prone and duplicates information you'd otherwise keep in your function's type hints. The standard Python approach is to define a **Pydantic** model and let it generate the JSON Schema for you:

```python
from pydantic import BaseModel, Field
import json

class WeatherInput(BaseModel):
    location: str = Field(..., description="City and state, e.g. San Francisco, CA")
    unit: str = Field(default="celsius", description="Temperature unit")

def get_weather(location: str, unit: str = "celsius") -> str:
    # Simulated API call
    return f"22 {unit} in {location}"

# Generate the JSON Schema dynamically instead of hand-writing it
schema = {
    "name": "get_weather",
    "description": "Get the current weather for a location",
    "parameters": WeatherInput.model_json_schema()
}

print(json.dumps(schema, indent=2))
```

This produces exactly the JSON Schema shape LLM APIs (OpenAI, Anthropic, Gemini) expect:

```json
{
  "name": "get_weather",
  "description": "Get the current weather for a location",
  "parameters": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "City and state, e.g. San Francisco, CA"
      },
      "unit": {
        "type": "string",
        "enum": ["celsius", "fahrenheit"]
      }
    },
    "required": ["location"]
  }
}
```

## Implementation: A Dynamic Tool Registry with Validation

Real systems register more than one tool, so it pays to build a small registry that owns schema generation, argument validation, and dispatch in one place rather than scattering `if function_name == "..."` branches through the codebase:

```python
import json
from typing import Dict, Any, Callable
from pydantic import BaseModel, Field, ValidationError

# 1. Define structured schemas using Pydantic models
class WeatherInput(BaseModel):
    location: str = Field(..., description="The city and state, e.g., 'San Francisco, CA' or 'London, UK'.")
    unit: str = Field("fahrenheit", description="The temperature unit, either 'celsius' or 'fahrenheit'.")

class DatabaseLookupInput(BaseModel):
    user_id: int = Field(..., description="The unique integer identifier of the target user.")

# 2. Implement actual executable backend tools
def get_current_weather(location: str, unit: str = "fahrenheit") -> Dict[str, Any]:
    # Simulated API response
    temp = 18 if unit == "celsius" else 64
    return {"location": location, "temperature": temp, "unit": unit, "condition": "Partly Cloudy"}

def get_user_metadata(user_id: int) -> Dict[str, Any]:
    # Simulated database lookup
    users = {
        1001: {"name": "Alice Smith", "role": "Platform Engineer", "status": "Active"},
        1002: {"name": "Bob Jones", "role": "Data Scientist", "status": "Suspended"}
    }
    return users.get(user_id, {"error": "User record not found."})

# 3. Build a robust Orchestrator registry
class ToolRegistry:
    def __init__(self):
        self.registry: Dict[str, Dict[str, Any]] = {}

    def register_tool(self, name: str, schema_cls: type[BaseModel], func: Callable[..., Any]):
        """Registers a function and its corresponding validation schema."""
        self.registry[name] = {
            "schema": schema_cls,
            "function": func,
            "json_schema": {
                "type": "function",
                "function": {
                    "name": name,
                    "description": func.__doc__ or "No description provided.",
                    "parameters": schema_cls.model_json_schema()
                }
            }
        }

    def get_all_schemas(self) -> list:
        """Returns schemas to be sent directly to the LLM api."""
        return [tool["json_schema"] for tool in self.registry.values()]

    def execute(self, name: str, raw_arguments: str) -> Dict[str, Any]:
        """Validates incoming arguments JSON against the schema and executes the tool."""
        if name not in self.registry:
            return {"error": f"Tool '{name}' is not registered."}

        tool = self.registry[name]
        try:
            # Parse and validate using Pydantic
            parsed_args = json.loads(raw_arguments)
            validated_input = tool["schema"](**parsed_args)

            # Execute actual python logic with unpack
            return tool["function"](**validated_input.model_dump())
        except json.JSONDecodeError:
            return {"error": "Arguments provided are not valid JSON."}
        except ValidationError as val_err:
            return {"error": f"Schema Validation Error: {val_err.errors()}"}
        except Exception as e:
            return {"error": f"Execution Error: {str(e)}"}

# Verification Execution
if __name__ == "__main__":
    # Initialize registry
    registry = ToolRegistry()
    registry.register_tool("get_weather", WeatherInput, get_current_weather)
    registry.register_tool("get_user", DatabaseLookupInput, get_user_metadata)

    # Check JSON schemas generated for LLM context injection
    print("--- Generated JSON Schemas for LLM Injection ---")
    print(json.dumps(registry.get_all_schemas()[0], indent=2))

    # Simulate a successful tool call from the LLM
    print("\n--- Simulating Successful Tool Call ---")
    success_call = registry.execute(
        name="get_weather",
        raw_arguments='{"location": "Seattle, WA", "unit": "celsius"}'
    )
    print("Result:", success_call)

    # Simulate a validation failure (invalid arguments)
    print("\n--- Simulating Validation Failure ---")
    fail_call = registry.execute(
        name="get_user",
        raw_arguments='{"user_id": "not_an_int"}'
    )
    print("Result:", fail_call)
```

The validation-failure case is not an edge case to shrug off — it's the normal path an LLM eventually takes when it slightly misremembers a field type. Because `ToolRegistry.execute` catches `ValidationError` and returns a structured error dict rather than raising, the caller can feed `{"error": "Schema Validation Error: [...]"}` straight back to the LLM as the tool result, letting the model read the validation error and retry with corrected arguments on its next turn.

## Handling the Tool Execution Loop Against a Real API Client

Wiring this into a real chat-completions call looks like parsing `tool_calls` off the response message, validating each one, and feeding results back:

```python
import json

def process_llm_response(llm_response_message):
    # Check if the LLM decided to call a tool
    if getattr(llm_response_message, "tool_calls", None):
        for tool_call in llm_response_message.tool_calls:
            function_name = tool_call.function.name

            # Safely load the JSON arguments
            try:
                raw_args = json.loads(tool_call.function.arguments)
            except json.JSONDecodeError:
                return trigger_error_recovery("Invalid JSON generated by LLM")

            # Map string name to actual Python function
            if function_name == "get_weather":
                # Validate arguments against Pydantic model
                try:
                    validated_args = WeatherInput(**raw_args)
                    result = get_weather(
                        location=validated_args.location,
                        unit=validated_args.unit
                    )
                    return submit_tool_result_to_llm(tool_call.id, result)
                except Exception as e:
                    # Pass validation errors back to LLM to self-correct
                    return submit_tool_result_to_llm(tool_call.id, f"Error: {e}")
```

## Best Practices for Tool Definitions

1. **Semantic descriptions.** The LLM relies entirely on the `description` fields to know *when* to use a tool. Be specific: "Fetches customer billing history using an email address" beats "Fetch data."
2. **Enums over free strings.** Restrict inputs with enums (`["USD", "EUR"]`) wherever possible — this mathematically prevents the LLM from hallucinating an invalid configuration value.
3. **Error feeding.** If a tool fails (404, validation error, timeout), send the exact error text back in the `tool_result`. Modern LLMs read the error and retry the call with corrected arguments, which is exactly what the registry's structured error dict above enables.

## Key Takeaway

By combining client-side JSON Schemas — generated from Pydantic models rather than hand-written — with a runtime validation layer, developers get a robust, bi-directional communication channel between LLMs and external systems. This schema-driven approach shifts AI engineering from parsing text with regex to building type-safe API routers, ensuring agents execute real API calls reliably even when handling complex or ambiguous user prompts.
