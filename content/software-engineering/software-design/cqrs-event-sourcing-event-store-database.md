---
title: "CQRS Architecture: Building an Event Store Database"
description: "How the read/write impedance mismatch in traditional CRUD systems leads teams to CQRS and event sourcing, with a PostgreSQL event store schema, aggregate rehydration, and projection code."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "DEEP_DIVE"
tags:
  - "cqrs"
  - "event-sourcing"
  - "event-store"
  - "postgresql"
  - "optimistic-concurrency-control"
---

# CQRS Architecture: Building an Event Store Database

## The Problem: The Read/Write Impedance Mismatch

In traditional CRUD (Create, Read, Update, Delete) architectures, the same data model is used for both updating the state of the system and querying it. As an application scales, this introduces a severe impedance mismatch:

1. **Write constraints**: Business logic requires strict normalization and complex joins to enforce invariants and prevent concurrent mutation conflicts.
2. **Read constraints**: User interfaces require fast, denormalized, flattened data views.

When you attempt to satisfy both with a single database schema, you end up with a compromised architecture. Write performance degrades due to massive, index-heavy tables, and read performance suffers due to complex, multi-table `JOIN` operations.

## The Mental Model: CQRS and Event Sourcing

Command Query Responsibility Segregation (CQRS) solves this by strictly splitting the system into two distinct paths:

- **The Command Side**: Handles writes. It processes intents, validates business rules, and saves state.
- **The Query Side**: Handles reads. It returns highly optimized, denormalized data directly to the client.

When paired with **Event Sourcing**, the Command side doesn't store the *current* state of an entity. Instead, it stores an immutable, append-only log of *events* (things that happened). The Query side asynchronously listens to these events and builds "Projections" (read-optimized views).

### Visualizing the Data Flow

```text
   [ Client API ]
        |  (1) Issue Command (e.g. CreateOrder)
        v
  +-----------------+                       +---------------------+
  | Command Handler | --(2) Append Event--> |    Event Store       |
  +-----------------+                       +----------+-----------+
                                                        |
                                              (3) Publish Event
                                                        v
                                             +----------------------+
                                             |   Event Projector    |
                                             +----------+-----------+
                                                        |
                                              (4) Update Projection
                                                        v
                                             +----------------------+
                                             | Read DB / Cache      |
                                             +----------+-----------+
                                                        |
                                              (5) Fast Read
                                                        v
                                             +----------------------+
                                             |   Query Handler       |
                                             +----------+-----------+
                                                        |
                                              (6) Return DTO
                                                        v
                                             [ Client API ]
```

## Designing the Event Store

An Event Store database is fundamentally different from a relational database. It is an append-only log. Updates and deletes are mathematically impossible by design.

A simple Event Store schema in PostgreSQL looks like this:

```sql
CREATE TABLE event_store (
    sequence_id BIGSERIAL PRIMARY KEY,
    stream_id UUID NOT NULL,
    stream_type VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_version INT NOT NULL,
    payload JSONB NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (stream_id, event_version)
);

CREATE INDEX idx_stream ON event_store (stream_id);
```

*The `UNIQUE (stream_id, event_version)` constraint acts as our Optimistic Concurrency Control. If two threads try to append version `5` simultaneously, one will fail.*

### Appending Events (The Write Path)

In code, a Command Handler reconstructs the aggregate's current state by replaying its historical events in memory, applies the new business logic, and appends the resulting events back to the store.

```typescript
class OrderAggregate {
    private id: string;
    private status: string;

    // 1. Rehydrate state from history
    loadFromHistory(events: DomainEvent[]) {
        for (const event of events) {
            this.apply(event);
        }
    }

    private apply(event: DomainEvent) {
        if (event.type === 'OrderCreated') {
            this.id = event.payload.id;
            this.status = 'PENDING';
        } else if (event.type === 'OrderShipped') {
            this.status = 'SHIPPED';
        }
    }

    // 2. Process Command
    shipOrder() {
        if (this.status !== 'PENDING') throw new Error("Invalid state");
        // Yield new event
        return {
            type: 'OrderShipped',
            payload: { id: this.id, timestamp: Date.now() }
        };
    }
}
```

### Projections (The Read Path)

Once an event is appended, a background worker (Projector) picks it up. The projector's only job is to translate the event into a format optimized for the UI. For instance, updating a MongoDB document or an Elasticsearch index.

```typescript
async function onOrderShipped(event: Event) {
    const orderId = event.payload.id;

    // Update a highly denormalized read model
    await mongoDb.collection('OrderReadModels').updateOne(
        { _id: orderId },
        {
            $set: {
                status: 'Shipped',
                shippedAt: event.payload.timestamp
            }
        }
    );
}
```

## Managing Complexity and Scaling

While CQRS and Event Sourcing solve read/write contention and provide a perfect audit trail, they introduce **eventual consistency**. When a user submits a command, the read model will not be updated instantly. The UI must be designed to accommodate this (e.g., using optimistic UI updates or long polling).

Additionally, as event streams grow infinitely, rehydrating aggregates can become slow. This is solved via **Snapshots**—periodically saving a flattened version of the aggregate state every $N$ events, allowing the system to replay only the events that occurred after the snapshot.

## Conclusion

CQRS and Event Sourcing fundamentally shift system design from state-centric models to behavior-centric logs. By decoupling the write constraints of business invariants from the read constraints of user interfaces, engineers can scale both layers independently, resulting in highly resilient and exceptionally fast distributed systems.
