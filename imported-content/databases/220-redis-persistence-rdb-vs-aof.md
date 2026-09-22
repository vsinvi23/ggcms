# Redis Persistence: Snapshotting (RDB) vs Append-Only Files (AOF) Fsync Policies

### The Problem: Volatility in In-Memory Datastores

Redis operates entirely in memory, delivering microsecond latency and exceptionally high throughput. However, RAM is volatile. If the Redis process crashes, the server reboots, or power is lost, all data residing in memory evaporates. 

To bridge the gap between high-speed caching and durable database requirements, Redis offers persistence mechanisms. Understanding how to configure these mechanisms is critical to balancing your application's tolerance for data loss against the strict performance requirements of your workload.

### The Mental Model: RDB vs. AOF

Redis provides two primary mechanisms for persistence: **RDB (Redis Database)** and **AOF (Append-Only File)**.

#### 1. RDB: Point-in-Time Snapshots
RDB creates compact, binary representations of the entire dataset at specific intervals. 

When a snapshot is triggered (either manually via `BGSAVE` or automatically based on configuration), the main Redis process uses the `fork()` system call. The child process receives a copy-on-write view of the memory and writes the dataset to a `.rdb` file on disk, while the parent process continues serving client requests without blocking.

```text
[Main Redis Process] --fork()--> [Child Process] 
       |                               |
  (Serves Clients)               (Writes memory to dump.rdb)
```

**Pros:** Extremely fast restarts, minimal performance impact during normal operation, highly compact backups.
**Cons:** High potential for data loss. If Redis crashes, all writes since the last snapshot are lost. Forking can cause latency spikes on massive datasets if memory paging is slow.

#### 2. AOF: The Append-Only File
AOF logs every write operation received by the server to a file on disk. When Redis restarts, it replays the AOF to reconstruct the exact state of the dataset.

```text
Client -> SET key value -> [Main Redis Process] -> (Memory updated)
                                  |
                                  +-> [Appends "SET key value" to appendonly.aof]
```

**Pros:** Superior durability. Minimal to zero data loss depending on the `fsync` policy.
**Cons:** The AOF file grows infinitely large and requires periodic rewriting. Slower restart times (replaying operations). Higher disk I/O overhead.

### The Crucial Configuration: AOF Fsync Policies

When using AOF, Redis issues write commands to the operating system's buffers. However, writing to an OS buffer does not guarantee the data is on the physical disk platter. The OS dictates when buffers are flushed. To force the OS to write to physical media, Redis issues an `fsync()` system call.

The performance versus durability trade-off of AOF is entirely governed by the `appendfsync` configuration directive.

#### 1. `appendfsync always`
Redis calls `fsync()` after *every single write command* before returning success to the client.

*   **Durability:** Perfect. No data loss even on power failure.
*   **Performance:** Catastrophic. Disk I/O becomes the bottleneck. A Redis instance capable of 100k ops/sec might drop to 500 ops/sec. Use this only when absolutely zero data loss is a strict regulatory requirement.

#### 2. `appendfsync everysec` (The Default)
Redis writes to the OS buffer synchronously, but a background thread calls `fsync()` only once per second.

*   **Durability:** Excellent. In the worst-case scenario (a hard power failure), you lose exactly one second of data.
*   **Performance:** Almost identical to having no persistence. Disk I/O is batched and handled asynchronously, maintaining Redis's high throughput while providing a strong safety net. This is the recommended setting for 99% of use cases.

#### 3. `appendfsync no`
Redis writes to the OS buffer and never calls `fsync()`. It relies entirely on the Linux kernel's page cache flushing policy (usually every 30 seconds).

*   **Durability:** Poor. A crash could wipe out up to 30 seconds of writes.
*   **Performance:** Maximum throughput, limited only by network and CPU.

### AOF Rewriting: Taming the Unbounded Log

Because AOF logs every operation, it grows endlessly. If a key is incremented 1,000 times, the AOF contains 1,000 operations. 

Redis mitigates this via **AOF Rewriting**. Similar to RDB, Redis forks a child process. The child process reads the *current in-memory dataset* and writes a new, compressed AOF file containing the shortest sequence of commands needed to rebuild the current state. The 1,000 increments are collapsed into a single `SET` command. 

### Best Practices: The Hybrid Approach

Modern Redis (versions 4.0+) supports a hybrid RDB+AOF mode. 

During an AOF rewrite, the child process writes the current state as a binary RDB payload into the AOF file, and then appends only the new AOF operations that occur during the rewrite. 

This hybrid approach provides the best of both worlds: the fast restart and compaction of RDB, combined with the granular durability of AOF `everysec`. When configuring Redis for critical workloads, enable AOF with `appendfsync everysec` and ensure `aof-use-rdb-preamble` is set to `yes`.