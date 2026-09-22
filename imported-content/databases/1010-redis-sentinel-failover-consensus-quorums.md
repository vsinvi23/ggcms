# Redis Sentinel: Cluster Failover, Consensus Protocols, and Quorums

## The Problem: The High Availability & Partitioning Challenge

In a standard master-replica Redis deployment, failover is a manual, error-prone task. If the primary write node crashes, application clients are blocked from writing, leading to downtime. 

Automating failover requires a distributed monitoring system. However, in a distributed setup, network partitions (split-brain scenarios) can isolate nodes. If an isolated monitoring node falsely declares the master dead and promotes a replica, the cluster ends up with two masters, leading to data divergence and split-brain conflicts. 

Redis Sentinel solves this using a consensus protocol with configurable quorums to ensure safe, automated failover without central coordination.

---

## Technical Architecture & Sentinel Consensus Protocol

Redis Sentinel is a distributed system consisting of multiple Sentinel processes running in parallel. They interact with Redis masters, replicas, and other Sentinels via pub/sub channels and direct ping-pong monitoring.

```
       +--------------+     +--------------+     +--------------+
       |  Sentinel 1  | <-> |  Sentinel 2  | <-> |  Sentinel 3  |
       +--------------+     +--------------+     +--------------+
              |                    |                    |
              | (PING/INFO)        | (PING/INFO)        | (PING/INFO)
              +----------+---------+---------+----------+
                         |                   |
                         v                   v
                  +--------------+    +--------------+
                  | Redis Master |    | Redis Replica|
                  |   (Primary)  |    |  (Secondary) |
                  +--------------+    +--------------+
                         |                   ^
                         | Replication Stream|
                         +-------------------+
```

### 1. Subjective Down (SDOWN)
An individual Sentinel process periodically pings the monitored Redis master. If the master fails to respond with a valid reply within the configured `down-after-milliseconds` timeframe, that specific Sentinel transitions the master's state to **SDOWN (Subjectively Down)**. This is a local decision.

### 2. Objective Down (ODOWN) & Quorum
To prevent a single Sentinel with a degraded network link from triggering an unnecessary failover, Sentinel escalates SDOWN to **ODOWN (Objectively Down)** via consensus. 
- The Sentinel queries other Sentinels using the `SENTINEL is-master-down-by-addr` command.
- If at least $Q$ (the **quorum** parameter) Sentinels agree that the master is unreachable, the master is marked as ODOWN cluster-wide.

### 3. Leader Election (Raft-Like / Epoch-Based)
Once ODOWN is achieved, Sentinels must elect a single leader to coordinate the actual failover. This protocol uses a monotonically increasing **Configuration Epoch**:
- A Sentinel increments its epoch and casts a vote for itself as leader, notifying peer Sentinels.
- Sentinels vote for the first candidate that requests a vote in a given epoch.
- To win, a Sentinel must receive a majority of votes from all configured, active Sentinels (calculated as `N/2 + 1`, where $N$ is the total number of Sentinels), and must also satisfy the quorum requirement. This prevent split-brains in partitioned networks.

### 4. Replica Promotion Strategy
The elected Sentinel leader executes the failover by choosing the most suitable replica to promote to master based on a strict priority ladder:
1. **Replica Priority:** Configured in `redis.conf` (`replica-priority`). A value of `0` means the replica must never be promoted.
2. **Replication Offset:** The replica that has processed the largest number of bytes from the dead master (most up-to-date) is preferred.
3. **Run ID:** If offsets are identical, lexicographical comparison of the Replica's Run ID is used as a tie-breaker.

The leader executes `SLAVEOF NO ONE` on the selected replica and issues `SLAVEOF` pointing to the new master to all other replicas.

---

## Production Config: Sentinel and Redis Configurations

Deploy Sentinel in production by ensuring that sentinel processes are running on at least 3 separate physical machines, with a quorum of 2.

### `sentinel.conf` (Sentinel Node Config)
```conf
# Run on standard Sentinel Port
port 26379
dir "/var/lib/redis/sentinel"

# Monitor master named "mymaster" at IP 10.0.0.10, port 6379, requiring a quorum of 2
sentinel monitor mymaster 10.0.0.10 6379 2

# Mark subjective down if unresponded to for 15 seconds
sentinel down-after-milliseconds mymaster 15000

# How long to wait before initiating a retry if a failover is already in progress
sentinel failover-timeout mymaster 180000

# Limit the number of replicas that can be reconfigured to sync with the new master in parallel
sentinel parallel-syncs mymaster 1

# Security and Auth
sentinel auth-pass mymaster SecureDatabasePassword123
```

### `redis.conf` (Primary and Replica Node Config)
```conf
# Enable replication password authentication
masterauth "SecureDatabasePassword123"
requirepass "SecureDatabasePassword123"

# Replication settings
replica-priority 100                 # Set to 0 on staging/reporting nodes to prevent promotion
replica-read-only yes
```

---

## Diagnostic Command Cheat-Sheet

Interact with Sentinels via `redis-cli` using specialized administrative commands.

```bash
# 1. Connect to the Sentinel daemon
redis-cli -p 26379

# 2. Get status of all monitored masters
127.0.0.1:26379> SENTINEL masters

# 3. Query the current master IP address for "mymaster"
127.0.0.1:26379> SENTINEL get-master-addr-by-name mymaster

# 4. Show connected replicas and their lag states
127.0.0.1:26379> SENTINEL replicas mymaster

# 5. Check other known Sentinels and their connection states
127.0.0.1:26379> SENTINEL sentinels mymaster

# 6. Force manual, authenticated failover for testing
127.0.0.1:26379> SENTINEL failover mymaster

# 7. Query if Sentinels are in agreement
127.0.0.1:26379> SENTINEL ckquorum mymaster
```
