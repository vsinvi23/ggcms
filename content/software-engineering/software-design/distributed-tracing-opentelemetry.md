---
title: "Distributed Tracing with OpenTelemetry: Context Propagation Across Microservices"
description: "How Trace IDs and Span IDs let you reconstruct a single request's journey across microservices, how W3C traceparent headers propagate context over the network, and how to instrument a Python service with the OpenTelemetry SDK."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "distributed-tracing"
  - "opentelemetry"
  - "observability"
  - "microservices"
  - "context-propagation"
---

# Distributed Tracing with OpenTelemetry: Context Propagation Across Microservices

## The Problem: The Microservice Murder Mystery

In a monolith, debugging a slow or failed request is straightforward — open the log file and follow one thread of execution top to bottom. In a microservices architecture, a single user action can fan out across many independent services: a "Checkout" click might hit the API Gateway, which calls the Order Service, which publishes to Kafka, which is consumed by both the Inventory Service and the Billing Service.

If checkout takes 5 seconds, which of those components was the bottleneck? If it fails, whose logs do you check first? Correlating by timestamp across five separate log dashboards is a needle-in-a-haystack exercise that doesn't scale.

## The Mental Model: The Package Tracking Number

A physical package moving through a shipping network gets a barcode — a globally unique tracking number — attached before it leaves the first facility. Every warehouse, truck, and delivery point scans that same barcode and records a timestamp. Distributed tracing does exactly this for a request: a "tracking number" is generated at the edge of the system, and every downstream service is required to pass it along to the next.

## Trace IDs, Span IDs, and Context Propagation

A **Trace** represents the entire journey of one request across the distributed system. A **Span** represents one logical unit of work inside that trace — a single database query, a single HTTP call to a downstream service.

- **Trace ID** — a globally unique identifier (typically a UUID) generated at the very start of the request, usually at the edge (API Gateway).
- **Span ID** — a unique identifier for one specific operation. Each span records a `Parent Span ID`, letting the tracing backend reconstruct the full execution tree.

For tracing to work, the Trace ID has to travel from service to service — **context propagation**, typically carried in HTTP headers using the W3C `traceparent` standard.

```text
Client                Gateway                 Order Service              DB
  |                       |                          |                    |
  |--- POST /checkout --->|                          |                    |
  |                       | Trace ID: 1234            |                    |
  |                       | Span A1 (root)            |                    |
  |                       |---- POST /orders -------->|                    |
  |                       |     header: traceparent=1234-A1                |
  |                       |                          | reads Trace 1234    |
  |                       |                          | Span B2 (parent A1) |
  |                       |                          |----- INSERT ------->|
  |                       |                          |   header: traceparent=1234-B2
  |                       |                          |                    | Span C3 (parent B2)
```

The result is a tree: `A1 -> B2 -> C3`, where every span records its own start time, duration, and outcome, tied together by the shared Trace ID.

## OpenTelemetry and Jaeger

Historically every tracing vendor (Zipkin, Datadog, New Relic) had its own proprietary SDK. **OpenTelemetry (OTel)** is now the vendor-neutral industry standard: a common set of APIs, SDKs, and collector agents. Instead of writing custom header-passing code by hand, you instrument your application with the OTel SDK — it intercepts incoming requests, extracts the Trace ID, injects it into outbound calls, and asynchronously exports span data to a collector.

**Jaeger** is a popular open-source UI for visualizing this data. Once Jaeger assembles spans by Trace ID and Parent Span ID, it renders a Gantt chart — visually showing that a 5-second checkout spent 4.8 of those seconds waiting on a single slow `SELECT` deep inside the Inventory Service.

### Instrumenting a Python Service with OpenTelemetry

```python
"""
Minimal OpenTelemetry instrumentation for a Flask-style order service,
exporting spans to a local Jaeger/OTel collector via OTLP.
"""
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.propagate import inject
import requests

# 1. Configure the tracer provider and exporter once, at startup
provider = TracerProvider()
exporter = OTLPSpanExporter(endpoint="http://otel-collector:4317", insecure=True)
provider.add_span_processor(BatchSpanProcessor(exporter))
trace.set_tracer_provider(provider)

# 2. Auto-instrument outbound `requests` calls so traceparent is
#    injected into every outbound HTTP call automatically
RequestsInstrumentor().instrument()

tracer = trace.get_tracer("order-service")


def create_order(customer_id: str, sku: str, quantity: int) -> str:
    # 3. Wrap the unit of work in a span — this becomes a node in the trace tree
    with tracer.start_as_current_span("create_order") as span:
        span.set_attribute("customer.id", customer_id)
        span.set_attribute("order.sku", sku)
        span.set_attribute("order.quantity", quantity)

        order_id = _insert_order_row(customer_id, sku, quantity)
        span.set_attribute("order.id", order_id)

        # traceparent is injected automatically into this call's headers
        # by RequestsInstrumentor, propagating the same trace forward
        response = requests.post(
            "http://inventory-service/reserve",
            json={"order_id": order_id, "sku": sku, "quantity": quantity},
        )
        if response.status_code != 200:
            span.set_status(trace.StatusCode.ERROR, "inventory reservation failed")
            span.record_exception(RuntimeError(response.text))

        return order_id


def _insert_order_row(customer_id: str, sku: str, quantity: int) -> str:
    # A child span for the database call itself, so slow queries show up
    # as their own bar in the Jaeger Gantt chart
    with tracer.start_as_current_span("db.insert_order") as db_span:
        db_span.set_attribute("db.system", "postgresql")
        db_span.set_attribute("db.statement", "INSERT INTO orders ...")
        # ... actual DB call ...
        return "ord-12345"
```

The key detail: `RequestsInstrumentor` and the OTel propagator handle reading and writing the `traceparent` header automatically. The application code never manually threads a trace ID through function signatures — it rides along in the current OTel context.

## Architectural Trade-offs

- **Performance overhead.** Generating IDs, tracking context, and exporting span data costs CPU and bandwidth. At very high request volume, configure **sampling** (e.g., trace only 1% of requests) to bound this cost.
- **Leaky abstraction.** Context propagation requires every hop to cooperate. If one legacy service in the chain drops the `traceparent` header, the trace breaks in two, and the Gantt chart shows two disconnected fragments instead of one continuous request.
- **Log correlation.** The real payoff comes from injecting the Trace ID into standard application logs (e.g., via Python's `logging` filters or Java's Log4j MDC). That lets you jump directly from a visual trace in Jaeger to the exact log lines in your log aggregator that occurred during that specific request.

## Key Takeaways

- A Trace ID identifies one request's full journey; a Span ID identifies one unit of work within it, linked to its parent to form an execution tree.
- Context propagation (the W3C `traceparent` header) is what lets independent services contribute spans to the same trace without a shared memory space.
- OpenTelemetry is the vendor-neutral standard SDK for this instrumentation; Jaeger (or an equivalent backend) assembles and visualizes the resulting span tree as a Gantt chart.
- Tracing overhead is real at scale — use sampling — and the whole system depends on every hop in the chain propagating the header correctly.
