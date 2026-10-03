---
title: "The Saga Pattern: Choreographing Distributed Transactions with Events"
description: "How to replace impossible cross-database ACID transactions with a sequence of local transactions and compensating events, using Kafka choreography instead of a central orchestrator."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "saga-pattern"
  - "choreography"
  - "distributed-transactions"
  - "kafka"
  - "microservices"
  - "eventual-consistency"
---

# The Saga Pattern: Choreographing Distributed Transactions with Events

## The Problem: The Distributed Transaction

In a monolith backed by a single relational database, consistency is easy — wrap the operations in `BEGIN ... COMMIT`. If a user places an order, deduct inventory and charge their card inside one transaction block. If the charge fails, `ROLLBACK` undoes everything, inventory included, automatically.

In a microservices architecture, that mechanism simply doesn't exist. `OrderService` might use PostgreSQL, `InventoryService` MongoDB, and `PaymentService` an external gateway like Stripe. There is no single database to issue a `ROLLBACK` against. If inventory gets deducted and the payment fails 500ms later, how do you undo the deduction? Distributed transaction protocols like Two-Phase Commit (2PC) technically address this, but they're slow, hold aggressive locks across every participating database, and fall apart entirely if one participant is briefly unreachable.

## The Mental Model: The Saga Pattern

A **Saga** is a sequence of local transactions. Each local transaction commits within a single service's own database and publishes an event that triggers the next step. If a step fails a business rule (insufficient funds, out of stock), the saga runs a series of **compensating transactions** that undo the effects of the steps that already succeeded.

Think of booking a vacation:

```
1. Book Flight    (Success)
2. Book Hotel     (Success)
3. Book Rental Car (Fails!)
4. *Cancel Hotel*  (compensating action)
5. *Cancel Flight* (compensating action)
```

There are two ways to coordinate a saga: **Orchestration** (a central controller directs every step) and **Choreography** (services react to each other's events with no central brain). This article focuses on Choreography.

## Choreography via an Event Broker (Kafka)

In choreography, there's no orchestrator. Each service publishes domain events to a broker; other services subscribe to the events they care about, do their own local work, and publish new events in turn.

```text
[ Order Service ]             [ Inventory Service ]             [ Payment Service ]
        |                              |                                |
  1. Create Order                      |                                |
  (Status: PENDING)                    |                                |
        |-----(OrderCreatedEvent)----->|                                |
        |                              | 2. Deduct Inventory            |
        |                              |                                |
        |                              |-----(InventoryReservedEvent)-->|
        |                              |                                | 3. Charge Card
        |                              |                                |    (FAILS!)
        |                              |<----(PaymentFailedEvent)-------|
        |                              |                                |
        |                        4. Restore Inventory                   |
        |                           (Compensating Tx)                   |
        |<----(InventoryRestoredEvent)-|                                |
        |                              |                                |
  5. Mark Order                        |                                |
     as CANCELLED                      |                                |
```

`OrderService` never calls `InventoryService` or `PaymentService` directly, and neither of them calls `OrderService` back directly — every step communicates purely by publishing and subscribing to events on the broker.

## Implementation: Designing the Handlers

Every service in a choreographed saga acts like a small state machine reacting to the specific events it subscribes to. Here's `InventoryService` in TypeScript:

```typescript
// Inside Inventory Service
class InventorySagaHandler {
    constructor(private db: InventoryDatabase, private kafka: KafkaProducer) {}

    // Forward action — triggered when an order is created.
    async onOrderCreated(event: OrderCreatedEvent) {
        try {
            // Local ACID transaction, scoped to this service's own database.
            await this.db.reserveStock(event.productId, event.quantity);

            // Publish success so the next step (Payment) can proceed.
            await this.kafka.publish('InventoryReserved', {
                orderId: event.orderId,
                amount: event.totalPrice
            });
        } catch (error) {
            // E.g. out of stock — fail the saga at this step.
            await this.kafka.publish('InventoryReservationFailed', {
                orderId: event.orderId, reason: "OUT_OF_STOCK"
            });
        }
    }

    // Compensating action — triggered when a later step in the saga failed.
    async onPaymentFailed(event: PaymentFailedEvent) {
        // Undo the earlier local transaction.
        await this.db.restoreStock(event.productId, event.quantity);

        // Let OrderService know this step has been compensated.
        await this.kafka.publish('InventoryRestored', {
            orderId: event.orderId
        });
    }
}
```

Notice that `InventoryService` reacts to `PaymentFailedEvent` even though it has never called `PaymentService` — it simply subscribes to that event and knows what to undo when it sees it.

## The Catch: Designing for Failure

Choreography scales beautifully because it's fully asynchronous and decoupled — `OrderService` doesn't even need to know `InventoryService` exists, only that some service reacts to `OrderCreatedEvent`. That decoupling comes with real complexity, though.

### 1. Idempotency is mandatory

Kafka guarantees **at-least-once** delivery, which means `InventoryService` might receive the same `PaymentFailedEvent` twice. Compensating logic must be idempotent — running `restoreStock` twice for the same order must not restore double the inventory. In practice, this means tracking processed `eventId`s in a database table with a unique constraint, so a duplicate delivery is a safe no-op.

### 2. Eventual consistency

While the saga runs, the system sits in an eventually consistent state. If a user queries `OrderService` right after step 2 above, the order shows as successful even though payment hasn't been attempted yet. Your UI has to model and display "Pending"/"Processing" states honestly rather than assuming success the moment the first step commits.

### 3. Observability

With no central orchestrator, a stuck saga is genuinely hard to debug. If an order sits stuck in "Pending," you have to trace its `orderId` across every service's Kafka logs to figure out which handler silently threw and never published the expected next event. Distributed tracing (Jaeger, Datadog, or similar) that propagates a correlation ID through every event isn't optional here — it's the only way to reconstruct what happened.

## Common Misconceptions

**Misconception:** "Choreography is simpler than orchestration because there's no central coordinator to build."
**Reality:** Choreography trades coordinator complexity for debugging complexity. Business logic ends up scattered across every service's event handlers instead of visible in one place, which is exactly what makes tracing a stuck saga hard — there's no single log to read.

**Misconception:** "At-least-once delivery is Kafka's fault; a 'better' broker would fix this."
**Reality:** At-least-once (rather than exactly-once) is a fundamental trade-off in distributed messaging, not a Kafka limitation — building idempotent handlers is the correct fix regardless of broker choice.

## Key Takeaways

- A saga replaces one impossible cross-database ACID transaction with a sequence of local transactions, each committed within a single service and compensated explicitly if a later step fails.
- Choreography coordinates a saga purely through published/subscribed events, with no central controller — high decoupling, but scattered business logic.
- At-least-once event delivery makes idempotent compensating handlers mandatory, not optional.
- Distributed tracing across every event in the saga is required infrastructure, not a nice-to-have, because there's no single place to read "what happened to this order."

## What to Learn Next

- Orchestrated sagas, which centralize the step sequence in a coordinator instead of scattering it across event handlers — useful when observability matters more than decoupling.
- Writing idempotent and commutative compensating transactions, the mathematical properties that make saga rollbacks safe under retries and out-of-order delivery.
- The Transactional Outbox pattern, which most saga steps rely on internally to guarantee their own database write and event publish happen atomically.
