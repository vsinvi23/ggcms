# LLM Tool Calling: Wiring APIs and JSON Function Definitions

### The Problem: Bridging LLM Text Outputs with Deterministic APIs

Large Language Models (LLMs) process and generate unstructured natural language. However, external APIs, databases, and microservices require structured, deterministic inputs like JSON or XML. 

If we rely on standard zero-shot prompting and ask the model to "output JSON," we encounter reliability issues. Under load, the model may output malformed JSON, omit required fields, write conversational preambles (e.g., "Here is the JSON you requested:"), or hallucinate parameters that do not match our API specifications.

```
Standard Prompt Output (Malformed JSON Risk):
  [LLM] ---> "Sure, here is the JSON: { 'temp': 72F }" (Breaks parser immediately)

Tool-Calling (Structured Schema Enforcement):
  [LLM System] ---> Inject JSON Schemas ---> [LLM] ---> Outputs Exact JSON Arguments ---> [Orchestrator Execution]
```

To build reliable agents, we must enforce a strict, schema-driven protocol. The orchestration layer must supply the LLM with precise JSON Schema declarations of the available tools. The LLM must then act as a structured parser, returning a validated, machine-readable JSON payload containing the function name and arguments, while deferring execution to the host environment.

---

### Technical Architectures

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

#### JSON Schema Injection
When a model supports tool calling, the orchestrator passes an array of tool definitions alongside the system prompt. Each definition uses the industry-standard **JSON Schema** format to define:
- `name`: The exact function identifier.
- `description`: A detailed description explaining *when* and *how* to use the function. The model's attention mechanism uses this description to select the appropriate tool.
- `parameters`: A schema object specifying the parameter types, descriptions, nested structures, and required fields.

#### JSON Argument Extraction
When processing a query, the model determines if any of the registered tools can help resolve it. If so, the model stops generating conversational text and outputs a structured `tool_calls` payload instead:

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

The orchestrator parses this JSON, runs the corresponding local function with the provided arguments, and returns the result to the LLM to continue the conversation.

---

### Key Stages in the Tool Calling Lifecycle

| Stage | Responsibility | Primary Mechanism |
| :--- | :--- | :--- |
| **Registration** | Orchestrator | Declares Python functions and compiles their signatures into JSON Schema. |
| **Selection & Parsing** | LLM | Analyzes the prompt, matches it to a schema description, and outputs arguments. |
| **Validation** | Orchestrator | Verifies that the LLM's output matches the required schema fields. |
| **Execution** | Orchestrator | Executes the local function using the validated arguments. |

---

### Implementation: Dynamic Tool Registration and Validation

This Python implementation provides a complete, robust system for tool registration, JSON schema generation, and safe execution using Pydantic.

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

### Key Takeaway
By combining client-side JSON Schemas with runtime validation engines like Pydantic, developers can establish a robust, bi-directional communication channel between LLMs and external systems. This schema-driven validation ensures that agents execute API calls reliably and safely, even when handling complex or ambiguous user prompts.
