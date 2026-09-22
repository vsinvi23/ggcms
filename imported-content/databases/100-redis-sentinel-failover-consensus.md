# Redis Sentinel: Cluster Failover and Consensus Protocols

## The Problem: Single Point of Failure
Redis is predominantly single-threaded and blazingly fast. In a standard production deployment, a master-replica topology is used: the master handles writes, and replicas asynchronously copy data and handle reads. However, if the master node crashes due to hardware failure or network partition, the replicas sit idly waiting for a master that no longer exists. 

Manual intervention to promote a replica to master is slow and error-prone, resulting in unacceptable application downtime. How do we achieve automated, resilient failover?

## The Solution: Redis Sentinel
Redis Sentinel is an out-of-the-box distributed system designed to monitor your Redis instances, detect failures, and automatically execute failover procedures without human intervention. Sentinel acts as the control plane for your Redis data plane.

### Mental Model: The Watchdogs
Think of Sentinels as independent watchdogs circling a flock of sheep (Redis nodes). If one watchdog thinks the shepherd (master) is missing, it barks. But the flock doesn't get a new shepherd until a majority of the watchdogs agree the shepherd is truly gone.

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

### 1. Monitoring and State Detection
Sentinels periodically ping all known Redis instances (masters and replicas). 
- **SDOWN (Subjective Down):** When a single Sentinel instance cannot reach the master for a configured `down-after-milliseconds` threshold, it marks the master as SDOWN. This is a local observation.
- **ODOWN (Objective Down):** Sentinel 1 then asks other Sentinels (via `SENTINEL is-master-down-by-addr`) if they also see the master as down. If a configured `quorum` (usually a majority, e.g., 2 out of 3) agree, the master is marked as ODOWN.

### 2. Leader Election
Once ODOWN is established, the Sentinels must decide *which* Sentinel will orchestrate the failover. They use a consensus algorithm similar to Raft. They hold an election using epochs (counters). The Sentinel that receives majority votes from its peers becomes the "Leader" for this specific failover epoch.

### 3. Failover Execution
The Leader Sentinel orchestrates the transition:
1. **Select:** It evaluates the replicas based on their priority, replication offset (who has the most up-to-date data), and run ID.
2. **Promote:** It sends the `REPLICAOF NO ONE` command to the chosen replica, promoting it to the new master.
3. **Reconfigure:** It sends `REPLICAOF new-master-ip port` to the other replicas so they sync from the new master.
4. **Broadcast:** It broadcasts the new cluster topology to clients.

## Configuration and Architecture
A robust Sentinel setup requires at least three Sentinel instances running on isolated infrastructure to prevent split-brain scenarios. If you only have two Sentinels, a network partition separating one Sentinel and the master from the other Sentinel leaves neither side with a majority.

### sentinel.conf Example
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
Applications do not connect directly to the Redis master. Instead, they connect to the Sentinels.
When an application needs to write data, it asks Sentinel:
```bash
> SENTINEL get-master-addr-by-name mymaster
1) "192.168.1.50"
2) "6379"
```
The client library then opens a connection to the returned IP. During a failover, client libraries utilize pub/sub on the Sentinel connections to receive immediate notification of topology changes, updating their connection pools dynamically.

## Conclusion
Redis Sentinel elevates Redis from a single-node cache to a highly available datastore. By utilizing robust consensus mechanisms for failure detection and leader election, Sentinel ensures that your application survives infrastructure failures with minimal interruption. Proper quorum configuration and independent infrastructure for Sentinels are paramount to success.
