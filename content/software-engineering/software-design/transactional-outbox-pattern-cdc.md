---
title: "The Transactional Outbox Pattern: Solving Dual-Writes with CDC"
description: "Why writing to a database and publishing to a message broker can never be atomic without an outbox table, and how Change Data Capture with Debezium turns that table into a reliable event stream."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "outbox-pattern"
  - "change-data-capture"
  - "debezium"
  - "kafka"
  - "distributed-systems"
  - "event-driven-architecture"
---

# The Transactional Outbox Pattern: Solving Dual-Writes with CDC

## The Problem: The Dual-Write Dilemma

A common requirement in distributed systems is: when something happens in one service, save it to that service's database *and* tell every other interested service about it via a message broker. For example, when an order is placed, `OrderService` must save the order to PostgreSQL *and* publish an `OrderCreated` event to Kafka.

This is the **dual-write problem**, and there's no way to make it atomic with two independent systems:

1. **Write to the database, then publish to Kafka.** If the process crashes between the two steps, the order exists but no downstream service is ever notified.
2. **Publish to Kafka, then write to the database.** If the database write subsequently fails (a constraint violation, a deadlock), the event has already gone out to consumers describing an order that doesn't actually exist.

A standard ACID transaction can't span a relational database and a message broker. Two-Phase Commit (2PC) technically could, but it's slow, blocking, and most modern brokers (Kafka included) don't support the XA protocol it requires.

## The Mental Model: The Database as the Single Source of Intent

The fix is to stop trying to make two separate systems commit atomically, and instead make the *intent to publish* itself part of the same local database transaction as the domain write.

Instead of writing to the database and then separately calling out to Kafka over the network, the application writes to the database *twice*, in the same transaction: once for the actual domain data, once into a dedicated **outbox table** recording "this event needs to be published." Because both writes target the same database and the same transaction, they either both commit or both roll back — there's no window where one happened and the other didn't. A separate background process then reliably forwards outbox rows to the broker.

## The Solution: Transactional Outbox + Change Data Capture

```text
+----------------+          +-------------+          +-----------+          +--------+
| Order Service  |          | PostgreSQL  |          | Debezium  |          | Kafka  |
+-------+--------+          +------+------+          +-----+-----+          +---+----+
        |                          |                       |                    |
        | 1. BEGIN TRANSACTION     |                       |                    |
        |------------------------->|                       |                    |
        | 2. INSERT INTO orders    |                       |                    |
        |------------------------->|                       |                    |
        | 3. INSERT INTO outbox    |                       |                    |
        |------------------------->|                       |                    |
        | 4. COMMIT                |                       |                    |
        |------------------------->|                       |                    |
        |                          | 5. WAL / binlog stream|                    |
        |                          |---------------------->|                    |
        |                          |                       | 6. Publish event   |
        |                          |                       |------------------->|
        |                          | 7. Ack processed      |                    |
        |                          |<----------------------|                    |
```

### 1. The Outbox Table

```sql
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY,
    aggregate_type VARCHAR(255) NOT NULL,
    aggregate_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Saving an order becomes one atomic transaction:

```sql
BEGIN;
INSERT INTO orders (id, user_id, amount) VALUES ('order-123', 'user-456', 100.00);
INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload)
VALUES ('uuid-1', 'Order', 'order-123', 'OrderCreated', '{"id":"order-123", "amount":100}');
COMMIT;
```

If the transaction commits, both rows exist. If it rolls back for any reason — including a constraint violation on the `orders` insert — neither row exists. There's no state where the order exists but the outbox event doesn't, or vice versa.

### 2. Change Data Capture with Debezium

You *could* have a polling worker run `SELECT * FROM outbox_events WHERE processed = false` on a timer, but polling adds latency and unnecessary read load on the primary database.

**Change Data Capture (CDC)**, using a tool like **Debezium**, solves this without polling. Debezium runs as a Kafka Connect source connector and tails the database's transaction log directly (PostgreSQL's WAL, MySQL's binlog) rather than querying tables. The moment Debezium sees an `INSERT` into `outbox_events` land in the transaction log, it captures that row and publishes it to a Kafka topic — with latency measured in milliseconds, and zero extra query load on the database.

## Architectural Trade-offs and Considerations

- **At-least-once delivery.** If Debezium crashes after publishing to Kafka but before committing its own log offset, it may re-publish the same outbox row on restart. This means **every downstream consumer must be idempotent** — tracking processed event IDs (the outbox row's `id`) so a duplicate delivery is a safe no-op.
- **Outbox table growth.** The table grows without bound unless you clean it up. Since Debezium reads from the WAL rather than the table itself, it's safe to aggressively delete rows shortly after insertion, or use time-based partitioning and drop old partitions daily.
- **Eventual consistency.** There's a small lag — typically milliseconds — between the database commit and the event landing in Kafka. Consumers, and any UX depending on "has this event propagated yet," need to account for that gap.

## Common Misconceptions

**Misconception:** "The outbox pattern guarantees exactly-once delivery."
**Reality:** It guarantees at-least-once delivery of every committed event — no event is ever silently lost — but a crash-and-restart in the CDC pipeline can cause a duplicate. Idempotent consumers are not optional; they're what makes at-least-once behave like exactly-once from the consumer's point of view.

**Misconception:** "You could just publish to Kafka inside the same database transaction instead."
**Reality:** Kafka doesn't participate in your database's transaction manager — there's no way to make "commit the SQL transaction" and "publish to Kafka" a single atomic unit without 2PC, which Kafka doesn't support and which is impractical even where it is supported. The outbox table exists specifically because it lives inside the database transaction that Kafka cannot.

## Key Takeaways

- The dual-write problem exists because a database commit and a broker publish can never be made atomic across two separate systems using ordinary transactions.
- The outbox pattern sidesteps this by writing the "intent to publish" into the same local transaction as the domain data, guaranteeing both happen or neither does.
- CDC tools like Debezium read the transaction log directly instead of polling, giving low-latency, low-overhead forwarding from the outbox table to the broker.
- At-least-once delivery is the practical guarantee — downstream consumers must be idempotent to handle the rare duplicate.

## What to Learn Next

- Idempotency keys, the technique consumers need to safely handle the at-least-once duplicates the outbox pattern can produce.
- Event Sourcing and CQRS, which extend this same "the log is the source of truth" idea into the primary data model, not just the publishing mechanism.
- The Saga pattern, which typically uses outbox-published events as the trigger for each step in a distributed, choreographed transaction.
