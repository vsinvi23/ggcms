# Redis Persistence: Snapshotting (RDB) vs Append-Only Files (AOF) Fsync Policies

## The Problem: The High-Performance Persistence Paradox

Redis is a sub-millisecond, in-memory key-value database. Because its active state lives entirely in RAM, any unexpected server crash, power failure, or operating system panic results in instant, total data loss. 

To prevent this, Redis must persist its memory state to non-volatile disk. This introduces a classic system design trade-off: **how to write memory state to slow disks without blocking the single-threaded Redis client loop.**

Choosing the wrong persistence strategy leads to severe consequences:
- **RDB-only** setups risk losing minutes of transaction history if a crash occurs between snapshots.
- **AOF-only** setups can suffer from write amplification and disk I/O saturation, leading to severe latency spikes and stalled transaction queues.

---

## Technical Architecture: Dual Persistence Engines

Redis provides two independent persistence engines: **RDB (Redis Database)** snapshotting and **AOF (Append-Only File)** logging.

```
                         +--------------------------+
                         |      Redis Client        |
                         +--------------------------+
                               |              ^
                 1. Write Cmd  |              | 5. Fast ACK
                               v              |
                         +--------------------------+
                         |    Redis Main Thread     | <--- (Blocked if disk is saturated)
                         +--------------------------+
                           /                      \
          2. Modify State /                        \ 3. Append to AOF Buffer
                         v                          v
                  +------------+             +--------------+
                  | Memory RAM |             |  AOF Buffer  |
                  +------------+             +--------------+
                     | (fork)                       |
                     v                              | 4. background fsync
              +--------------+                      v
              | Child Process|               +--------------+
              | (Writes RDB) |               |  OS Cache    |
              +--------------+               +--------------+
                     |                              |
                     v (Sequential)                 v (fsync)
              +--------------+               +--------------+
              |   RDB File   |               |   AOF File   |
              +--------------+               +--------------+
```

### 1. RDB: Point-in-Time Snapshotting
RDB creates compact, single-file binary representations of the Redis dataset at a specific point in time.
- **Process:** The parent process calls `fork()` to create a child process.
- **Copy-on-Write (COW):** The child process writes the RDB file to disk while the main thread continues serving client queries. Thanks to OS-level Copy-on-Write, the parent and child share the same memory pages. If the parent receives a write command, the OS duplicates only the targeted memory page.
- **Trade-off:** High recovery speed but poor durability. If Redis crashes, all updates made after the last successful snapshot are lost.

### 2. AOF: Append-Only Logging
AOF logs every write command received by the server to an append-only file. 
- **Process:** Redis appends commands first to an internal user-space buffer (`aof_buf`), then flushes them to the OS page cache, and finally forces the disk controller to write them to physical storage using `fsync`.
- **BGREWRITEAOF:** To prevent AOF files from growing infinitely, Redis runs a background rewrite. The child process rebuilds the shortest sequence of commands needed to construct the current dataset in memory.

---

## Fsync Policies and the Main-Thread Block Risk

The behavior of the AOF engine is governed by the `appendfsync` configuration. This choice directly determines the balance between durability and performance.

### `appendfsync always`
The main thread writes the command to the OS cache and calls `fsync()` on the file descriptor before returning an acknowledgment to the client. This guarantees high durability (zero data loss) but binds write throughput to disk I/O limits, reducing Redis performance to mechanical HDD/SSD speeds.

### `appendfsync everysec`
Redis appends commands to `aof_buf`. A background system thread calls `fsync()` once every second. This balance provides high performance while limiting data loss to at most 1–2 seconds.

### `appendfsync no`
Redis flushes the buffer to the OS page cache but does not issue an explicit `fsync()`. The operating system flushes the data to disk on its own schedule (usually every 30 seconds). This offers the highest performance but carries the highest risk of data loss.

### The Hidden Bottleneck: Active Fsync Pacing
Even when using `appendfsync everysec`, the single-threaded event loop can still experience performance spikes.

If a background thread is currently executing an `fsync()` call and the disk controller becomes saturated, that `fsync()` call blocks. If the main thread tries to append more data and detects that the background `fsync` has been running for more than two seconds, it will block itself to prevent memory exhaustion. This is called **AOF active fsync pacing**, and it stalls all clients.

---

## Production Config: Optimized Dual Persistence

For high-write production systems requiring robust durability with minimal latency spikes, apply these optimized parameters in `/etc/redis/redis.conf`.

```conf
# 1. Enable both RDB (for fast boot-strapping) and AOF (for durability)
save 900 1
save 300 10
save 60 10000

appendonly yes
appendfilename "appendonly.aof"

# 2. Configure AOF flush frequency
appendfsync everysec

# 3. Prevent main thread blocking during background snapshotting/AOF rewriting
# This suspends fsyncs while BGSAVE or BGREWRITEAOF is active
no-appendfsync-on-rewrite yes

# 4. Automate AOF Rewrite to prevent infinite disk consumption
auto-aof-rewrite-percentage 100      # Trigger rewrite when file size doubles
auto-aof-rewrite-min-size 128mb      # Minimum size before triggering rewrites

# 5. Handle corrupted AOF files gracefully on startup
aof-load-truncated yes
```

---

## Diagnostic Commands for Persistence Monitoring

```bash
# 1. View current persistence stats, background save statuses, and COW memory usage
redis-cli INFO persistence

# Example Output Snippet:
# rdb_last_bgsave_status:ok
# rdb_last_cow_size:4194304             # Bytes allocated for Copy-On-Write page splits
# aof_enabled:1
# aof_pending_bio_fsync:0               # Number of fsyncs queued in background threads
# aof_last_bgrewrite_status:ok

# 2. Trigger an asynchronous background snapshot save
redis-cli BGSAVE

# 3. Trigger manual AOF compaction
redis-cli BGREWRITEAOF
```
```bash
# 4. Recover a corrupted AOF file using the CLI utility
redis-check-aof --fix /var/lib/redis/appendonly.aof
```
*Tip: Always measure `rdb_last_cow_size` during high write loads. If Copy-On-Write allocations approach the system's available memory, configure `sysctl vm.overcommit_memory=1` to prevent OS-level out-of-memory process terminations.*
