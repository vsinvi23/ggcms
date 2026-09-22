# LLM Tool Calling: Wiring APIs and JSON Function Definitions

## The Problem: The Fragility of Text-Parsing
Historically, connecting an LLM to an external API required complex string parsing. The model would generate text (e.g., `Action: get_weather("New York")`), and the application layer would rely on brittle Regular Expressions to extract the intent and parameters. This approach collapses when parameters become complex (nested arrays, booleans, enums) or when the LLM hallucinates arguments that the API cannot accept.

To build reliable Agentic AI, we need absolute determinism in how models request tool executions. 

## Architecture: Native Tool Calling & JSON Schema
Modern LLMs (GPT-4, Claude 3, LLaMA-3) are fine-tuned natively for "Tool Calling." Instead of relying on text parsing, you pass a strict JSON Schema representing your APIs directly into the LLM's system prompt or specialized API endpoint. 

When the model decides to use a tool, it suspends its standard text generation and outputs a structured JSON payload that perfectly adheres to your provided schema.

```text
[ Tool Calling Architecture ]

+--------------------+                 +---------------------+
| LLM Application    |                 | LLM API (e.g. OpenAI|
|                    |  System Prompt  |                     |
| 1. Define Schemas  |  + Tools Array  |                     |
|    (JSON Schema)   | ---------------->                     |
+--------------------+                 | 2. Analyze Context  |
         ^                             | 3. Decide to use    |
         |                             |    'get_weather'    |
         |                             +---------------------+
         |                                       |
         |      Returns JSON Payload             |
         <---------------------------------------+
         |      { "name": "get_weather", 
         |        "args": {"city": "NYC"} }
+--------------------+
| 4. Execute API     |
| 5. Return Result   |
+--------------------+
```

## Robust Implementation: Pydantic to JSON Schema
Writing raw JSON Schemas is tedious and error-prone. The industry standard in Python is to use **Pydantic** models. Pydantic provides runtime type validation and can automatically generate the exact JSON Schema required by LLM APIs.

```python
import json
from pydantic import BaseModel, Field

# 1. Define the tool's input structure using Pydantic
class GetWeatherParams(BaseModel):
    location: str = Field(
        ..., 
        description="The city and state, e.g., San Francisco, CA"
    )
    unit: str = Field(
        default="celsius", 
        description="The temperature unit to use. Infer this from the user's location."
    )

# 2. Define the exact Python function
def get_current_weather(location: str, unit: str = "celsius"):
    """Get the current weather in a given location."""
    # Mock API call
    return f"The weather in {location} is 22 degrees {unit}."

# 3. Automatically generate the OpenAI-compatible Tool Definition
weather_tool_definition = {
    "type": "function",
    "function": {
        "name": "get_current_weather",
        "description": "Get the current weather in a given location.",
        # Pydantic natively exports JSON Schema Draft 2020-12
        "parameters": GetWeatherParams.model_json_schema()
    }
}

print(json.dumps(weather_tool_definition, indent=2))
```

*Generated JSON Schema Output:*
```json
{
  "type": "function",
  "function": {
    "name": "get_current_weather",
    "description": "Get the current weather in a given location.",
    "parameters": {
      "properties": {
        "location": {
          "description": "The city and state, e.g., San Francisco, CA",
          "title": "Location",
          "type": "string"
        },
        "unit": {
          "default": "celsius",
          "description": "The temperature unit to use. Infer this from the user's location.",
          "title": "Unit",
          "type": "string"
        }
      },
      "required": ["location"],
      "title": "GetWeatherParams",
      "type": "object"
    }
  }
}
```

## Strategic Takeaways
Native tool calling utilizing JSON Schema eliminates the parsing bottleneck in AI applications. By leveraging Pydantic, developers guarantee that the LLM understands the specific data types, enums, and required parameters of their APIs, shifting the integration paradigm from unreliable text parsing to strongly-typed remote procedure calls (RPC).