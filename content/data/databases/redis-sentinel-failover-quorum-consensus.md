---
title: "Redis Sentinel: Failover, Consensus, and Quorums"
description: "A deep dive into Redis Sentinel's split-brain prevention, SDOWN/ODOWN failure detection, Raft-based leader election, and the write-guard configuration that protects against data loss during a network partition."
type: "ARTICLE"
categorySlug: "databases"
articleType: "DEEP_DIVE"
tags:
  - "redis"
  - "redis-sentinel"
  - "high-availability"
  - "consensus-protocols"
  - "split-brain"
  - "failover"
---

# Redis Sentinel: Failover, Consensus, and Quorums

## The Problem: High-Availability Failures and Split-Brain Scenarios

In a master-replica Redis deployment, the master instance is a single point of failure for write operations. If the master process crashes, becomes unresponsive due to hardware failure, or suffers network isolation, client writes fail immediately. Automating the detection of master failures and promoting a replica to master is historically complex.

A major hazard in this automation is **split-brain**: a state where network partitioning divides the system, leaving the old master isolated but still believing it is the master, while a subset of the cluster elects a new master. If clients on both sides of the partition continue to write, the data diverges catastrophically, and once the partition heals, writes to one of the masters are permanently lost.

## The Architecture: Distributed Monitoring and Consensus

Redis Sentinel is a distributed system designed to monitor, notify, and manage failover of Redis master-replica configurations. Multiple Sentinel nodes collaborate in a decentralized peer-to-peer network to manage the Redis data nodes.

```text
       +--------------+ Gossip / PubSub +--------------+
       |  Sentinel 1  |<===============>|  Sentinel 2  |
       +--------------+                 +--------------+
              \                               /
       PINGs   \                             / PINGs
                v                           v
         +--------------+             +--------------+
         | Redis Master |             | Redis Replica|
         +--------------+             +--------------+
```

Sentinels establish connectivity with Redis master instances, query them for auto-discovered replica configurations, and use Redis Pub/Sub channels (`__sentinel__:hello`) to auto-discover other Sentinel processes monitoring the same master.

## Subjective Down (SDOWN) vs. Objective Down (ODOWN)

Sentinel uses a two-phase failure detection state machine to prevent premature and incorrect failovers due to localized network instability:

1. **Subjective Down (SDOWN):** An individual Sentinel node pings the master periodically. If the master fails to respond with a valid reply within the configured `down-after-milliseconds` threshold, that Sentinel marks the master locally as `SDOWN`. This is a subjective assessment because the issue could merely be a bad connection between that specific Sentinel and the master.
2. **Objective Down (ODOWN):** Once a Sentinel flags a master as `SDOWN`, it queries its peer Sentinels using the `SENTINEL is-master-down-by-addr` command. If a configured **quorum** of Sentinels agree that the master is unreachable, the master's state is escalated to `ODOWN`.

## Consensus Protocol: Leader Election and Failover Execution

An `ODOWN` state alone is not sufficient to execute a failover. Only one Sentinel — the chosen **leader** — must orchestrate the promotion of a replica. To elect a leader, Sentinel runs a consensus protocol based on Raft:

* The Sentinel that first escalates the master to `ODOWN` attempts to elect itself leader by incrementing its local **epoch** (a monotonic sequence counter) and asking peer Sentinels to vote for it.
* A peer Sentinel grants its vote to the first candidate that requests it for a given epoch.
* To be elected leader, a candidate must receive votes from a **majority** of the total configured Sentinel instances, and the number of votes must be at least equal to the master's configured **quorum** parameter.
* Once a leader Sentinel is elected, it executes the failover sequence:
  1. Selects the healthiest replica based on replication offset, priority, and connection history.
  2. Issues `REPLICAOF NO ONE` to the target replica to promote it to master.
  3. Configures other replicas to replicate from the new master (`REPLICAOF <new-ip> <new-port>`).
  4. Updates the Sentinel state and reconfigures the old master (if it returns) as a replica of the new master.

## Mitigating Split-Brain with Dual Controls

To prevent data loss and split-brain when a network partition separates a master from its replica and the Sentinel majority, Redis relies on a control inside the Redis master node itself. By configuring the master to refuse writes unless it can replicate to a minimum number of replicas, write safety is preserved during a partition.

```text
[Clients] -> [Redis Master (Isolated)]  x-- Network Partition --x  [Replica 1] <-> [Sentinels (Majority)]
                |                                                      |
                | (Master sees 0 replicas)                             | (Sentinel promotes Replica 1)
                v                                                      v
          Writes Blocked                                         [New Master Node]
```

Without this guard, the isolated master would keep accepting writes from any client still able to reach it, and those writes would be silently lost once the partition heals and the old master is demoted to a replica of the new one.

## Practical Configuration and Setup Runbook

### Primary `sentinel.conf` Configuration File

This configuration must be deployed across at least three physical nodes running Sentinel instances (an even number of Sentinels risks tied elections):

```ini
# Network binding
port 26379
daemonize yes
pidfile "/var/run/redis-sentinel.pid"
logfile "/var/log/redis/sentinel.log"
dir "/var/lib/redis/sentinel"

# Monitoring parameters: sentinel monitor <master-name> <ip> <port> <quorum>
sentinel monitor mymaster 192.168.10.10 6379 2

# Failure detection thresholds
sentinel down-after-milliseconds mymaster 30000

# Failover execution timeout limits
sentinel failover-timeout mymaster 180000

# Concurrency throttling during re-replication
sentinel parallel-syncs mymaster 1

# Authentication (if Redis uses requirepass)
sentinel auth-pass mymaster SecureDbPassword123
```

### Redis Node `redis.conf` Write-Guard Configuration

To protect against split-brain write losses, append these options to the Redis master's `redis.conf`:

```ini
# Enforce write block if too few active, low-lag replicas remain
min-replicas-to-write 1
min-replicas-max-lag 10
```

### Administrative Commands

Use the Redis CLI to query Sentinel topology and manually test failover mechanisms:

```bash
# Check master health and status
redis-cli -p 26379 SENTINEL master mymaster

# Query configured replicas of the master
redis-cli -p 26379 SENTINEL replicas mymaster

# Retrieve active Sentinel peer network state
redis-cli -p 26379 SENTINEL sentinels mymaster

# Trigger a manual admin failover (forced election test)
redis-cli -p 26379 SENTINEL failover mymaster
```

The manual failover command forces Sentinel to immediately declare the master dead, initiate an epoch election, and promote a standby replica without waiting for the configured timeouts — useful for testing a failover runbook without physically killing a process.

## Key Takeaways

* A Sentinel deployment needs at least three nodes so a majority can always be reached even if one Sentinel is unreachable.
* SDOWN is a single node's opinion; ODOWN requires quorum agreement — this two-phase design filters out false positives from a single Sentinel's bad network path.
* Leader election uses epochs and majority voting, borrowed from Raft, so exactly one Sentinel drives the failover.
* `min-replicas-to-write` on the Redis master itself is the last line of defense against split-brain writes, independent of whether Sentinel's consensus succeeds.
