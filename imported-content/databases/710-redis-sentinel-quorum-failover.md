# Redis Sentinel: Cluster Failover, Consensus Protocols, and Quorums

## The Problem: Single Point of Failure
Redis is predominantly single-threaded and notoriously fast, making it the de-facto standard for caching and real-time state. However, a standard Redis Master-Replica architecture suffers from a fatal flaw: if the Master node crashes, the system stops accepting writes. Replicas do not automatically promote themselves. Manual intervention during an outage violates high-availability (HA) SLAs.

## The Solution: Redis Sentinel
Redis Sentinel is a distributed system designed to monitor Redis instances, detect failures, and execute automatic failover. Sentinel nodes act as an independent monitoring plane. When a Master fails, Sentinels reach a consensus and cooperatively orchestrate the promotion of a Replica to Master.

### Technical Architecture and The Quorum
Sentinel relies on a consensus mechanism to prevent split-brain scenarios (where a network partition causes two isolated segments to both elect a master). 

To ensure safety, you must deploy Sentinel in a cluster (minimum 3 nodes). They use a concept called a **Quorum**: the minimum number of Sentinel nodes that must agree that a Master is unreachable before triggering a failover.

```text
        +---------------+
        | Client / App  |
        +---------------+
                | (Queries Sentinel for Master IP)
                v
+---------+ +---------+ +---------+
| Sentinel| | Sentinel| | Sentinel|
|    1    | |    2    | |    3    |
+---------+ +---------+ +---------+
      |          |          |
      |          v          |
      |   +-------------+   |
      +-> | Redis Master| <-+
          +-------------+
                 |
          (Replication)
                 |
          +-------------+
          |Redis Replica|
          +-------------+
```

### SDOWN and ODOWN States
Sentinel failure detection operates in two phases:

1.  **Subjectively Down (SDOWN):** A single Sentinel node cannot reach the Master via `PING` within the configured `down-after-milliseconds` threshold. This is a local observation.
2.  **Objectively Down (ODOWN):** The Sentinel asks other Sentinels via the `SENTINEL is-master-down-by-addr` command. If the number of Sentinels reporting SDOWN reaches the configured Quorum, the Master is marked ODOWN.

Once ODOWN is reached, the Sentinels hold an election using the Raft algorithm to select a "Leader Sentinel." This Leader is responsible for executing the actual failover.

### The Failover Process
The Leader Sentinel executes the following steps:
1.  **Select a Replica:** It evaluates Replicas based on replica priority, replication offset (which replica is most up-to-date), and run ID.
2.  **Promote:** It sends the `REPLICAOF NO ONE` command to the chosen Replica, promoting it to Master.
3.  **Reconfigure:** It sends `REPLICAOF <new_master_ip> <new_master_port>` to the remaining Replicas.
4.  **Broadcast:** It publishes the new Master address to clients via Pub/Sub on the `__sentinel__:hello` channel.

### Sentinel Configuration
A typical `sentinel.conf` configuration requires defining the master and the quorum.

```ini
# Monitor the master named 'mymaster' at 10.0.0.1 on port 6379.
# The quorum is set to 2 (requires 2 Sentinels to agree for ODOWN).
sentinel monitor mymaster 10.0.0.1 6379 2

# Time in milliseconds before a node is considered SDOWN.
sentinel down-after-milliseconds mymaster 5000

# Time in milliseconds allowed for a failover to complete.
sentinel failover-timeout mymaster 15000

# Number of replicas to reconfigure concurrently during failover.
# Set to 1 to avoid all replicas syncing simultaneously, which causes latency.
sentinel parallel-syncs mymaster 1
```

### Client Integration
Clients must be Sentinel-aware. Instead of connecting directly to the Redis Master, the client connects to the Sentinels, asks for the current Master address for a specific cluster name (e.g., `mymaster`), and then establishes the connection. 

By separating the control plane (Sentinel) from the data plane (Redis), Redis Sentinel provides a robust, distributed HA solution without complex proxy layers.