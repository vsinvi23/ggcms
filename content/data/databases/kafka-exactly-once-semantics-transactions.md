---
title: "Apache Kafka: Achieving Exactly-Once Semantics with Idempotent Producers and Transactions"
description: "How Kafka's idempotent producer sequence numbers and the transaction coordinator's two-phase commit protocol eliminate duplicate writes in consume-transform-produce pipelines."
type: "ARTICLE"
categorySlug: "databases"
articleType: "DEEP_DIVE"
tags:
  - "kafka"
  - "exactly-once-semantics"
  - "kafka-transactions"
  - "kafka-streams"
  - "event-streaming"
---

# Apache Kafka: Achieving Exactly-Once Semantics with Idempotent Producers and Transactions

## The Problem: The Duplicate Data Dilemma

In distributed stream processing, network volatility is a guarantee. When a producer sends a message to Kafka, it expects an acknowledgment (ACK). If the network drops the ACK, the producer faces a dilemma: did the message fail to arrive, or did it arrive but the ACK failed? To avoid data loss, the producer must retry — and that retry mechanism inherently risks duplicate messages in the topic.

For use cases like updating a search index, duplicates might be harmless (idempotent operations downstream). But for financial systems processing payments or billing metrics, a duplicate message means double-charging a customer. Historically, Kafka provided "at-least-once" delivery, pushing deduplication onto the consumer. **Exactly-Once Semantics (EOS)** changes how transactional stream processing is handled.

## The Mental Model: Idempotence and Two-Phase Commits

EOS in Kafka solves two separate problems: producer idempotence (preventing duplicates on retry) and distributed transactions (ensuring atomic writes across multiple partitions).

```text
[ Producer ] ──(PID: 101, Seq: 0)──> [ Kafka Broker ]
      │      ──(PID: 101, Seq: 1)──> (Accepts Seq 1)
      │
 (Retry Seq 1) ──(PID: 101, Seq: 1)──> [ Kafka Broker ]
                                     (Rejects duplicate Seq 1)
```

For stream processing (consume-transform-produce), EOS uses a two-phase commit (2PC) protocol managed by a Transaction Coordinator to ensure offsets are committed and output messages are published atomically.

## Idempotent Producers

The foundation of EOS is the idempotent producer. Configuring a producer with `enable.idempotence=true` causes Kafka to assign it a unique **Producer ID (PID)** on initialization.

Every message sent by this producer gets a strictly increasing **sequence number**. The broker caches the highest sequence number it has successfully written for each PID-Topic-Partition combination:

- If the broker receives a message with a sequence number exactly one greater than the cached number, it accepts it.
- If it receives a sequence number less than or equal to the cached number, it recognizes a duplicate retry and silently ignores it — while still returning a success ACK to the producer.

This guarantees a message is written to the partition exactly once, even amid network timeouts and producer retries.

## Kafka Transactions

Idempotence solves the single-partition duplicate problem. But what if a stream processing application reads from Topic A, updates a local state store, and writes results to Topic B and Topic C? If the application crashes halfway through, partial writes are a real risk.

Kafka Transactions solve this with a **Transaction Coordinator** (a module residing within the brokers) and a specialized internal topic, `__transaction_state`.

To initiate a transaction, the producer requests a `transactional.id`:

1. **Begin** — the producer signals the start of a transaction.
2. **Produce** — the producer writes data to multiple partitions, tagged `UNCOMMITTED`.
3. **Commit offsets** — the producer sends the consumer offsets (from Topic A) to the Transaction Coordinator, binding input and output state together.
4. **Commit/Abort** — the producer asks the coordinator to commit. The coordinator writes a "Prepare Commit" to the transaction log, then writes "Commit Markers" to all data partitions, and finally completes the transaction.

```text
Producer                Transaction Coordinator          Partitions (A, B, C)
   │  Begin transaction ────────────►│
   │                                 │
   │  Produce (UNCOMMITTED) ─────────┼─────────────────────► writes tagged UNCOMMITTED
   │  Commit consumer offsets ──────►│
   │  Commit request ───────────────►│
   │                                 │  Prepare Commit (transaction log)
   │                                 │  Write Commit Markers ─────────► partitions
   │  ◄────────── Transaction complete
```

### The Consumer's Role: Isolation Levels

Because transactional messages are written to partitions immediately, before the commit, consumers could read uncommitted data if a crash occurs before the commit marker is placed.

To achieve true EOS, the consumer must be configured with `isolation.level=read_committed`. In this mode, the consumer buffers messages internally when it encounters an open transaction, and only delivers them to the application once it reads the corresponding Commit Marker. If it reads an Abort Marker instead, it discards the buffered messages.

## Implementation and Configuration

Enabling EOS in Kafka Streams is straightforward — the framework abstracts the heavy lifting.

```properties
# Producer Configuration for Idempotence
enable.idempotence=true
acks=all
max.in.flight.requests.per.connection=5

# Kafka Streams Configuration for Full EOS
processing.guarantee=exactly_once_v2
```

Setting `processing.guarantee=exactly_once_v2` automatically configures the internal producers for idempotence, sets up transactional IDs, and ensures consumer isolation levels are `read_committed`.

## Conclusion

Exactly-once processing in a distributed system was long considered nearly impossible given the Two Generals' Problem. By combining PID-based sequence caching for producer idempotence with a two-phase commit protocol for cross-partition transactions, Kafka provides a practical, high-performance solution — letting data engineers build reliable, financially accurate streaming pipelines without hand-rolling deduplication logic in the application layer.
