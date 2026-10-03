---
title: "Circuit Breaker Pattern: State Machine and Fallbacks"
description: "How the Circuit Breaker pattern stops cascading failures by tripping between Closed, Open, and Half-Open states, with a sliding-window Python implementation and guidance on fallback logic and telemetry."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "circuit-breaker"
  - "resilience-engineering"
  - "cascading-failures"
  - "fault-tolerance"
  - "distributed-systems"
---

# Circuit Breaker Pattern: State Machine and Fallbacks

## The Problem: Cascading System Failures

In a distributed architecture, services rely on downstream dependencies (databases, external APIs, other microservices). When a downstream dependency degrades — becoming slow or unresponsive — the calling service can quickly exhaust its own resources (connection pools, worker threads) waiting for timeouts.

Worse, continuous retry attempts by the caller act as an inadvertent DDoS attack, preventing the struggling downstream service from ever recovering. This leads to cascading failures across the entire system.

The **Circuit Breaker** pattern, popularized by Michael Nygard, prevents this by functioning identically to an electrical circuit breaker: it detects anomalous failure rates and "trips," immediately halting requests to the failing service and failing fast.

## State Machine Mechanics

A Circuit Breaker operates as a state machine with three distinct states:

1. **CLOSED (Healthy):** The circuit is intact. Requests flow freely to the downstream service. The breaker monitors the responses (successes, failures, timeouts).
2. **OPEN (Tripped):** The failure threshold has been breached. The circuit is broken. All requests fail instantly without attempting network I/O, protecting both the caller and the callee.
3. **HALF-OPEN (Testing):** After a configurable timeout, the breaker tentatively allows a limited number of test requests through. If they succeed, the breaker resets to CLOSED. If they fail, it trips back to OPEN.

## ASCII Architecture: State Transitions

```text
               (Success Threshold Reached)
               ┌────────────────────────┐
               │                        │
               ▼                        │
         ┌────────────┐          ┌────────────┐
         │            │          │            │
 ┌──────▶│   CLOSED   │          │ HALF-OPEN  │◀──────┐
 │       │ (Requests  │          │ (Testing   │       │
 │       │  Allowed)  │          │  Network)  │       │
 │       └────────────┘          └────────────┘       │
 │             │                        │             │
 │             │ (Failure Threshold     │ (Test req   │
 │             │  Breached)             │  failed)    │
 │             ▼                        │             │
 │       ┌────────────┐                 │             │
 │       │            │                 │             │
 │       │    OPEN    │◀────────────────┘             │
 │       │ (Requests  │                               │
 │       │  Rejected) │                               │
 │       └────────────┘                               │
 │             │                                      │
 │             │ (Timeout Expired - Retry scheduled)  │
 └─────────────┴──────────────────────────────────────┘
```

## Implementation: The Sliding Window

Modern circuit breakers use a sliding window (time-based or count-based) to track error rates. Below is a simplified conceptual implementation in Python.

```python
import time
from enum import Enum
from typing import Callable, Any

class State(Enum):
    CLOSED = 1
    OPEN = 2
    HALF_OPEN = 3

class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, reset_timeout: int = 10):
        self.state = State.CLOSED
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout

        self.failure_count = 0
        self.last_failure_time = 0

    def call(self, func: Callable, *args, **kwargs) -> Any:
        if self.state == State.OPEN:
            if time.time() - self.last_failure_time > self.reset_timeout:
                # Timeout expired, transition to HALF-OPEN to test
                self.state = State.HALF_OPEN
            else:
                # Fast fail, protect the network
                raise Exception("Circuit Breaker OPEN: Request blocked")

        try:
            # Attempt the network call
            result = func(*args, **kwargs)

            # If we are testing and it succeeds, reset the breaker
            if self.state == State.HALF_OPEN:
                self.reset()

            return result

        except Exception as e:
            self._record_failure()
            raise e

    def _record_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()

        # If threshold reached, trip the breaker
        if self.state == State.CLOSED and self.failure_count >= self.failure_threshold:
            self.state = State.OPEN

        # If a test request failed in HALF-OPEN, trip back immediately
        elif self.state == State.HALF_OPEN:
            self.state = State.OPEN

    def reset(self):
        self.state = State.CLOSED
        self.failure_count = 0
```

## Fallbacks and Metrics

Failing fast is only half the battle. A robust circuit breaker implementation must include:

1. **Fallback Logic:** When the breaker is OPEN, the application should degrade gracefully. Instead of returning an error, it might return a cached response, a default value, or an empty list.
2. **Telemetry Exfiltration:** Breaker state transitions are critical infrastructure events. Breakers must emit metrics (e.g., to Prometheus). Spikes in `circuit_breaker_open_total` alert operators to downstream outages before users notice degraded latency.

By implementing explicit circuit breaking, systems enforce physical boundaries between services, preventing local resource starvation from triggering widespread cluster outages.
