# Redis Sentinel: Cluster Failover, Consensus Protocols, and Quorums

## The Problem: Manual Master Promotion and Split-Brain Risk
Redis replicates data asynchronously from a primary master node to one or more read-only replica nodes. If the master node fails, the replication stream stops, and write operations are blocked. 

To restore writes, a replica must be promoted to the new master, and all other replicas must be reconfigured to point to it. Performing this manually is slow, error-prone, and leads to significant downtime. 

If automated incorrectly, multiple nodes might claim master status simultaneously, creating a **split-brain** scenario where different clients write to different masters, leading to silent data corruption and conflict resolution nightmares.

---

## Technical Architecture: The Sentinel Consensus Framework
Redis Sentinel is a distributed system that monitors Redis instances, sends notifications, and orchestrates automatic failovers. Sentinel operates as a consensus-based cluster, ensuring that failover decisions are not made by a single, isolated Sentinel node that might be suffering from local network partition.

```
       [ Client App ]
             │
             ▼ (Queries Master IP)
     ┌───────────────┐
     │  Sentinel C   │◄────────────────────────┐
     └───────┬───────┘                         │
             │ PING                            │ (is-master-down-by-addr)
             ▼                                 │
     ┌───────────────┐                  ┌──────┴──────┐
     │ Redis Master  │◄───(PING)────────┤ Sentinel B  │
     └───────────────┘                  └──────┬──────┘
             ▲                                 │
             │ PING                            │ (is-master-down-by-addr)
     ┌───────┴───────┐                         │
     │  Sentinel A   │◄────────────────────────┘
     └───────────────┘
```

### Subjective Down (SDOWN) vs. Objective Down (ODOWN)
A Sentinel's decision to classify a Redis node as offline goes through two stages:
1. **Subjective Down (SDOWN):** This is a node-local state. A Sentinel declares a master SDOWN if it fails to respond to a `PING` command with a valid `+PONG` or an error within the time configured in the `down-after-milliseconds` parameter.
2. **Objective Down (ODOWN):** This is a cluster-wide state. When a Sentinel detects an SDOWN, it queries other Sentinel nodes in the network using the `SENTINEL is-master-down-by-addr` command. If the number of Sentinels confirming that the master is unreachable is greater than or equal to the configured **Quorum**, the Sentinel promotes the master's status to ODOWN.

### Leader Election and Failover Quorums
Declaring ODOWN does not immediately trigger a failover. The Sentinels must first elect a single **Leader Sentinel** to coordinate the failover process. This prevents multiple Sentinels from attempting failovers simultaneously.

1. **Raft-Like Vote:** Sentinels initiate a vote. Each node increments its configuration epoch and requests votes from its peers.
2. **Majority Requirement:** A Sentinel can only become the Leader if it receives both:
   * At least **Quorum** votes to recognize ODOWN.
   * A **Majority** of votes from the total number of defined Sentinels. 
   
$$\text{Majority} = \left\lfloor \frac{N}{2} \right\rfloor + 1$$

Where $N$ is the total count of Sentinels in the cluster. For a 3-Sentinel cluster, the majority is 2. Even if quorum is set to 1, a failover leader cannot be elected if only 1 Sentinel is alive.

---

## Technical Implementation: Sentinel Production Configuration

Below is a hardened production configuration for a Sentinel instance. It should be replicated across at least three physical nodes.

```ini
# /etc/redis/sentinel.conf

# Port for Sentinel daemon
port 26379
daemonize yes
pidfile "/var/run/redis-sentinel.pid"
logfile "/var/log/redis/sentinel.log"
dir "/var/lib/redis/sentinel"

# Monitor syntax: sentinel monitor <master-name> <ip> <port> <quorum>
sentinel monitor mymaster 10.0.1.100 6379 2

# Authentication secrets
sentinel auth-pass mymaster SecureStorageSecret123!

# Number of milliseconds a master can be unresponsive before SDOWN
sentinel down-after-milliseconds mymaster 10000

# Failover timeout in milliseconds (abort failover if it takes longer than this)
sentinel failover-timeout mymaster 60000

# Maximum number of replicas that can be reconfigured to follow 
# the new master in parallel (1 limits load on the new master)
sentinel parallel-syncs mymaster 1
```

### Querying Sentinel via CLI
You can inspect the consensus state and failover readiness of your Sentinel nodes using the Redis CLI:

```bash
# Connect to Sentinel
redis-cli -p 26379

# Query details about the monitored master
127.0.0.1:26379> SENTINEL master mymaster
# Returns master status, IP, port, runid, active sentinel count, quorum

# Check the list of active Sentinels and their connection status
127.0.0.1:26379> SENTINEL sentinels mymaster

# Force a manual failover (useful for testing or routine maintenance)
127.0.0.1:26379> SENTINEL FAILOVER mymaster
```

---

## The Failover Promotion Algorithm
Once a Leader Sentinel is elected, it executes the failover using the following step-by-step logic:

1. **Candidate Selection:** Filter out replicas that have an active SDOWN, high replication lag, or are disconnected. Order the remaining candidates by:
   * `replica-priority` (lowest priority integer gets selected first; a priority of `0` means the replica must never be promoted).
   * Replication offset (the replica with the highest offset has received the most data from the primary master and is selected next).
   * Run ID lexicographical comparison (acting as a tiebreaker).
2. **Promotion:** Send `SLAVEOF NO ONE` to the selected replica.
3. **Reconfiguration:** Send `SLAVEOF <new-master-ip> <new-master-port>` to all other replica nodes.
4. **Broadcast:** Broadcast the new configuration to the other Sentinels via pub/sub channels (`__sentinel__:hello`).
