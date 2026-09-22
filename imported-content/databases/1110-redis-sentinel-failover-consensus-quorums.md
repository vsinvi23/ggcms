# Redis Sentinel: Cluster Failover, Consensus Protocols, and Quorums

## The Problem: The Single Point of Failure
Redis is phenomenally fast, primarily because it is an in-memory data structure store utilizing a single-threaded event loop. However, standard Redis replication is asynchronous and requires manual intervention to promote a replica if the master node crashes. 

High availability demands automated failure detection and failover. Enter **Redis Sentinel**.

## Architecture: Distributed Monitoring
Redis Sentinel is a distributed system designed to monitor Redis instances, detect failures, and automatically elect a new master. Sentinel instances run as separate processes (often alongside the Redis servers).

To prevent split-brain scenarios (where network partitions cause two replicas to be promoted simultaneously), Sentinels must agree that a master is dead before taking action.

### Topology and Quorum
```text
       +------------+
       | Sentinel 1 |
       +------------+
         /    |    \
        /     |     \  (Gossip / Ping)
       /      |      \
+----+   +----+   +----+
| R1 |---| M1 |---| R2 |
+----+   +----+   +----+
       \      |      /
        \     |     /
         \    |    /
       +------------+
       | Sentinel 2 |
       +------------+
       | Sentinel 3 |
       +------------+
```

A robust Sentinel setup requires a minimum of 3 Sentinels. 
- **Quorum**: The number of Sentinels that must agree the master is unreachable.
- **Majority**: The number of Sentinels required to authorize the actual failover (typically `N/2 + 1`).

## Failure Detection: SDOWN vs. ODOWN
Sentinel uses a two-phase failure detection mechanism.

1. **SDOWN (Subjective Down):** A single Sentinel pings the master. If the master doesn't respond within `down-after-milliseconds`, that specific Sentinel flags the master as SDOWN. This is local to the observer; no action is taken yet.
2. **ODOWN (Objective Down):** The Sentinel queries other Sentinels via the `SENTINEL is-master-down-by-addr` command. If the number of Sentinels reporting SDOWN meets or exceeds the configured **Quorum**, the state escalates to ODOWN.

## The Failover Consensus Protocol
Once ODOWN is reached, the failover process begins. However, only one Sentinel should orchestrate the failover to avoid chaos. 

1. **Leader Election (Raft-like):** The Sentinels use an epoch-based voting system to elect a Leader. A Sentinel requests votes from peers. To win, it must secure a **Majority** vote (which might be higher than the quorum).
2. **Replica Selection:** The Leader evaluates available replicas. It discards replicas that are disconnected, have high latency, or have an old replication offset.
3. **Promotion:** The Leader sends a `SLAVEOF NO ONE` command to the chosen replica, promoting it to master.
4. **Reconfiguration:** The Leader reconfigures the remaining replicas to replicate from the new master and updates DNS/clients via Pub/Sub notifications.

## Configuration and Code
A typical `sentinel.conf` configuration sets the master name, IP, port, and Quorum (2 in this case, out of 3 Sentinels).

```ini
# sentinel monitor <master-group-name> <ip> <port> <quorum>
sentinel monitor mymaster 127.0.0.1 6379 2

# Time before SDOWN is triggered
sentinel down-after-milliseconds mymaster 5000

# Time to wait for a failover to complete before trying again
sentinel failover-timeout mymaster 60000

# Number of replicas that can sync with the new master simultaneously
sentinel parallel-syncs mymaster 1
```

### Client Integration
Clients must be Sentinel-aware. Instead of hardcoding the Redis master IP, the client connects to the Sentinels to discover the current master.

```python
import redis
from redis.sentinel import Sentinel

# Connect to the Sentinel cluster
sentinel = Sentinel([('10.0.0.1', 26379), ('10.0.0.2', 26379), ('10.0.0.3', 26379)], socket_timeout=0.1)

# Discover the master
master = sentinel.master_for('mymaster', socket_timeout=0.1)
master.set('foo', 'bar')

# Discover a replica for read scaling
slave = sentinel.slave_for('mymaster', socket_timeout=0.1)
print(slave.get('foo'))
```

## Conclusion
Redis Sentinel bridges the gap between fast, single-node performance and distributed high availability. By relying on Quorums and a structured ODOWN state machine, Sentinel prevents split-brain partitioning and provides seamless, automated disaster recovery.
