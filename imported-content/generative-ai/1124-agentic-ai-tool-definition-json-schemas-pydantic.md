# LLM Tool Calling: Wiring APIs and JSON Function Definitions

**The Problem:** While ReAct loops parse text via regex to trigger actions, this approach is brittle. LLMs often hallucinate tool names, forget arguments, or malform JSON strings in free-text generation. Modern LLMs (like GPT-4 and Claude 3) solve this natively via **Tool Calling** (or Function Calling), moving tool execution from fragile text parsing to robust, schema-enforced API features.

## The Architecture of Tool Calling
Tool calling does not mean the LLM executes the code. Instead, the LLM is fine-tuned to recognize when a tool is needed and to output a structured JSON object containing the required arguments. The developer's application executes the function and returns the result to the LLM.

```text
1. User Request --> [ App ]
2. [ App ] sends Request + Tool Schemas --> [ LLM API ]
3. [ LLM API ] decides to call a tool, returns JSON Args --> [ App ]
4. [ App ] parses JSON, executes local function --> [ Local DB / API ]
5. [ App ] sends Function Result --> [ LLM API ]
6. [ LLM API ] generates natural language response --> [ App ]
```

## JSON Schemas and Pydantic
To tell the LLM what tools are available, we pass JSON Schema definitions. These schemas act as the contract between the LLM and your code. Providing strict types, enums, and clear descriptions drastically reduces LLM hallucinations.

### Defining the Schema
A standard OpenAPI/JSON Schema definition looks like this:

```json
{
  "name": "get_current_weather",
  "description": "Get the current weather in a given location",
  "parameters": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "The city and state, e.g. San Francisco, CA"
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

### The Pydantic Advantage
Writing raw JSON schema is tedious and error-prone. Modern Python frameworks (like LlamaIndex, LangChain, or Instructor) use **Pydantic** to generate these schemas automatically from Python class definitions, ensuring runtime type safety.

```python
from pydantic import BaseModel, Field
import json

class WeatherQuery(BaseModel):
    """Get the current weather in a given location"""
    location: str = Field(..., description="The city and state, e.g. San Francisco, CA")
    unit: str = Field(default="celsius", description="Temperature unit")

# Pydantic automatically generates the JSON schema for the LLM
schema = WeatherQuery.model_json_schema()
print(json.dumps(schema, indent=2))
```

## Handling the LLM Response
When the LLM decides to invoke the tool, the API response includes a specific `tool_calls` payload instead of standard text.

```python
# Pseudo-code for handling tool calls
response = llm_client.chat(messages, tools=[schema])

if response.tool_calls:
    for call in response.tool_calls:
        if call.name == "get_current_weather":
            # Parse the JSON arguments provided by the LLM
            args = json.loads(call.arguments)
            
            # Execute the local Python function
            weather_data = my_local_weather_api(location=args['location'], unit=args.get('unit'))
            
            # Append the result to the message history
            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "content": json.dumps(weather_data)
            })
            
    # Make a second call to the LLM with the tool results
    final_response = llm_client.chat(messages)
```

## Best Practices
1. **Rich Descriptions:** The `description` field in the schema is the prompt for the tool. Be explicit about *when* to use it and *how* to format the inputs.
2. **Limit Tools:** Providing 50 tools confuses the model. Context-route queries to specific agents with 3-5 highly relevant tools.
3. **Error Handling:** If the LLM generates invalid JSON, catch the exception, append the error message as a `tool` observation, and let the LLM self-correct in the next turn.