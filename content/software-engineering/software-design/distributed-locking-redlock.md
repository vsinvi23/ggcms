---
title: "Distributed Locking: Single-Instance Redis Locks vs Redlock"
description: "Why a single Redis instance is not a safe distributed lock under replication failover, the SETNX/PX/Lua pattern for safe single-instance locking, and how the Redlock algorithm achieves majority-quorum locking across independent Redis masters."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "DEEP_DIVE"
tags:
  - "distributed-locking"
  - "redis"
  - "redlock"
  - "mutual-exclusion"
  - "distributed-systems"
---

# Distributed Locking: Single-Instance Redis Locks vs Redlock

## The Problem: Concurrency Across Machines

In a single-process application, protecting a critical section from concurrent access is trivial — a `sync.Mutex` in Go, `synchronized` in Java, or any OS-level mutex/semaphore. But a modern application is replicated across dozens of servers or Kubernetes pods. A local in-memory mutex on Server A knows nothing about a thread executing on Server B. If both servers try to deduct funds from the same account simultaneously, the result is a classic race condition — the "double spend" problem.

When database-level locking (`SELECT ... FOR UPDATE`) is too slow, too coarse-grained, or must span multiple distinct databases and third-party APIs, the system needs a way to guarantee mutual exclusion across the entire distributed cluster: a **distributed lock**.

## The Mental Model: The Centralized Ledger

A distributed lock needs a fast, highly available centralized datastore. Redis is the industry standard. Before executing a critical section, a server asks Redis: "is the lock available?"

```text
[ Server A ]          [ Server B ]
    |                      |
    | 1. SETNX (lock!)     |
    |-------------------> [ REDIS ]
    | <--- OK (acquired)   |
    |                      | 2. SETNX (lock!)
    |                      |-------------------> [ REDIS ]
    |                      | <--- FAIL (locked)
[ CRITICAL SECTION ]       |
    |                      | (Server B waits...)
    | 3. DEL (unlock!)     |
    |-------------------> [ REDIS ]
                           | 4. SETNX (lock!) (retry)
                           |-------------------> [ REDIS ]
                           | <--- OK (acquired)
```

## The Naive Approach: Single-Instance Redis Lock

The simplest implementation uses Redis `SET` with the `NX` (Not eXists) flag, so the lock is created only if it doesn't already exist, plus an expiration `PX` (in milliseconds) to guarantee the lock is eventually released even if the holder crashes before calling unlock:

```bash
# Atomic: set key "resource_123" to a unique token, ONLY if it doesn't
# exist, and expire it in 5000ms.
SET resource_123 "unique_token_xyz" NX PX 5000
```

Unlocking cannot be a plain `DEL`. If Server A's operation runs longer than 5 seconds, the lock expires and Server B acquires it. If Server A then finishes and runs `DEL`, it just deleted Server B's lock. The fix is a Lua script that only deletes the key if the stored token matches the caller's own token:

```lua
-- Safe unlock: only delete if this client still owns the lock
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
```

### The Flaw of the Single Instance

This lock is fast and adequate for non-critical coordination, but it has a fatal flaw: **the Redis node is a single point of failure.** Adding a replica for high availability doesn't fix it, because Redis replication is *asynchronous*:

1. Server A acquires the lock on the Redis master.
2. The master crashes *before* the lock replicates to the replica.
3. The replica is promoted to master.
4. Server B requests the lock from the new master — and succeeds, because the new master never saw Server A's lock.

Now both Server A and Server B believe they hold the lock. Mutual exclusion is broken.

## The Robust Solution: Redlock

To provide stronger safety guarantees, Redis's creator Salvatore Sanfilippo proposed the **Redlock** algorithm. Instead of one master with a replica, Redlock uses `N` (typically 5) totally independent Redis master nodes that do not replicate to each other.

To acquire a lock, the client:

1. Records the current time in milliseconds.
2. Tries to acquire the lock, sequentially, on all 5 instances using the same key and the same random value, with a short per-request timeout so a dead node doesn't stall the whole attempt.
3. Computes elapsed time. **The lock counts as acquired only if the client locked the majority (≥ 3 of 5) instances, and the total elapsed time is less than the lock's validity duration.**
4. If acquired, the effective validity time is the original validity time minus the elapsed time.
5. If acquisition failed (couldn't reach majority, or took too long), the client immediately sends unlock commands to *all 5* instances.

```text
                  +--> [ Redis Master 1 ]  LOCKED
                  |
                  +--> [ Redis Master 2 ]  LOCKED
 [ Client ] ----->|
                  +--> [ Redis Master 3 ]  LOCKED
                  |
                  +--> [ Redis Master 4 ]  (crashed / unreachable)
                  |
                  +--> [ Redis Master 5 ]  (timeout, no response)

  Result: 3/5 locked = MAJORITY -> lock is considered ACQUIRED
```

## Trade-offs and the Clock Skew Problem

Redlock solves the asynchronous-replication failure mode, but at a cost: it introduces network latency overhead from talking to 5 nodes for every lock acquisition, and it depends heavily on **system clocks**. If Redis Master 1 experiences a sudden forward clock jump, its copy of the lock expires prematurely. A second client could then lock nodes 1, 4, and 5 — and now two clients believe they hold the lock simultaneously.

## Conclusion

Use a single-instance Redis lock for efficiency optimizations where a rare collision just costs some wasted CPU — e.g., preventing 10 workers from redundantly performing the same heavy computation. Use Redlock (or a real consensus system like ZooKeeper or etcd) when correctness actually matters — e.g., a lock guarding a financial balance deduction, where a collision means losing money. Distributed coordination is inherently hard; choose the trade-off deliberately rather than by default.

## Key Takeaways

- A local in-memory mutex provides no protection once an application is replicated across multiple hosts — mutual exclusion has to be centralized.
- A single-instance Redis lock (`SET NX PX` + Lua-scripted unlock) is fast, but a master/replica failover can hand the "same" lock to two clients due to asynchronous replication.
- Redlock requires majority acquisition across N independent Redis masters, closing that failover gap at the cost of extra network round-trips and clock-skew sensitivity.
- Pick the lock strength to match the cost of a collision, not by default reaching for the most robust (and most expensive) option.
