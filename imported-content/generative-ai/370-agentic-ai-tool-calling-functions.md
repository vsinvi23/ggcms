# LLM Tool Calling: Wiring APIs and Function Definitions to GPT/Gemini

**The Problem:** Parsing raw text output from an LLM to trigger code execution (like in basic ReAct) is brittle. Regex parsers fail when the LLM deviates slightly from the requested string formatting, leading to catastrophic pipeline failures.

**The Solution:** Native Tool Calling (Function Calling). Modern LLMs (GPT-4, Gemini 1.5) are fine-tuned on syntax-level JSON schemas. They don't just output text; they output structured JSON bound to pre-defined API schemas, effectively turning the LLM into a deterministic router.

### Architecture

```text
+--------------+    (1) Schema + Prompt    +--------------+
| Application  | ------------------------> | LLM Provider |
|              | <------------------------ | (GPT/Gemini) |
+--------------+    (2) JSON Tool Call     +--------------+
       |
       v
(3) Execute Function
       |
       v
+--------------+    (4) Append Result      +--------------+
| Application  | ------------------------> | LLM Provider |
|              | <------------------------ |              |
+--------------+    (5) Final Synthesis    +--------------+
```

### Defining the Schema

The crux of Tool Calling is the JSON Schema. The LLM relies completely on the descriptions provided in this schema to decide *when* and *how* to use the tool. Ambiguous descriptions lead to hallucinated parameters.

```json
{
  "name": "get_customer_data",
  "description": "Retrieves the CRM profile for a given customer ID.",
  "parameters": {
    "type": "object",
    "properties": {
      "customer_id": {
        "type": "string",
        "description": "The unique UUID of the customer (e.g., 'CUST-12345')."
      },
      "include_history": {
        "type": "boolean",
        "description": "Set to true to include the customer's purchase history."
      }
    },
    "required": ["customer_id"]
  }
}
```

### Robust Implementation (Python w/ OpenAI API)

Here is a hardened execution flow. Note how we handle the `tool_calls` array, as the model may request multiple tools concurrently.

```python
import json
import openai
import os

client = openai.Client(api_key=os.getenv("OPENAI_API_KEY"))

def get_customer_data(customer_id: str, include_history: bool = False):
    # Simulated DB call
    return json.dumps({"name": "Alice", "status": "Active", "history_fetched": include_history})

# Tool mapping dict
available_functions = {
    "get_customer_data": get_customer_data,
}

def run_agentic_turn(user_input: str):
    messages = [{"role": "user", "content": user_input}]
    
    # 1. Initial LLM Call with tools array
    response = client.chat.completions.create(
        model="gpt-4-turbo",
        messages=messages,
        tools=[{
            "type": "function",
            "function": { # Schema definition above goes here...
                "name": "get_customer_data",
                "description": "Retrieves the CRM profile for a given customer ID.",
                "parameters": {"type": "object", "properties": {"customer_id": {"type": "string"}}, "required": ["customer_id"]}
            }
        }],
        tool_choice="auto"
    )
    
    response_msg = response.choices[0].message
    messages.append(response_msg)
    
    # 2. Check if the LLM wants to call a function
    if response_msg.tool_calls:
        for tool_call in response_msg.tool_calls:
            func_name = tool_call.function.name
            func_args = json.loads(tool_call.function.arguments)
            
            # 3. Execute the function locally
            func_to_call = available_functions.get(func_name)
            if not func_to_call:
                function_response = "Error: Tool not found."
            else:
                try:
                    function_response = func_to_call(**func_args)
                except Exception as e:
                    function_response = f"Error executing tool: {str(e)}"
            
            # 4. Append the tool observation to context
            messages.append({
                "tool_call_id": tool_call.id,
                "role": "tool",
                "name": func_name,
                "content": function_response,
            })
            
        # 5. Final synthesis call
        final_response = client.chat.completions.create(
            model="gpt-4-turbo",
            messages=messages,
        )
        return final_response.choices[0].message.content
        
    return response_msg.content
```

### Best Practices
- **Strict Typing:** Never use arbitrary `any` or `object` types for parameters if you can avoid it. Enforce `enums` to constrain model choices.
- **Error Injection:** If a local tool crashes, *do not* crash the application. Return the stack trace as a string to the `tool` role message. The LLM will read the error and often attempt to fix its parameters and call the tool again.
- **System Prompt Reinforcement:** Even with function definitions, explicitly state in the system prompt: "You must use `get_customer_data` before answering questions about user profiles."
