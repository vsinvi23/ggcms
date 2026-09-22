---
title: "Pub/Sub vs Point-to-Point: Choosing the Right Messaging Model"
description: "The real architectural difference between publish/subscribe event broadcasting and point-to-point competing-consumer queues, and how Kafka consumer groups blend both models."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "event-driven-architecture"
  - "pub-sub"
  - "message-queues"
  - "kafka"
  - "rabbitmq"
  - "consumer-groups"
---

# Pub/Sub vs Point-to-Point: Choosing the Right Messaging Model

## The Problem: The Ambiguity of "Messaging"

When a team decides to move from synchronous HTTP calls between services to an event-driven architecture, the conversation often stops at "let's put Kafka in the middle" or "let's use RabbitMQ." But dropping a broker between two services doesn't automatically solve anything — it just moves the coupling problem somewhere else if you pick the wrong delivery model.

The core confusion is that "messaging" actually covers two fundamentally different delivery models: **Publish/Subscribe (Pub/Sub)** and **Point-to-Point (competing consumers)**. Using the wrong one produces duplicate processing, silently dropped events, or services that are still tightly coupled despite the broker sitting between them.

## The Mental Model: Radio Broadcast vs. Task List

**Pub/Sub** is a radio broadcast. The station (publisher) transmits into the air (a topic) with no idea who's listening, how many receivers are tuned in, or what they do with the signal. Zero listeners or a million — every listener that's tuned in receives the identical broadcast.

**Point-to-Point** is a shared to-do list worked by a pool of employees. A manager (producer) writes a task and drops it in a pile (the queue). Workers (consumers) each pull one task at a time from the pile. Once a worker takes a task and finishes it, that task is gone. **A single task is handled by exactly one worker — never by two.**

## Model 1: Point-to-Point (Competing Consumers)

*Typical technologies: RabbitMQ classic queues, AWS SQS, ActiveMQ.*

Point-to-point exists for **command distribution and load balancing**. The sender is telling the system *to do something specific*.

```text
+----------------+        +------------------+        +-------------------+
| Web App        | -----> |   Email Queue    | -----> |  Email Worker 1    |
| (Producer)     |  send  |  [task][task]    | <-pull-|  Email Worker 2    |
+----------------+        +------------------+ <-pull-|  Email Worker 3    |
                                                        +-------------------+

  10 queued tasks + 3 workers => tasks are split among the 3 workers.
  No single task is ever processed twice.
```

**Key characteristics:**
- **Routing:** 1-to-1. Each message is delivered to exactly one consumer instance, whichever happens to pull it first.
- **Intent:** usually a *command* — `SendWelcomeEmail`, `GeneratePDF`, `ResizeImage`.
- **Coupling:** high. The producer knows precisely what work needs to happen; it's delegating *execution*, not announcing a fact.

## Model 2: Publish/Subscribe

*Typical technologies: Apache Kafka, AWS SNS, Google Cloud Pub/Sub.*

Pub/Sub exists for **domain events and decoupling**. The sender isn't asking for anything — it's announcing that something already happened.

```text
+----------------+       +---------------------+
| Order Service  | ----> |  OrderCreated Topic |
| (Publisher)    | event |                     |
+----------------+       +----------+----------+
                                    |
                 +------------------+------------------+
                 |                  |                  |
                 v                  v                  v
        +----------------+ +----------------+ +--------------------+
        | Inventory Svc  | | Shipping Svc   | | Analytics Svc      |
        | (reads copy 1) | | (reads copy 2) | | (reads copy 3)     |
        +----------------+ +----------------+ +--------------------+

  All three subscribers receive their OWN full copy of the same event.
```

**Key characteristics:**
- **Routing:** 1-to-many. Every subscriber that's currently listening on the topic gets its own copy of the event.
- **Intent:** an immutable *fact* — `OrderCreated`, `PaymentSettled`, not a request for action.
- **Coupling:** effectively zero. `OrderService` has no idea `AnalyticsService` exists. Adding a new `FraudDetectionService` tomorrow requires zero changes to the publisher — it just subscribes.

## The Hybrid: Consumer Groups (The Kafka Way)

Apache Kafka blurs the line between the two models by layering **consumer groups** on top of a single topic abstraction.

- A topic holds an ordered, partitioned log of events — that's the pub/sub side.
- Consumers organize into named consumer groups. Every distinct consumer group gets its own full copy of the topic (pub/sub behavior across groups).
- Within a single consumer group, Kafka assigns each partition to exactly one member of that group — so if you scale a group to five instances for throughput, Kafka load-balances the partitions among them (point-to-point behavior within a group).

```text
Topic: order-events (4 partitions)

  Consumer Group "inventory-service"          Consumer Group "shipping-service"
  (gets its OWN full copy of every event)     (gets its OWN full copy of every event)
  +-------------+  +-------------+            +-------------------------------+
  | Instance A  |  | Instance B  |            |  Single Instance               |
  | partitions  |  | partitions  |            |  reads ALL 4 partitions        |
  | 0, 1        |  | 2, 3        |            +-------------------------------+
  +-------------+  +-------------+

  Scale InventoryService to 2 instances -> partitions split between them
  (competing-consumer load balancing WITHIN the group).
  ShippingService is a separate group -> it still sees every event
  (pub/sub ACROSS groups).
```

This is why Kafka can serve as the backbone for both fire-and-forget task distribution *and* domain event broadcasting, depending purely on how you assign consumer group names — the broker mechanics stay the same.

## When to Use Which

**Use Point-to-Point (SQS, classic RabbitMQ queues) when:**
- You need to execute one specific, targeted task asynchronously (resizing an image, sending one email).
- You want strict competing-consumer load balancing without the overhead of a partitioned log.
- You need message-level retries and per-message Dead Letter Queues.

**Use Pub/Sub (Kafka, SNS) when:**
- One state change in your system should trigger multiple independent downstream reactions.
- You're implementing the Choreography flavor of the Saga pattern, where services react to each other's events without a central coordinator.
- You need to retain events for replay — new services added later should be able to rebuild state from history (event sourcing).

## Common Misconceptions

**Misconception:** "Kafka is just a faster message queue."
**Reality:** Kafka's default behavior is pub/sub with retained, replayable logs. It only behaves like a traditional queue when multiple consumer instances share one consumer group — the point-to-point behavior is a side effect of group membership, not the default mode.

**Misconception:** "If I use a Pub/Sub broker, I've automatically decoupled my services."
**Reality:** Decoupling comes from the message representing a *fact* the publisher doesn't care who consumes, not from the broker technology. You can still build tightly coupled point-to-point command chains on top of Kafka if every message is a targeted command rather than a domain event.

## Key Takeaways

- Point-to-point queues deliver each message to exactly one consumer — use them for delegating a specific unit of work.
- Pub/Sub topics deliver each message to every interested subscriber — use them for announcing that a domain fact has occurred.
- Kafka consumer groups let a single topic behave as pub/sub across groups and point-to-point within a group, which is why it can back both command queues and event streams.
- Picking the wrong model doesn't just cost performance — it silently reintroduces the tight coupling event-driven architecture was supposed to remove.

## What to Learn Next

- The Transactional Outbox pattern, for guaranteeing that a database write and a published event commit atomically.
- The Saga pattern (Choreography vs Orchestration), which relies heavily on getting the pub/sub model right.
- Retry patterns and Dead Letter Queues, which are essential companions to both messaging models when a consumer can't process a message.
