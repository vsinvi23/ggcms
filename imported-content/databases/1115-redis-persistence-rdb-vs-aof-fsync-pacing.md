# Redis Persistence: Snapshotting (RDB) vs Append-Only Files (AOF) Fsync Policies

## The Problem: In-Memory Volatility vs Disk Latency
Redis is an in-memory data store. Its blistering performance (capable of millions of operations per second) comes from avoiding disk I/O entirely during the hot path of read/write operations. However, RAM is volatile. If the server loses power or crashes, all data is lost. 

To bridge the gap between in-memory speed and disk durability, Redis offers two distinct persistence mechanisms: **RDB (Redis Database Backup)** and **AOF (Append-Only File)**. Choosing and configuring them correctly requires balancing data safety against latency spikes.

## RDB: Point-in-Time Snapshots
RDB persistence creates a compact, binary representation of your entire dataset at specific intervals.

### The Fork Architecture
Because Redis is single-threaded, saving gigabytes of data to disk on the main thread would block all client requests for seconds or minutes. Redis solves this using the POSIX `fork()` system call.

```text
[ Redis Main Process (PID 100) ]
        |
        | fork() creates a child
        v
[ Child Process (PID 101) ] -----> Writes Dataset to Temp RDB File
        |
        | (On completion, replace old dump.rdb)
        v
[ /var/lib/redis/dump.rdb ]
```

When `fork()` is called, the OS utilizes Copy-on-Write (CoW) memory semantics. The child process receives an exact, point-in-time snapshot of memory without actually duplicating the RAM. The main process continues serving clients. If the main process modifies data during the save, the OS copies only those modified memory pages.

### Configuration
```ini
# Save if 1 key changed in 900s, 10 keys in 300s, or 10000 in 60s.
save 900 1
save 300 10
save 60 10000
```
**Pros:** Compact files, very fast restarts, virtually zero performance impact on the main thread.
**Cons:** If Redis crashes, you lose all data modified since the last snapshot. 

## AOF: The Append-Only File
To achieve near-perfect durability, Redis provides AOF. Instead of snapshotting memory, AOF logs every single write operation (e.g., `SET`, `HSET`) received by the server to an append-only text file.

When Redis restarts, it literally replays the AOF log to reconstruct the dataset.

### The Fsync Dilemma
Logging every write to disk introduces disk I/O latency back into the equation. To mitigate this, Redis uses the `fsync()` system call. You can configure *when* Redis flushes the OS file buffer to physical disk storage.

```ini
# Option 1: No fsync. Let the OS handle it (Fastest, least safe)
appendfsync no 

# Option 2: Fsync every second (Balanced, default)
appendfsync everysec

# Option 3: Fsync after every write (Slowest, perfectly safe)
appendfsync always
```

### The `everysec` Compromise
With `appendfsync everysec`, a background thread performs the `fsync` once per second. The main thread simply appends to the in-memory OS buffer. 
*   **Latency:** The main thread remains unblocked (usually).
*   **Durability:** In the worst-case hardware failure, you lose a maximum of 1 second of data.

### AOF Rewrite (Compaction)
An append-only log grows infinitely. If you increment a counter 1,000 times, the AOF will have 1,000 commands, even though the final state is just one number. 
To fix this, Redis periodically triggers an **AOF Rewrite** (again using `fork()`). The child process generates the shortest possible sequence of commands needed to recreate the current memory state, resulting in a drastically smaller log file.

## Conclusion
Modern Redis deployments rarely choose just one. The best practice is a hybrid approach:
1.  Enable **AOF with `appendfsync everysec`** for robust durability and fast recovery up to the last second.
2.  Enable **RDB snapshots (e.g., daily or hourly)** for compact, easily transportable disaster recovery backups. 

By leveraging POSIX `fork()` and background threads, Redis successfully decouples disk latency from the main execution loop, allowing engineers to finely tune the durability/performance trade-off.
