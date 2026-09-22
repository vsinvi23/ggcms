# Function Calling Explained from First Principles

## The Problem: Brittle Structured Data Extraction
Before native function calling was introduced, extracting structured actions from unstructured text models was incredibly fragile. Software engineers had to write complex system instructions (e.g., "Output ONLY valid JSON and do not include markdown blocks or conversational text"). 

Despite these instructions, autoregressive models frequently generated conversational prefixes (e.g., "Sure, here is your JSON..."), invalid trailing characters, or hallucinated fields. Any parser attempting to ingest this output would raise syntax exceptions, crashing the execution pipeline.

```
Conversational text (Unstructured) -> LLM -> Raw Text (Brittle JSON) -> Regex/JSON Parser -> CRASH!
```

To build reliable AI integration pipelines, applications require **guaranteed structure**. The model must reliably match a predefined programming API, halts its output stream exactly when a call is formulated, and returns a schema-conforming payload.

## Architectural Design: The Round-Trip Function Calling Flow
Native function calling solves this problem by moving structure validation from the post-generation phase directly into the generation loop (logit bias and constraint enforcement).

```
1. Client sends Prompt + JSON Schema declarations
         |
         v
2. LLM evaluates logit limits based on active schema
         |
         v
3. LLM outputs special token (e.g., <tool_call>) -> Client HALTS generation
         |
         v
4. Client executes local code associated with tool
         |
         v
5. Client sends tool output back to LLM to resume generation
```

This round-trip flow guarantees that the LLM behaves as a router. The client-side application is responsible for the actual execution, keeping security boundaries tightly protected.

## Implementation: Schema Validation and Logit Simulation
To understand function calling at a fundamental level, we must inspect how JSON schemas are declared and validated. The Python code below demonstrates how to declare a tool's capabilities using Pydantic models (generating standard JSON schemas) and provides a safe local router to simulate the parsing and validation steps.

```python
import json
from typing import Dict, Any, Type
from pydantic import BaseModel, Field

# Step 1: Declare the target tool contract using Pydantic (First Principles)
class GetDatabaseUserSchema(BaseModel):
    """Retrieves user profile information from the database."""
    user_id: int = Field(..., description="The unique integer identifier of the user.")
    fields: list[str] = Field(
        default=["username", "email"], 
        description="Specific fields to fetch to reduce database read overhead."
    )

# Step 2: Define the underlying executable code
def execute_get_db_user(user_id: int, fields: list[str]) -> Dict[str, Any]:
    # Mock Database Query
    mock_database = {
        101: {"username": "alice99", "email": "alice@secure.com", "role": "admin"},
        102: {"username": "bob_builder", "email": "bob@build.com", "role": "developer"}
    }
    profile = mock_database.get(user_id, {})
    return {field: profile.get(field, "N/A") for field in fields}

# Step 3: Local Orchestration Engine
class LocalToolExecutor:
    def __init__(self):
        self.registry: Dict[str, Dict[str, Any]] = {}

    def register_tool(self, name: str, schema_class: Type[BaseModel], executable: callable):
        self.registry[name] = {
            "schema": schema_class.model_json_schema(),
            "class": schema_class,
            "exec": executable
        }

    def generate_schemas_payload(self) -> Dict[str, Any]:
        """Formats schemas for the LLM injection payload."""
        return {name: info["schema"] for name, info in self.registry.items()}

    def execute_call(self, tool_name: str, arguments_str: str) -> Dict[str, Any]:
        """Safely parses arguments against the schema class, then executes."""
        if tool_name not in self.registry:
            return {"error": f"Tool '{tool_name}' not registered."}
        
        target = self.registry[tool_name]
        try:
            # Parse and strictly validate the JSON arguments
            args_json = json.loads(arguments_str)
            validated_args = target["class"](**args_json)
            
            # Execute the deterministic function
            result = target["exec"](**validated_args.model_dump())
            return {"status": "success", "result": result}
        except Exception as e:
            return {"status": "validation_error", "details": str(e)}

if __name__ == "__main__":
    executor = LocalToolExecutor()
    executor.register_tool("get_user_profile", GetDatabaseUserSchema, execute_get_db_user)

    # 1. Inspect the JSON Schema payload sent to the API
    print("=== Payload Sent to LLM (System Contract) ===")
    print(json.dumps(executor.generate_schemas_payload(), indent=2))
    print()

    # 2. Simulate standard successful LLM-generated function call
    simulated_llm_call = {
        "name": "get_user_profile",
        "arguments": '{"user_id": 102, "fields": ["username", "role"]}'
    }
    print("=== Processing Valid Tool Call ===")
    out_valid = executor.execute_call(simulated_llm_call["name"], simulated_llm_call["arguments"])
    print(json.dumps(out_valid, indent=2))
    print()

    # 3. Simulate invalid schema payload (will raise validation error)
    simulated_bad_call = {
        "name": "get_user_profile",
        "arguments": '{"user_id": "NOT_AN_INT", "fields": ["username"]}'
    }
    print("=== Processing Invalid Tool Call ===")
    out_invalid = executor.execute_call(simulated_bad_call["name"], simulated_bad_call["arguments"])
    print(json.dumps(out_invalid, indent=2))
```

## Logit Constraints: Under the Hood
Modern models (like OpenAI's or Gemini's function calling) do not rely simply on post-hoc JSON validation. Instead, the inference engine modifies **logit biases** dynamically during token generation. 

When the model enters tool-selection mode, the vocabulary search space is programmatically restricted to only the characters and strings valid within the JSON schema's state machine. For instance, if the schema demands `{"user_id": int}`, the probability of generating alphabetical text is set to zero (by applying a negative infinity bias to non-numeric tokens), leaving only integers as valid generation candidates. This low-level logit constraint ensures structured precision, paving the way for seamless, crash-free agent integrations.
