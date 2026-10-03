---
title: "Solving Replication Lag: Read-Your-Own-Writes with LSN-Aware Routing"
description: "Why asynchronous read replicas produce stale reads immediately after a write, and how to guarantee Read-Your-Own-Writes consistency with deterministic log-sequence-number routing instead of arbitrary time-based heuristics, with a working Go router."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "DEEP_DIVE"
tags:
  - "replication-lag"
  - "read-your-own-writes"
  - "database-replication"
  - "consistency"
  - "read-replicas"
---

# Solving Replication Lag: Read-Your-Own-Writes with LSN-Aware Routing

## The Problem: Eventual Consistency and Stale Reads

Scaling read capacity in a high-throughput database typically means adding asynchronous read replicas: a master node accepts writes and streams changes (via WAL or binlog) to one or more replicas, which absorb read traffic. This works well — until a user updates their profile and immediately refreshes the page, and the read query happens to land on a replica that hasn't yet applied that write. The user sees their own change silently disappear. This violates the **Read-Your-Own-Writes (RYOW)** guarantee, and it is one of the most common "why is production flaky" bugs in systems that add read replicas without thinking about routing.

## Architectural Approaches

### 1. Synchronous Replication — the anti-pattern for scale

Making the master wait for replica acknowledgement before confirming a write eliminates lag entirely, but couples write latency to the *slowest* replica and reduces availability the moment a network partition appears. This defeats the entire point of adding replicas.

### 2. Time-Bound Master Routing — a heuristic

Record the timestamp of a user's last write, and route that user's subsequent reads to the master for a fixed window (say, 500ms). Simple to implement, but the window is an arbitrary magic number: too short and you still see stale reads under real lag spikes; too long and you needlessly load the master even when replication is fast.

### 3. Log Position Tracking — the deterministic approach

Track replication state exactly. When a write completes, the master returns its Log Sequence Number (LSN) or transaction ID. The client (or an API gateway on its behalf) carries that token forward. On the next read, the token is sent along, and a routing proxy only sends the read to a replica whose applied LSN is at or beyond that token — falling back to the master if none qualify.

## LSN-Aware Routing, End to End

```text
 Client
    │ 1. Write (name = "Alice")
    ▼
 API Gateway / Proxy ──── 2. Write to master ────▶ Master DB (LSN: 100)
    │                                                     │
    │ 3. Return success + LSN=100                         │ 4. Async replication
    ▼                                                     ▼
 Client stores LSN=100 (session/cookie)          Replica 1 (LSN: 98)
                                                   Replica 2 (LSN: 100)
 Client
    │ 5. Read (send LSN=100)
    ▼
 API Gateway / Proxy
    │ 6. Evaluate replicas:
    │      Replica 1: 98  < 100  -> reject
    │      Replica 2: 100 >= 100 -> accept
    └─── 7. Route read to Replica 2 ───────────▶ Replica 2
```

## Implementation: RYOW-Enforcing Router in Go

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

// RefreshLSN pulls the latest applied LSN from a replica, e.g. via
// `SELECT pg_last_wal_replay_lsn()` on PostgreSQL.
func (n *Node) RefreshLSN(latest int64) {
	n.Lock()
	n.CurrentLSN = latest
	n.Unlock()
}

type Router struct {
	Master   *Node
	Replicas []*Node
}

// Write executes a mutation against the master and returns the resulting LSN
// so the caller can propagate it forward for RYOW-consistent reads.
func (r *Router) Write(ctx context.Context, query string, args ...interface{}) (int64, error) {
	// err := r.Master.Execute(ctx, query, args...)
	newLSN := r.Master.CurrentLSN + 1 // simplified: real LSNs come from the WAL
	r.Master.RefreshLSN(newLSN)
	return newLSN, nil
}

// Read routes to any replica that has caught up to requiredLSN, falling back
// to the master if none has, rather than serving a stale read.
func (r *Router) Read(ctx context.Context, requiredLSN int64, query string) (string, error) {
	for _, replica := range r.Replicas {
		replica.RLock()
		lsn := replica.CurrentLSN
		replica.RUnlock()

		if lsn >= requiredLSN {
			return queryNode(ctx, replica, query)
		}
	}

	// No replica is fresh enough yet — a short bounded wait can help under
	// typical sub-100ms lag, but must have a strict cap.
	select {
	case <-time.After(50 * time.Millisecond):
	case <-ctx.Done():
		return "", ctx.Err()
	}

	// Fall back to the master rather than risk serving stale data.
	return queryNode(ctx, r.Master, query)
}

func queryNode(ctx context.Context, n *Node, query string) (string, error) {
	// actual database query execution against n.Address
	return "result", nil
}
```

## Considerations and Trade-offs

1. **State propagation.** The LSN token must travel with the client — typically as an HTTP cookie or a custom response/request header pair — to keep the API layer itself stateless.
2. **Master fallback under load.** If replication lag spikes cluster-wide, every RYOW-sensitive read falls back to the master simultaneously, which can itself become a thundering-herd risk. Put a circuit breaker on master read-fallback traffic so a lag spike doesn't cascade into a master overload.
3. **Granularity.** LSN tracking can be global (a single number for the whole database) or scoped per shard/partition, depending on how your underlying replication and consensus protocol expose position information.

## Architectural Takeaway

Time-based heuristics for RYOW are a guess; LSN-based routing is a guarantee, because it reasons about the database's actual, observable replication state rather than an assumed lag window. The added complexity — token propagation, replica LSN polling, master-fallback circuit breaking — is the price of read replicas that never silently show a user their own write disappearing.
