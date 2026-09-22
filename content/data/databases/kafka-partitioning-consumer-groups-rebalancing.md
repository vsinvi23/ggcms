---
title: "Kafka Partitioning, Consumer Groups, and Rebalancing"
description: "How Apache Kafka scales horizontally by splitting topics into partitions, coordinating consumer groups, and rebalancing partition ownership — with producer/consumer tuning and offset-lag monitoring."
type: "ARTICLE"
categorySlug: "databases"
articleType: "DEEP_DIVE"
tags:
  - "kafka"
  - "partitioning"
  - "consumer-groups"
  - "rebalancing"
  - "offsets"
  - "event-streaming"
---

# Kafka Partitioning, Consumer Groups, and Rebalancing

## The Problem: The Single-Node Bottleneck

In traditional message queues (RabbitMQ, ActiveMQ in older configurations), a queue resides on a single physical machine. When message volume exceeds the disk I/O, network bandwidth, or CPU limits of that single node, the system hits a hard ceiling. Worse, if a single consumer thread processes a topic serially, throughput is capped by that one thread's processing speed — no matter how many producers write to it.

To handle millions of messages per second with strict per-key ordering guarantees, the storage layer and the consumption layer both need to scale horizontally without violating ordering.

## The Solution: Partitions and Consumer Groups

Apache Kafka abandons the "single queue" paradigm. A logical `Topic` is broken into multiple physical, append-only commit logs called `Partitions`, distributed across brokers in the cluster. Producers, brokers, and consumers then operate in parallel.

### Mental Model: The Highway Lanes

A single-lane road (unpartitioned topic) caps throughput at one lane's capacity. Partitioning is an upgrade to an 8-lane highway: multiple producers can write concurrently, and multiple consumers can read concurrently.

```text
                  +---> [ Broker 1: Partition 0 ] ---> Consumer A
                 /
[ Producer ] ---+-----> [ Broker 2: Partition 1 ] ---> Consumer B
                 \
                  +---> [ Broker 3: Partition 2 ] ---> Consumer C
```

## Storage: The Commit Log

Each partition is an ordered, immutable sequence of records. Every message appended is assigned a sequential ID called an **offset**. Offsets are only meaningful within a partition — Partition 0, Offset 105 is unrelated to Partition 1, Offset 105.

```text
Topic: "user_clicks" (3 Partitions)

Partition 0: [Msg 0] [Msg 1] [Msg 2] [Msg 3] ... (Broker A)
Partition 1: [Msg 0] [Msg 1] [Msg 2]             (Broker B)
Partition 2: [Msg 0] [Msg 1] [Msg 2] [Msg 3] ... (Broker C)
```

## Producer Routing: Key-Hash, Round-Robin, Custom

When a producer sends a record, the partitioner decides which partition receives it:

- **Key-Hash Assignment**: If the message carries a key (e.g., `user_id`), the default partitioner hashes it with **Murmur2** and takes the result modulo the partition count:

  ```text
  Partition = Murmur2(Key) mod TotalPartitions
  ```

  This guarantees every message for a given key always lands in the same partition, preserving strict per-key ordering — essential for financial ledgers or per-user event streams.
- **Round-Robin / Sticky**: If no key is present, messages are batched round-robin across partitions to balance load and maximize batch-fill efficiency.
- **Custom Partitioner**: Engineers can implement `Partitioner` to route by arbitrary payload logic (e.g., geographic region).

```text
                                      +------------------------------------+
                                      |             TOPIC A                |
+--------------------+                |  +------------------------------+  |
|  PRODUCER          |                |  | Partition 0 [0][1][2][3][4]  |  |
|                    |                |  +------------------------------+  |
| Msg A (Key: "123") |--Murmur2 Hash->|  +------------------------------+  |
| Msg B (Key: "456") |                |  | Partition 1 [0][1][2]        |  |
+--------------------+                |  +------------------------------+  |
                                      +------------------------------------+
                                                        |
                                                        v
                                      +------------------------------------+
                                      |       CONSUMER GROUP ALPHA         |
                                      |  [Consumer 1]     [Consumer 2]     |
                                      |  (Reads Part 0)   (Reads Part 1)   |
                                      +------------------------------------+
```

**Caution:** increasing partition count later changes the modulo space. Keys that used to hash to Partition 2 may now hash to Partition 5, breaking the ordering guarantee for historical vs. new writes. Plan partition counts up front for any topic where per-key ordering matters.

## Consumer Groups: Kafka's Scaling Primitive

A **Consumer Group** is a set of consumer instances cooperating to consume a topic. Kafka enforces one hard rule:

> **A partition can only be read by one consumer instance within a given consumer group at a time.**

```text
[ Consumer Group A ]
Consumer 1 ---------> Reads Partition 0
Consumer 2 ---------> Reads Partition 1
Consumer 3 ---------> Reads Partition 2

[ Consumer Group B ] (Independent consumption of the same topic)
Consumer 4 ---------> Reads Partition 0, 1
Consumer 5 ---------> Reads Partition 2
```

- 4 partitions, 2 consumers → each consumer reads 2 partitions.
- 4 partitions, 4 consumers → each gets exactly 1 partition (max parallelism).
- 4 partitions, 5 consumers → 1 consumer sits idle.

This model avoids the locking machinery traditional queues need for concurrent consumption.

## The Rebalance Protocol

When a consumer joins or leaves a group (scale-up, crash, deploy), Kafka triggers a **Rebalance**:

1. The **Group Coordinator** (a designated broker) detects the topology change via heartbeat timeouts.
2. It halts consumption for the group.
3. The **Group Leader** (one of the consumers) computes a new partition assignment using the configured strategy.
4. The coordinator distributes the new assignments; consumers resume from their last committed offsets.

Assignment strategies:

- `RangeAssignor` (legacy default) — assigns contiguous partition ranges per topic; can produce uneven load with multiple topics.
- `RoundRobinAssignor` — spreads partitions evenly across all consumers, all topics.
- `StickyAssignor` — minimizes partition movement across rebalances while keeping balance close to optimal.
- `CooperativeStickyAssignor` (Kafka 2.4+) — enables **incremental cooperative rebalancing**: only the partitions that actually need to move are revoked, so unaffected consumers keep reading uninterrupted instead of a full stop-the-world pause.

```text
Eager Rebalance:              Cooperative Sticky Rebalance:
All consumers stop  --->      Only reassigned partitions pause
Coordinator reassigns  --->   Unaffected consumers keep reading
All consumers resume           Reassigned partitions rejoin quickly
(full outage, ms-seconds)     (partial pause, minimal disruption)
```

## Managing Offsets

Consumers commit their progress back to Kafka's internal `__consumer_offsets` topic. If a consumer crashes, whichever consumer is reassigned that partition resumes from the last committed offset — not from the beginning, and not from the broker's latest write.

**Consumer lag** — the gap between the broker's latest offset (log-end-offset) and the consumer's committed offset — is the primary health signal for a consumer group:

```bash
# Inspect consumer group assignments and lag
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --group billing-processors
```

```text
GROUP               TOPIC           PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG   CONSUMER-ID     HOST         CLIENT-ID
billing-processors  payment-events  0          120954          121000          46    consumer-1_a9f  /10.0.1.5    consumer-1
billing-processors  payment-events  1          88412           89000           588   consumer-2_c2b  /10.0.1.6    consumer-2
```

Growing lag on one partition while others stay flat usually means a hot key, a slow downstream dependency for that consumer, or a stuck consumer thread — not a global capacity problem.

## Configuration: Creating Topics

```bash
# Create a topic with 12 partitions across 3 brokers, replication factor 3
kafka-topics.sh --create \
  --bootstrap-server localhost:9092 \
  --replication-factor 3 \
  --partitions 12 \
  --topic user-activity-events

# Expand partitions later (careful — changes the Murmur2 modulo space for keyed messages)
kafka-topics.sh --bootstrap-server localhost:9092 \
  --alter --topic user-activity-events --partitions 24
```

## Producer and Consumer Tuning

```ini
# producer.properties
bootstrap.servers=kafka-broker-1:9092,kafka-broker-2:9092
acks=all                                  # wait for all in-sync replicas — maximum durability
retries=2147483647                        # retry infinitely on transient errors
max.in.flight.requests.per.connection=5   # retains per-partition order when combined with retries + idempotence
batch.size=65536                          # 64KB batches
linger.ms=20                              # wait up to 20ms to accumulate a fuller batch
compression.type=snappy                   # balances CPU cost against throughput gain
```

```ini
# consumer.properties
bootstrap.servers=kafka-broker-1:9092,kafka-broker-2:9092
group.id=billing-processors
partition.assignment.strategy=org.apache.kafka.clients.consumer.CooperativeStickyAssignor

enable.auto.commit=false        # disable auto-commit to avoid silently losing offsets on a consumer crash mid-batch
max.poll.interval.ms=300000     # allow up to 5 minutes of processing per poll() before the coordinator marks the consumer dead
max.poll.records=500            # cap records fetched per poll() loop
```

## Conclusion

Partitioning is the mechanism that lets Kafka scale from gigabytes to petabytes: data is distributed physically across brokers, and consumption is distributed logically across consumer group members. Key-hash routing preserves per-key ordering; consumer groups parallelize reads without locking; the rebalance protocol (ideally cooperative-sticky) keeps ownership changes from causing full outages; and offset-lag monitoring is the primary signal for whether the group is keeping up. Over-partitioning wastes file handles and memory per broker; under-partitioning caps maximum consumption parallelism. Getting the partition count right — and setting it before ordering-sensitive keys are in production — is the core of Kafka capacity planning.
