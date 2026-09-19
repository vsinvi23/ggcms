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

## 3. Key Takeaways

1. **Avoid Dual Writes**: Never send network calls to external message queues directly inside application database transaction handlers.
2. **Use Transactional Outbox Pattern**: Write business entity changes and outbox event records into PostgreSQL within a single atomic database transaction.
3. **Design Consumers to Be Idempotent**: Network retries can result in duplicate event delivery; track processed event IDs in downstream consumers.
