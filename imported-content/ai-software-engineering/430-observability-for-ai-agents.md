# Observability for AI Agents: Logs, Traces, Decisions, and Actions

## The Cognitive Black Box

In conventional microservice architectures, observability is a solved problem. Systems like OpenTelemetry collect CPU utilization, memory pressure, HTTP status codes, and database query latency. If a request fails, engineers trace the distributed system call tree using standard correlation IDs to isolate the slow or failing endpoint.

AI agent architectures break this traditional observability model. When an agent experiences performance degradation or misroutes a task, traditional infrastructure metrics show normal CPU levels and HTTP 200 responses. The actual failure occurs within the model's reasoning loop—such as choosing an inefficient tool pathway, suffering context drift, or encountering ballooning latencies from model generation tokens. 

To gain deep operational visibility, engineers must capture the internal "thinking process" of the agent. This requires extending OpenTelemetry to trace cognitive decisions, attribute cost, and track token-to-latency ratios across tool executions.

---

## Architectural Blueprint: Distributed Agent Tracing

The trace layout below illustrates how a single user request spans both probabilistic cognitive reasoning and deterministic tool actions, unified under a standard OpenTelemetry (OTel) context.

```
[User Request Trace]
 │
 ├── Span 1: orchestrator_loop (Parent Span)
 │    │
 │    ├── Span 2: llm_reasoning_turn (Child Span)
 │    │    └── Attributes: { llm.model: "gpt-4o", llm.prompt_tokens: 1420, llm.completion_tokens: 310 }
 │    │
 │    └── Span 3: execute_database_tool (Child Span)
 │         └── Attributes: { db.system: "postgresql", db.query_time_ms: 42.1 }
 │
 └── Trace Consolidated & Pushed to OTel Collector (Jaeger / Honeycomb)
```

---

## Technical Implementation: OpenTelemetry Agent Instrumentation

The Python script below demonstrates how to instrument an agent using the official OpenTelemetry SDK. It captures custom semantic conventions for LLM calls, recording prompt/completion tokens and latency metrics.

```python
import time
from typing import Dict, Any
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor, ConsoleSpanExporter

# 1. Initialize global OpenTelemetry Tracer
provider = TracerProvider()
processor = SimpleSpanProcessor(ConsoleSpanExporter())
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)
tracer = trace.get_tracer("agent-observability")

class InstrumentedAgent:
    def __init__(self, model_name: str):
        self.model_name = model_name

    def _call_model_api(self, prompt: str) -> Dict[str, Any]:
        """Simulates an API call to a frontier model, returning token metadata."""
        time.sleep(0.15)  # Simulate network request latency
        return {
            "text": "Decision: Fetch client balance using 'fetch_balance_tool'.",
            "prompt_tokens": 850,
            "completion_tokens": 120
        }

    def run_workflow(self, user_query: str):
        # Step 1: Instrument the parent orchestrator span
        with tracer.start_as_current_span("orchestrator_loop") as parent_span:
            parent_span.set_attribute("agent.query", user_query)
            
            # Step 2: Instrument the cognitive reasoning step
            with tracer.start_as_current_span("llm_reasoning_turn") as llm_span:
                llm_span.set_attribute("llm.model", self.model_name)
                
                start_time = time.time()
                response = self._call_model_api(user_query)
                latency = time.time() - start_time
                
                # Capture standard semantic conventions for LLM tracing
                llm_span.set_attribute("llm.prompt_tokens", response["prompt_tokens"])
                llm_span.set_attribute("llm.completion_tokens", response["completion_tokens"])
                llm_span.set_attribute("llm.latency_seconds", latency)
                
                decision = response["text"]
                llm_span.add_event("cognitive_decision_made", {"decision": decision})

            # Step 3: Instrument the deterministic tool execution step
            with tracer.start_as_current_span("execute_database_tool") as tool_span:
                tool_span.set_attribute("tool.name", "fetch_balance_tool")
                
                # Simulate tool execution and database query latency
                time.sleep(0.05)
                tool_span.set_attribute("tool.status", "success")
                tool_span.set_attribute("db.rows_returned", 1)

            parent_span.add_event("workflow_completed_successfully")

if __name__ == "__main__":
    agent = InstrumentedAgent(model_name="gpt-4o-mini")
    agent.run_workflow("Check account status for customer 1058")
```

---

## Observability Best Practices in Production

### Token Usage and Cost Attribution
In multi-tenant SaaS environments, tracking model tokens isn't just for debug logs; it is critical for unit economics. Always inject tenant IDs or client organization parameters into the OpenTelemetry context. Configure your APM dashboard to aggregate these context spans to calculate cost per customer, helping detect outlier accounts running high-frequency loops.

### Context-to-Log Bindings
While traces capture latency and performance, logs capture raw inputs and outputs. Never log raw prompts directly inside your OTel span attributes, as this can degrade performance and exceed payload limits. Instead, log raw prompts to secure object storage, and include the generated `SpanID` and `TraceID` in the log metadata to allow seamless correlation.
