# Redis Persistence: Snapshotting (RDB) vs Append-Only Files (AOF) Fsync Policies

## The Problem: Data Volatility in In-Memory Datastores
Redis operates entirely in memory, delivering sub-millisecond read/write latency. The architectural trade-off is volatility: a process crash, server reboot, or power failure results in total data loss. For caching architectures, this might just mean a temporary cache stampede. But when Redis is used as a primary database, message queue, or session store, data durability is mandatory. 

## The Solution: RDB and AOF
Redis provides two distinct persistence mechanisms to bridge the gap between RAM and Disk: RDB (Redis Database) snapshots and AOF (Append-Only File). Understanding their internal mechanics and tuning `fsync` policies is critical for balancing durability SLAs with peak performance.

### RDB (Redis Database) Snapshotting
RDB performs point-in-time snapshots of the dataset to disk.

**Technical Architecture:**
When a save is triggered, the main Redis process forks a child process using the OS `fork()` system call. The child process utilizes Linux Copy-on-Write (CoW) semantics to safely iterate over the memory space and write a highly compact, binary `.rdb` file to disk. The main thread continues serving client requests completely unblocked.

```text
[ Redis Main Thread ] ---> (Client Requests)
        |
      fork()
        v
[ Child Process ] ---> Writes binary `dump.rdb`
```

**Pros:** Extremely compact files, fast restarts, zero impact on main thread I/O.
**Cons:** Data loss window. If configured to save every 5 minutes, a crash at 4m:59s loses all writes in that window.

### AOF (Append-Only File)
To achieve sub-second durability, AOF logs every single write operation (e.g., `SET`, `INCR`) received by the server to a log file. On restart, Redis reconstructs the dataset by replaying this log.

**Technical Architecture:**
Write commands are appended to an AOF buffer in memory. The critical configuration is when this buffer is flushed to disk via the `fsync()` system call.

```text
[ Client Write ] -> [ Redis Memory ] -> [ AOF Buffer ] -> fsync() -> [ appendonly.aof ]
```

AOF files grow indefinitely. To prevent disk exhaustion, Redis occasionally forks a background thread to rewrite and compress the AOF (e.g., rewriting 100 `INCR` commands into a single `SET` command).

### The `fsync` Conundrum
The AOF `appendfsync` configuration dictates the durability vs. latency trade-off:

1. **`appendfsync always`**: Redis calls `fsync` after *every single write*. This provides maximum durability (zero data loss) but introduces massive disk I/O latency, crippling Redis's performance.
2. **`appendfsync everysec`**: (The Golden Standard). Redis delegates `fsync` to a background thread that executes once per second. You risk at most 1 second of data loss, while the main thread operates at near-native memory speeds.
3. **`appendfsync no`**: Redis relies entirely on the OS page cache to flush data to disk (typically every 30 seconds). Highest performance, highest risk.

### Code: redis.conf Persistence Tuning
Modern architectures frequently combine both: RDB for fast restarts and off-site backups, and AOF for immediate durability.

```ini
# --- RDB Configuration ---
# Save if 100 keys changed in 60 seconds
save 60 100
dbfilename dump.rdb

# --- AOF Configuration ---
appendonly yes
appendfilename "appendonly.aof"

# Fsync Policy: 1 second data loss window
appendfsync everysec

# AOF Rewrite thresholds
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
```

By leveraging `appendfsync everysec` and utilizing background background forks, Redis engineers can secure data durability without sacrificing the extreme throughput that defines the database.