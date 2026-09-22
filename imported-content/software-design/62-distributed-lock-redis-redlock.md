# Distributed Locking: Redlock vs Single-instance Redis locks

## The Problem: Concurrency in Distributed Systems
In a single-process application, protecting a critical section of code from concurrent modification is trivial. You use standard operating system primitives like Mutexes or Semaphores provided by your language runtime (e.g., `sync.Mutex` in Go or `synchronized` in Java).

However, in a modern cloud environment, your application is replicated across dozens of servers or Kubernetes pods. A local memory mutex on Server A knows nothing about a thread executing on Server B. If both servers attempt to deduct funds from the same user's account simultaneously, you encounter a race condition leading to data corruption (the classic "double spend" problem).

When database-level locking (like `SELECT ... FOR UPDATE`) is too slow, too coarse, or spans across multiple distinct databases and third-party APIs, we need a mechanism to ensure mutually exclusive access across the entire distributed cluster. We need a **Distributed Lock**.

## The Mental Model: The Centralized Ledger
A distributed lock requires a centralized datastore that is incredibly fast and highly available. Redis is the industry standard for this. 

The basic premise is simple: before a server executes a critical piece of code, it asks Redis, "Is the lock available?" 
- If yes, Redis registers that the server holds the lock, and the server proceeds.
- If no, the server backs off and retries.

```text
[ Server A ]          [ Server B ]
    |                      |
    | 1. SETNX (Lock!)     |
    |-------------------> [ REDIS ]
    | <--- OK (Acquired)   |
    |                      | 2. SETNX (Lock!)
    |                      |-------------------> [ REDIS ]
    |                      | <--- FAIL (Locked)
[ CRITICAL SECTION ]       |
    |                      | (Server B waits...)
    | 3. DEL (Unlock!)     |
    |-------------------> [ REDIS ]
                           | 4. SETNX (Lock!) (Retry)
                           |-------------------> [ REDIS ]
                           | <--- OK (Acquired)
```

## The Naive Approach: Single-Instance Redis Lock
The simplest way to implement a distributed lock is using a single Redis instance with the `SET` command. 

We use the `NX` (Not eXists) flag to ensure the lock is only created if it doesn't already exist. Crucially, we must add an expiration time `PX` (Time to Live) to prevent deadlocks. If Server A acquires the lock and then crashes before releasing it, the TTL ensures the lock eventually expires so other servers can proceed.

```bash
# Atomic command: Set the key "resource_123" to a unique token 
# ONLY if it doesn't exist, and expire it in 5000 milliseconds.
SET resource_123 "unique_token_xyz" NX PX 5000
```

To release the lock, the server cannot just run a `DEL` command. Why? Because if Server A takes longer than 5 seconds, its lock expires. Server B acquires the lock. Then Server A finishes and issues `DEL`. Server A just accidentally deleted Server B's lock! 

To safely unlock, we must use a Lua script to ensure the server only deletes the lock *if the unique token matches its own*.

```lua
-- Lua script for safe unlocking
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
```

### The Flaw of the Single Instance
The single-instance lock is fast and works well for non-critical coordination. But it has a fatal flaw: **The Redis node is a single point of failure.** 

If you add a Redis replica for High Availability, Redis replication is *asynchronous*. 
1. Server A acquires the lock on the Redis Master.
2. The Master crashes *before* the lock replicates to the Replica.
3. The Replica is promoted to Master.
4. Server B requests the lock from the new Master. It succeeds. 

Now, Server A and Server B both hold the lock. Mutual exclusion is broken.

## The Robust Solution: Redlock Algorithm
To provide strict safety guarantees for distributed locks, Redis creator Salvatore Sanfilippo proposed the **Redlock algorithm**.

Instead of a single Redis master-replica setup, Redlock uses `N` (usually 5) totally independent Redis master nodes. They don't replicate to each other.

To acquire a lock, the client:
1. Gets the current time in milliseconds.
2. Tries to acquire the lock in all 5 instances sequentially, using the same key and same random value. It uses a very short timeout for these requests to avoid blocking on a dead node.
3. The client computes how much time elapsed to acquire the locks. **The lock is considered acquired ONLY IF the client was able to lock the majority (at least 3 out of 5) of the instances**, AND the total elapsed time is less than the lock validity time.
4. If acquired, the actual validity time of the lock is the initial validity time minus the elapsed time.
5. If the client failed to acquire the lock (couldn't get 3/5, or took too long), it immediately sends unlock commands to *all 5* instances.

```text
                  +--> [ Redis Master 1 ]
                  |
                  +--> [ Redis Master 2 ]
 [ Client ] ----->|
                  +--> [ Redis Master 3 ]
                  |
                  +--> [ Redis Master 4 ] (Crashed)
                  |
                  +--> [ Redis Master 5 ]
```
*Client successfully locks 1, 2, and 3. Majority achieved. Lock acquired.*

## Trade-offs and the Clock Skew Problem
Redlock solves the async replication failure, but it introduces network latency overhead (talking to 5 nodes). 

Furthermore, Redlock heavily relies on **system clocks**. If Redis Master 1 experiences a sudden clock jump forward, the lock expires prematurely on that node. Another client could then lock Node 1, 4, and 5, resulting in two clients holding the lock.

**Conclusion:** 
Use the single-instance Redis lock for efficiency optimizations (e.g., preventing 10 workers from doing the same heavy computation simultaneously). If a collision happens, it just costs a bit of CPU.

Use Redlock (or robust consensus systems like Zookeeper/etcd) for strict correctness (e.g., deducting financial balances where a collision means losing money). Distributed coordination is hard; choose your trade-offs wisely.