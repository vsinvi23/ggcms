---
title: "Redis Pub/Sub vs Streams: Choosing the Right Messaging Primitive"
description: "Why Redis Pub/Sub messages vanish the instant a subscriber disconnects, how Redis Streams' radix-tree log and consumer groups deliver Kafka-like durability, and a decision matrix for choosing between them."
type: "ARTICLE"
categorySlug: "databases"
articleType: "GUIDE"
tags:
  - "redis"
  - "pubsub"
  - "redis-streams"
  - "consumer-groups"
  - "event-driven-architecture"
  - "message-queue"
---

# Redis Pub/Sub vs Streams: Choosing the Right Messaging Primitive

An order-processing service publishes `order.created` events over Redis `PUBLISH`. During a routine deploy, the consuming worker is offline for eleven seconds — and every order created in that window simply never arrives. There's no error, no dead-letter queue, no way to detect the gap after the fact. The bug isn't in the code; it's in the choice of primitive. Redis Pub/Sub was never built to guarantee delivery, and no amount of retry logic on top of it fixes that.

## The Problem: The High Cost of Lost Messages

Redis is universally recognized as a blazing-fast, in-memory data store, and engineers building messaging or event-driven architectures often reach for it first. Historically, Redis offered **Pub/Sub**, a highly efficient messaging system — but as architectures grew into distributed microservices requiring guaranteed delivery, its fundamental flaw became apparent: it is entirely ephemeral. If a subscriber disconnects for a network blip, or a service is briefly offline during deployment, any messages broadcast during that window are permanently lost. There is no history, no persistence, no recovery. Redis 5.0 introduced **Redis Streams** specifically to solve this.

## The Mental Model: Fire-and-Forget vs The Log

**Redis Pub/Sub (the radio broadcast):**

```text
Publisher ──(PUBLISH)──> Channel (news) ──> Subscriber A (Online - Receives)
                                        ──> Subscriber B (Offline - Misses out)
```

Pub/Sub acts like a radio tower: it broadcasts instantly to anyone currently tuned in. Once the transmission is over, the data is gone forever.

**Redis Streams (the append-only log):**

```text
Producer ──(XADD)──> Redis Stream (Log) <──(XREAD)── Consumer A
                          │             <──(XREADGROUP)── Consumer Group (Microservice cluster)
                          ├── Msg 1 (Read by A)
                          ├── Msg 2 (Pending Ack)
                          └── Msg 3 (Unread)
```

Streams act like a sequential ledger, similar to Apache Kafka. Messages are appended to a persistent log. Consumers can read from the beginning, read from the end, or track progress via Consumer Groups. Offline consumers seamlessly resume reading where they left off once reconnected.

## Deep Dive: Pub/Sub Internals

In Redis Pub/Sub, the server maintains a dictionary mapping channel names to linked lists of connected client pointers. When `PUBLISH channel message` runs, Redis iterates the linked list and synchronously writes the message to the socket buffers of all subscribed clients.

Because it never writes to disk or allocates long-term memory for messages, Pub/Sub has incredibly low latency and high throughput. Memory is bounded only by outgoing network buffer size — if a client is too slow to consume, its buffer fills up, and Redis forcefully drops the client to protect itself.

## Deep Dive: Redis Streams Internals

Redis Streams implement a radically different internal data structure: a radix tree (Redis's implementation is called **Rax**).

`XADD mystream * sensor_id 1234 temperature 19.8` appends an entry to the radix tree, where the entry ID — usually an auto-generated millisecond timestamp — forms the path in the tree, giving highly optimized, memory-efficient lookups by time.

Because a Stream is a persistent in-memory data structure, it survives client disconnections, and it is also persisted to disk if RDB snapshots or AOF are enabled.

### Consumer groups and acknowledgements

To manage competing consumers — like multiple instances of an order-processing microservice — Streams provide **Consumer Groups**:

1. **`XREADGROUP`** — a worker requests the next unread message. Redis marks it "Pending" and assigns it to that specific worker.
2. **`XACK`** — once the worker successfully processes the message (e.g., writes it to a database), it sends `XACK`, and Redis removes the message from the Pending Entries List (PEL).

If a worker crashes before sending `XACK`, the message stays in the PEL. Another worker can use `XPENDING` and `XCLAIM` to detect stalled messages and reassign them, guaranteeing at-least-once delivery semantics.

## Choosing the Right Tool

- **Use Pub/Sub** for ephemeral, fire-and-forget data where loss is acceptable: real-time UI updates (chat rooms, live sports scores), cache invalidation broadcasts, or high-frequency telemetry where the next tick replaces the current one.
- **Use Redis Streams** when message loss is unacceptable and you need durability: order-processing pipelines, activity feeds, asynchronous job queues, and architectures where services need to scale horizontally and cooperatively consume events.

## Key Takeaways

- Pub/Sub is a live broadcast with zero persistence — an offline subscriber loses every message sent during its downtime, permanently.
- Streams are an append-only, radix-tree-backed log that survives disconnects and can be persisted via RDB/AOF like any other Redis data structure.
- Consumer Groups plus the Pending Entries List (`XREADGROUP`/`XACK`/`XCLAIM`) give Streams Kafka-like at-least-once delivery guarantees that Pub/Sub simply cannot provide.
- Pick Pub/Sub for ephemeral broadcast, Streams for anything where losing a message is a real business problem.
