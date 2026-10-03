---
title: "Data Modeling for Event-Driven Systems & Transactional Outbox Pattern"
description: "A practical guide to designing resilient event-driven architectures, event sourcing, CQRS, and implementing the Transactional Outbox Pattern with PostgreSQL."
type: "ARTICLE"
categorySlug: "data-engineering"
articleType: "GUIDE"
tags:
  - "data-modeling"
---

# Data Modeling for Event-Driven Systems & Transactional Outbox Pattern

In microservice architectures, updating a relational database and publishing an event to a message broker (such as NATS or Apache Kafka) inside an HTTP request handler creates a **dual-write problem**. If the database commit succeeds but the network call to the message broker fails, system states become permanently desynchronized.

This guide explores **Event Sourcing**, **CQRS**, and the **Transactional Outbox Pattern** using PostgreSQL.

---

## 1. The Dual-Write Problem & Transactional Outbox Architecture

```text
 ┌──────────────────────────┐
 │ Web Request / API        │
 └─────────────┬────────────┘
               │ 1. Begin Database Transaction
               ▼
 ┌──────────────────────────────────────────────────────────┐
 │ PostgreSQL Database                                      │
 │                                                          │
 │  ┌──────────────────────┐      ┌──────────────────────┐  │
 │  │ Business Table       │      │ Outbox Events Table  │  │
 │  │ (e.g. articles)      │      │ (id, event_type,     │  │
 │  │ INSERT INTO articles │      │  payload, status)    │  │
 │  └──────────────────────┘      └──────────────────────┘  │
 │                                                          │
 │ 2. COMMIT TRANSACTION (Atomic DB Write)                  │
 └─────────────────────────────┬────────────────────────────┘
                               │
                               │ 3. Outbox Publisher Poller / Debezium CDC
                               ▼
 ┌──────────────────────────────────────────────────────────┐
 │ Message Broker (Apache Kafka / NATS JetStream)           │
 └──────────────────────────────────────────────────────────┘
```

---

## 2. PostgreSQL Outbox Table Schema & Go Publisher

```sql
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, PUBLISHED
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX idx_outbox_pending ON outbox_events (created_at) WHERE status = 'PENDING';
```

### Go Outbox Poller Worker

```go
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"time"
)

type OutboxEvent struct {
	ID            string          `json:"id"`
	AggregateType string          `json:"aggregate_type"`
	AggregateID   string          `json:"aggregate_id"`
	EventType     string          `json:"event_type"`
	Payload       json.RawMessage `json:"payload"`
}

func PollOutbox(ctx context.Context, db *sql.DB) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			rows, err := db.QueryContext(ctx, `
				SELECT id, aggregate_type, aggregate_id, event_type, payload
				FROM outbox_events
				WHERE status = 'PENDING'
				ORDER BY created_at ASC
				LIMIT 50
				FOR UPDATE SKIP LOCKED;
			`)
			if err != nil {
				log.Printf("Outbox poll error: %v", err)
				continue
			}

			for rows.Next() {
				var evt OutboxEvent
				if err := rows.Scan(&evt.ID, &evt.AggregateType, &evt.AggregateID, &evt.EventType, &evt.Payload); err != nil {
					continue
				}

				// Publish to broker (NATS / Kafka)
				log.Printf("Publishing event [%s] to broker...", evt.EventType)

				// Mark as PUBLISHED inside transaction
				db.ExecContext(ctx, "UPDATE outbox_events SET status = 'PUBLISHED', processed_at = NOW() WHERE id = $1", evt.ID)
			}
			rows.Close()
		}
	}
}
```

---

## 3. The Scenario: Why `FOR UPDATE SKIP LOCKED` Isn't Optional

### The Problem With Naive Polling at Scale

If two instances of the outbox poller worker run simultaneously (which is normal — you'd run several for availability), a naive `SELECT ... WHERE status = 'PENDING'` without locking lets BOTH workers read and publish the same event twice, because neither knows the other already claimed those rows.

```text
  Without SKIP LOCKED (the race condition):
  ──────────────────────────────────────────
  Worker A: SELECT 50 pending rows ─────────► rows 1-50
  Worker B: SELECT 50 pending rows ─────────► rows 1-50 (SAME rows — no lock yet!)
  Worker A: publishes rows 1-50 to Kafka
  Worker B: publishes rows 1-50 to Kafka  ──► DUPLICATE events on the broker

  With FOR UPDATE SKIP LOCKED:
  ──────────────────────────────────────────
  Worker A: SELECT ... FOR UPDATE SKIP LOCKED ──► locks & claims rows 1-50
  Worker B: SELECT ... FOR UPDATE SKIP LOCKED ──► rows 1-50 are LOCKED,
                                                    SKIPPED — Worker B gets
                                                    rows 51-100 instead
  Worker A: publishes rows 1-50
  Worker B: publishes rows 51-100  ──► no overlap, both workers stay busy
```

`SKIP LOCKED` is what makes this safe to run with multiple concurrent pollers: instead of blocking (which would serialize all pollers behind whichever one grabbed rows first) or double-processing (the naive version above), a worker that encounters already-locked rows simply skips past them and claims the next available batch.

💡 **Interactive Takeaway**: Even with `FOR UPDATE SKIP LOCKED` correctly preventing double-delivery from the outbox table itself, the guarantee `SKIP LOCKED` provides is "each row is claimed by at most one worker at a time" — not "each event is delivered to the broker exactly once." A worker can still crash AFTER publishing to Kafka but BEFORE updating `status = 'PUBLISHED'`, which is exactly why downstream consumers still need their own idempotency, covered next.

---

## 4. Event Sourcing vs. Transactional Outbox: Different Problems

It's easy to conflate these two patterns because both involve an append-only log of events, but they solve different problems:

| Pattern | What it's FOR | Source of truth |
| :--- | :--- | :--- |
| **Transactional Outbox** | Reliably PUBLISHING an event that reflects a state change that already happened in a normal CRUD table | The business table (`articles`, `orders`) — the outbox is a delivery mechanism, not the model |
| **Event Sourcing** | Making the event log ITSELF the source of truth — current state is derived by replaying all events for an aggregate, not read from a mutable row | The event log — there may be no `articles` table with a current `status` column at all; you rebuild it by folding over every event |

```text
  Transactional Outbox:                      Event Sourcing:
  ─────────────────────                      ────────────────
  articles table (current state)             order_events table (append-only)
        │                                          │
        │ UPDATE status = 'PUBLISHED'              │ INSERT OrderPlaced
        ▼                                          │ INSERT OrderShipped
  outbox_events (delivery log,                     │ INSERT OrderDelivered
  can be pruned after successful                   ▼
  publish — it's not the model)              Current state = fold(all events)
                                              (never mutated in place; the
                                               events ARE the permanent record)
```

Most systems only need the Transactional Outbox pattern — it solves the dual-write problem with a normal CRUD schema and no change to how the rest of the application reads data. Event Sourcing is a much bigger architectural commitment (every state change becomes a permanent, replayable fact) and is worth reaching for only when audit trail completeness or the ability to reconstruct historical state is a hard requirement, not a nice-to-have.

---

## 5. Idempotent Consumers: The Other Half of the Guarantee

The outbox pattern guarantees **at-least-once** delivery, not **exactly-once** — a crash between publishing to Kafka and marking a row `PUBLISHED` means that event gets republished on worker restart. Consumers must be built to tolerate this:

```go
// consumer.go — a consumer that tracks processed event IDs, making
// re-delivery of the SAME event a safe no-op instead of a double-charge,
// double-email, or double-inventory-decrement.
func HandleOrderPlacedEvent(ctx context.Context, db *sql.DB, event OutboxEvent) error {
	// INSERT ... ON CONFLICT DO NOTHING is atomic — no separate
	// check-then-insert race between concurrent consumer instances.
	res, err := db.ExecContext(ctx, `
		INSERT INTO processed_events (event_id, processed_at)
		VALUES ($1, NOW())
		ON CONFLICT (event_id) DO NOTHING
	`, event.ID)
	if err != nil {
		return err
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		// Already processed this exact event ID — skip business logic entirely
		return nil
	}

	return applyOrderPlaced(ctx, db, event)
}
```

💡 **Interactive Takeaway**: `FOR UPDATE SKIP LOCKED` prevents two POLLER workers from double-publishing the same outbox row, and idempotent consumers prevent a re-DELIVERED event from double-applying its side effects. Both protections are necessary because they guard against failures at different points in the pipeline — neither one alone is sufficient for a correct at-least-once delivery system.

---

## 6. Key Takeaways

1. **Avoid Dual Writes**: Never send network calls to external message queues directly inside application database transaction handlers.
2. **Use Transactional Outbox Pattern**: Write business entity changes and outbox event records into PostgreSQL within a single atomic database transaction.
3. **Use `FOR UPDATE SKIP LOCKED` for Multi-Worker Polling**: Without it, running more than one poller instance for availability causes duplicate event publication.
4. **Reach for Event Sourcing Only When You Need It**: It's a fundamentally different, bigger commitment than the outbox pattern — don't adopt it just because both involve an event log.
5. **Design Consumers to Be Idempotent**: Network retries and outbox worker crashes can both result in duplicate event delivery; track processed event IDs in downstream consumers with an atomic `ON CONFLICT DO NOTHING` check.
