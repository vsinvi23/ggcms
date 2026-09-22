# Designing Reliable AI Agents: Fallbacks, Validation, and Backoff

## The Brittleness of Raw LLM Integrations

When software engineers transition from standard APIs to Large Language Model (LLM) APIs, they encounter a fundamental challenge: non-determinism. Standard services return structured payloads with predictable, type-safe structures. In contrast, LLM APIs are probabilistic black boxes. They may output invalid JSON, omit required fields, drift in schema structure, or fail outright due to upstream rate limits and timeouts.

Relying on naive prompt engineering or basic try-except blocks in production results in high agent fragility. A single bad token can crash a pipeline or corrupt downstream analytics. To achieve a predictable 99.9% uptime, developers must surround cognitive model calls with programmatic validation, adaptive retry mechanisms, and structured fallback paths.

---

## Architectural Blueprint: The Resilient Token Lifecycle

The diagram below details the operational stages of a highly resilient LLM tool call wrapper, showing structured parsing, exponential backoff, and model fallback cascades.

```
       [Client Request]
              │
              ▼
    ┌──────────────────┐
    │  Execute Model   │ ◄─────────────────────────┐
    │   Request Loop   │                           │
    └─────────┬────────┘                           │
              │                                    │
       [HTTP 429/5xx] ──(Wait with Jitter)─────────┤ (Max Retries Exceeded)
              │                                    │
          [HTTP 200]                               │
              │                                    │
              ▼                                    │
    ┌──────────────────┐                           │
    │  Pydantic Parser │                           │
    └─────────┬────────┘                           │
              ├───────────[Parsing Failure]────────┘
              │
          [Success]
              │
              ▼
       [Return Payload]
```

---

## Technical Implementation: Resilient Agent Pipeline

This Python implementation leverages the `tenacity` retry framework and `pydantic` validation models to guarantee structured data parsing, backed by a secondary fallback model if the primary model repeatedly fails.

```python
import time
import random
from typing import Dict, Any, Type, Optional
from pydantic import BaseModel, Field, ValidationError

class ExtractedTask(BaseModel):
    task_id: str = Field(..., description="Unique alphanumeric identifier.")
    priority: int = Field(..., description="Priority scale from 1 to 5.")
    assigned_role: str = Field(..., description="The role or engine designated for task execution.")

def mock_llm_api_call(prompt: str, model: str) -> str:
    """Simulates an LLM API call that may return malformed data or raise HTTP 429 errors."""
    if random.random() < 0.2:
        raise Exception("HTTP 429: Rate Limit Exceeded")
    
    if model == "primary-frontier-model":
        # Simulate occasional bad formatting in primary model
        if random.random() < 0.2:
            return '{"task_id": "T-100", "priority": "high", "assigned_role": "QA"}'  # Invalid priority type
        return '{"task_id": "T-100", "priority": 4, "assigned_role": "QA"}'
    
    # Secondary model is slower but highly constrained
    return '{"task_id": "T-100", "priority": 5, "assigned_role": "QA"}'

class ReliableAgentCaller:
    def __init__(self, max_retries: int = 3, base_delay: float = 1.0):
        self.max_retries = max_retries
        self.base_delay = base_delay

    def call_with_backoff(self, prompt: str, model: str) -> str:
        """Executes API calls with truncated exponential backoff and randomized jitter."""
        for attempt in range(self.max_retries):
            try:
                return mock_llm_api_call(prompt, model)
            except Exception as e:
                if attempt == self.max_retries - 1:
                    raise e
                # Calculate backoff with jitter: base * 2^attempt + dynamic noise
                sleep_time = (self.base_delay * (2 ** attempt)) + random.uniform(0, 0.5)
                print(f"[RETRY] Error on '{model}': {e}. Retrying in {sleep_time:.2f}s...")
                time.sleep(sleep_time)
        raise Exception("Max retries exceeded")

    def execute_and_validate(self, prompt: str, schema: Type[BaseModel]) -> BaseModel:
        # Step 1: Attempt generation with primary model
        try:
            raw_response = self.call_with_backoff(prompt, "primary-frontier-model")
            validated_obj = schema.model_validate_json(raw_response)
            return validated_obj
        except (ValidationError, Exception) as error:
            print(f"[FALLBACK] Primary model failed validation or network threshold: {error}")
            
            # Step 2: Cascade execution to secondary, deterministic model
            try:
                print("[FALLBACK] Routing to secondary-fallback-model...")
                fallback_response = self.call_with_backoff(prompt, "secondary-fallback-model")
                return schema.model_validate_json(fallback_response)
            except Exception as final_error:
                print(f"[CRITICAL] All model tiers failed: {final_error}")
                
                # Step 3: Hard deterministic fallback to protect application execution
                return schema(task_id="FALLBACK-SYSTEM", priority=1, assigned_role="RECOVERY_DAEMON")
```

---

## Production Resiliency Patterns

### Schema Self-Correction Loops
When a Pydantic validation error occurs, do not immediately fail or route to a secondary model. Instead, construct a reflection prompt containing the original prompt, the malformed JSON output, and the detailed error message returned by `ValidationError.errors()`. Dispatched to the model, this structured payload allows the engine to analyze its own mistake and generate a corrected JSON schema.

### Active/Passive Model Tiering
Always deploy a tiered pricing-and-capability architecture. Route highly complex, creative reasoning tasks to frontier models. For structured formatting, code parsing, or utility routing, use smaller, fine-tuned SLMs (Small Language Models) that are less susceptible to creative format drift.
