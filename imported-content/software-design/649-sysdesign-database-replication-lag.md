# Sharded Database Scaling: Mitigating Replication Lag and Read-Your-Own-Writes Inconsistencies

## The Problem: Eventual Consistency and Stale Reads

In a high-throughput, sharded database topology, scaling read capacity typically involves provisioning asynchronous read replicas. A master node handles writes and streams changes (e.g., via WAL or binlog) to one or more read replicas. While this architecture successfully offloads read pressure, it introduces a critical temporal vulnerability: replication lag.

When a user submits a mutation (e.g., updating their profile) and immediately refreshes the page, the subsequent read query may hit a replica that has not yet processed the mutation. The result is a stale read, destroying the illusion of immediate consistency and violating the "Read-Your-Own-Writes" (RYOW) guarantee.

## Architectural Approaches to Mitigate Lag

Solving replication lag without sacrificing the performance benefits of read replicas requires intelligent routing at the application or data access layer.

### 1. Synchronous Replication (The Anti-Pattern for Scale)
Forcing the master to wait for replicas to acknowledge writes eliminates lag but couples write latency to the slowest replica and reduces system availability during network partitions.

### 2. Time-Bound Master Routing (The Heuristic)
A common pattern involves recording the timestamp of a user's last write. Subsequent reads from that specific user are routed to the master for a predefined window (e.g., 500ms). While simple, this approach relies on arbitrary magic numbers and can needlessly burden the master if replication is fast.

### 3. Log Position Tracking (The Deterministic Approach)
The most robust solution involves tracking the exact replication state. When a write occurs, the master returns the logical sequence number (LSN) or transaction ID. The client or API gateway caches this token. Subsequent reads include this token, and the database proxy ensures the query is routed to a replica that has caught up to (or exceeded) that specific LSN.

## ASCII Architecture: LSN-Aware Routing

```text
 [Client] 
    │ 1. Write (Name="Alice")
    ▼
 [API Gateway / Proxy] ─── 2. Write to Master ──▶ [Master DB (LSN: 100)]
    │                                                   │
    │ 3. Return Success + LSN=100                       │ 4. Async Replication
    ▼                                                   ▼
 [Client stores LSN=100 in session/cookie]         [Replica 1 (LSN: 98)]
                                                   [Replica 2 (LSN: 100)]
 [Client]
    │ 5. Read (Send LSN=100)
    ▼
 [API Gateway / Proxy] 
    │ 6. Evaluate Replicas
    │    - Replica 1: 98 < 100 (Reject)
    │    - Replica 2: 100 >= 100 (Accept!)
    └─── 7. Route Read to Replica 2 ────────────▶ [Replica 2]
```

## Implementation: RYOW with Token-Based Routing

Implementing LSN-aware routing requires middleware that understands database state. Here is a conceptual Go implementation of a smart connection pooler enforcing RYOW.

```go
package dbpool

import (
	"context"
	"sync"
	"time"
)

type Node struct {
	Address    string
	IsMaster   bool
	CurrentLSN int64
	sync.RWMutex
}

// Simulates fetching the latest applied LSN from a replica
func (n *Node) RefreshLSN() {
	// e.g., SELECT pg_last_wal_replay_lsn()
	// n.CurrentLSN = fetchedLSN
}

type Router struct {
	Master   *Node
	Replicas []*Node
}

// Write executes a mutation and returns the resulting LSN
func (r *Router) Write(ctx context.Context, query string, args ...interface{}) (int64, error) {
	// Execute on master
	// err := r.Master.Execute(query, args)
	
	// Fetch the LSN after write
	// newLSN := r.Master.GetInsertLSN()
	newLSN := int64(100) // Simulated
	return newLSN, nil
}

// Read routes to a replica that has caught up to the required LSN
func (r *Router) Read(ctx context.Context, requiredLSN int64, query string) (string, error) {
	for _, replica := range r.Replicas {
		replica.RLock()
		lsn := replica.CurrentLSN
		replica.RUnlock()

		if lsn >= requiredLSN {
			// Replica is fresh enough
			// return replica.Query(query)
			return "data", nil
		}
	}

	// Fallback 1: Wait and retry
	time.Sleep(50 * time.Millisecond)
	// (Implement robust retry logic here)

	// Fallback 2: Route to Master to guarantee consistency
	// return r.Master.Query(query)
	return "data_from_master", nil
}
```

## Considerations and Trade-offs

1. **State Management:** The client must propagate the LSN token. This is typically handled via HTTP cookies or custom headers to keep the API stateless.
2. **Master Fallback:** If all replicas lag significantly behind the required LSN, the router must fall back to the master. Under heavy load, a replication delay spike could trigger a thundering herd of reads to the master, risking total collapse. Implementing circuit breakers on master read fallbacks is essential.
3. **Granularity:** LSN tracking can be global (system-wide) or scoped to specific shards/partitions depending on the distributed database's underlying consensus protocol.

By shifting from heuristic time-delays to deterministic state tracking, systems can maintain strict RYOW guarantees while maximizing the horizontal scalability of read-heavy workloads.
