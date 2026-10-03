---
title: "Redis Sentinel: Automated Failover and Quorum Consensus"
description: "How Redis Sentinel detects a failed master through SDOWN/ODOWN state transitions, elects a failover leader via epoch-based consensus, and routes clients to the new master without a hardcoded IP."
type: "ARTICLE"
categorySlug: "databases"
articleType: "DEEP_DIVE"
tags:
  - "redis"
  - "redis-sentinel"
  - "high-availability"
  - "failover"
  - "quorum"
  - "consensus"
---

# Redis Sentinel: Automated Failover and Quorum Consensus

At 3 a.m., a Redis master's host loses network connectivity. In a plain master-replica deployment, the replicas simply keep waiting for a master that will never come back, and every application that had the master's IP hardcoded starts failing writes until someone gets paged, confirms the outage, and manually promotes a replica. Redis Sentinel exists to make that entire sequence automatic — but only if enough independent observers agree the master is actually gone, not just unreachable from one vantage point.

## The Problem: Single Point of Failure

Redis is predominantly single-threaded and extremely fast. In a standard production deployment, a master-replica topology handles writes on the master and reads on replicas that copy data asynchronously. If the master crashes from hardware failure or a network partition, the replicas sit idle waiting for a master that no longer exists. Manual promotion is slow and error-prone, causing unacceptable application downtime.

## The Solution: Redis Sentinel

Redis Sentinel is a distributed system that monitors Redis instances, detects failures, and automatically executes failover without human intervention — acting as the control plane for your Redis data plane.

### Mental Model: The Watchdogs

Think of Sentinels as independent watchdogs circling a flock of sheep (Redis nodes). If one watchdog thinks the shepherd (master) is missing, it barks — but the flock doesn't get a new shepherd until a majority of the watchdogs agree the shepherd is truly gone.

```text
       +-------------+      +-------------+      +-------------+
       | Sentinel 1  |      | Sentinel 2  |      | Sentinel 3  |
       +-------------+      +-------------+      +-------------+
              \                    |                    /
               \                   |                   /
                \                  v                  /
                 \          +-------------+          /
                  +-------> | Master Node | <-------+
                            +-------------+
                               /       \
                              /         \
                             v           v
                  +-------------+     +-------------+
                  | Replica 1   |     | Replica 2   |
                  +-------------+     +-------------+
```

## Deep Dive: Consensus and Failover

### 1. Monitoring and state detection

Sentinels periodically ping every known Redis instance (masters and replicas):

- **SDOWN (Subjective Down):** when a single Sentinel cannot reach the master for the configured `down-after-milliseconds` threshold, it marks the master SDOWN — a purely local observation.
- **ODOWN (Objective Down):** that Sentinel then asks the others (via `SENTINEL is-master-down-by-addr`) whether they also see the master as down. If a configured `quorum` (usually a majority, e.g. 2 of 3) agree, the master is marked ODOWN.

### 2. Leader election

Once ODOWN is established, the Sentinels must decide which one orchestrates the failover. They run a Raft-like consensus using epochs (monotonically increasing counters) and hold an election; the Sentinel that receives a majority of peer votes becomes the leader for that failover epoch.

### 3. Failover execution

The leader Sentinel orchestrates the transition:

1. **Select** — evaluate replicas by priority, replication offset (most up-to-date data wins), and run ID.
2. **Promote** — send `REPLICAOF NO ONE` to the chosen replica, promoting it to master.
3. **Reconfigure** — send `REPLICAOF new-master-ip port` to the other replicas so they sync from the new master.
4. **Broadcast** — publish the new cluster topology to clients.

## Configuration and Architecture

A robust Sentinel setup requires at least three Sentinel instances on isolated infrastructure to prevent split-brain. With only two Sentinels, a network partition that separates one Sentinel-plus-master from the other Sentinel leaves neither side with a majority — failover cannot safely proceed on either side.

```ini
# Monitor the master named 'mymaster' at 192.168.1.50 port 6379.
# A quorum of 2 Sentinels must agree to trigger ODOWN.
sentinel monitor mymaster 192.168.1.50 6379 2

# Time (in ms) an instance must be unreachable to be considered SDOWN
sentinel down-after-milliseconds mymaster 5000

# Time (in ms) to wait for a failover to complete before trying again
sentinel failover-timeout mymaster 60000

# How many replicas can be reconfigured to sync simultaneously
sentinel parallel-syncs mymaster 1
```

## Client Routing

Applications never connect directly to a hardcoded Redis master IP. Instead, they ask Sentinel:

```bash
> SENTINEL get-master-addr-by-name mymaster
1) "192.168.1.50"
2) "6379"
```

The client library then opens a connection to the returned IP. During a failover, client libraries subscribe to pub/sub on the Sentinel connections to get immediate notification of topology changes, updating their connection pools dynamically instead of polling.

## Key Takeaways

- Sentinel's SDOWN/ODOWN split separates "one observer can't reach the master" from "a quorum agrees the master is actually down," avoiding failover on a single Sentinel's network blip.
- Failover leader election uses epoch-based, Raft-like consensus so only one Sentinel drives the promotion even if multiple detect ODOWN simultaneously.
- Always run at least three Sentinels on independent infrastructure — two Sentinels cannot form a majority on either side of a partition, defeating the whole point of quorum.
- Clients should discover the master through `SENTINEL get-master-addr-by-name` and Sentinel pub/sub notifications, never a hardcoded IP.
