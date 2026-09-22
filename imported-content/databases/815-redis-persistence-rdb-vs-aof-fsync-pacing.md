# Redis Persistence: Snapshotting (RDB) vs Append-Only Files (AOF) Fsync Policies

## The Problem: The Performance-Durability Dilemma in In-Memory Datastores

Redis is an in-memory key-value database designed for high performance, with write latencies measured in microseconds. However, because its active state resides entirely in volatile RAM, an unexpected hardware crash, power outage, or OS panic results in total data loss. 

To prevent this, Redis offers persistence options, but administrators face a critical engineering conflict:
* **The Latency Trap:** Attempting to force synchronous, immediate disk writes on every single modification defeats the purpose of an in-memory database, dropping throughput from hundreds of thousands of operations per second to the mechanical limits of disk I/O.
* **The Data Loss Trap:** Relying on coarse, infrequent disk snapshot intervals risks losing minutes of highly valuable customer transactions during a crash.

Choosing and tuning the correct persistence strategy requires a detailed understanding of Redis persistence internals and physical system calls.

## The Architecture: Internals of RDB and AOF

Redis provides two core persistence mechanisms: **RDB (Redis Database Snapshot)** and **AOF (Append-Only File)**.

```
                              +-------------------------+
                              |   Client Write Command  |
                              +-------------------------+
                                           |
                                           v
                             +---------------------------+
                             |   Redis Memory Database   |
                             +---------------------------+
                                    /             \
    [Asynchronous BGSAVE via fork()]               \ [Immediate Command Append]
                                  /                 v
                                 v             +-----------------+
                    +--------------------+     |   AOF Buffer    |
                    | Parent Process RAM |     +-----------------+
                    |   (Dirty Pages)    |              |
                    +--------------------+              v (write() call)
                    /       \                  +-----------------+
        Copy-On-Write        \                 |  OS Page Cache  |
              v               v                +-----------------+
+-----------------------+  +-----------+                |
| Child Process Snapshot|  | RDB File  |                +--> appendfsync always   (Sync now)
| (Reads original pages)|  +-----------+                +--> appendfsync everysec  (1s BG Thread)
+-----------------------+                               +--> appendfsync no       (OS managed)
```

### 1. Redis Database Snapshotting (RDB)

RDB is a compact, point-in-time binary representation of the entire Redis database state. 

* **The Fork System Call:** To create an RDB snapshot without blocking active traffic, Redis calls the Linux `fork()` system call to create a child process. 
* **Copy-On-Write (COW):** The operating system uses Copy-On-Write memory mapping. The child process shares the physical memory pages of the parent. If a client executes a write command during the snapshot, the OS duplicates only the targeted memory page for the parent, leaving the child process's view of memory static.
* **Trade-offs:** RDB has virtually zero performance impact on the parent process during normal operations and permits extremely fast database recoveries. However, if the server crashes, all writes executed after the last snapshot run are permanently lost. Additionally, running `fork()` on systems with very large datasets and high write volumes can cause significant latency spikes (fork pauses).

### 2. Append-Only Files (AOF) and Fsync Pacing

AOF tracks state by recording every single write command received by Redis sequentially into an append-only log file on disk.

When a write command runs, the command is formatted into Redis Serialization Protocol (RESP) and appended to `server.aof_buf` in RAM. To persist this buffer to physical disk, Redis executes two system calls:
1. `write(fd, buf, len)`: Copies data from the user-space Redis buffer into the kernel-space **OS Page Cache**. This system call is non-blocking and extremely fast, but the data is still in volatile memory. If the power fails, page cache data is lost.
2. `fsync(fd)`: Forces the OS kernel to flush the page cache data directly to the physical storage device. This is a blocking system call.

To balance latency and durability, Redis supports three distinct **Fsync Pacing Policies** configured via the `appendfsync` parameter:

| Policy | Internals | Durability | Write Latency |
| :--- | :--- | :--- | :--- |
| `always` | Executed after every transaction. Redis calls `fsync()` before sending a success reply to the client. | Maximum (0 data loss). | Extremely high (limited by disk write speeds). |
| `everysec` | The main thread calls `write()` on every command. A separate background thread calls `fsync()` once every second. | High (maximum 1–2 seconds of data loss). | Very low (optimal balance of safety and speed). |
| `no` | Redis calls `write()`, but never calls `fsync()`. The OS controls the physical flush schedule (usually every 30 seconds). | Low (unpredictable data loss). | Minimal (fastest). |

### AOF Rewriting (Log Compaction)

As write commands accumulate, the AOF file grows indefinitely. To prevent disk exhaustion, Redis executes an asynchronous **AOF Rewrite** (`BGREWRITEAOF`). 

Redis forks a child process. The child scans the active database state in RAM and writes the minimal, optimal sequence of commands needed to rebuild the exact same state to a temporary file. Once complete, Redis swaps the files.

## Practical Configuration and Monitoring Runbook

### Optimized `redis.conf` Configuration
This profile balances durability and write throughput, combining RDB and AOF with safe concurrency guards:

```ini
# --- RDB Snapshot Rules (Fail-safe backup) ---
save 900 1       # Save if 1 key changes in 15 min
save 300 10      # Save if 10 keys change in 5 min
save 60 10000    # Save if 10000 keys change in 60 sec

# Stop writes if snapshotting fails (safety switch)
stop-writes-on-bgsave-error yes
rdbcompression yes
dbfilename dump.rdb
dir /var/lib/redis

# --- AOF Settings (Continuous durability) ---
appendonly yes
appendfilename "appendonly.aof"

# Fsync Policy Tuning (The Industry Standard)
appendfsync everysec

# Prevent fsync blocks during intensive background RDB/AOF writes
no-appendfsync-on-rewrite yes

# Automatic AOF Rewrite triggers
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
```

### Administrative Operations Runbook

1. **Query Active Persistence States and Telemetry:**
Execute this command to inspect persistence efficiency, child fork times, and status:
```bash
redis-cli INFO persistence
```
Example Output showing critical performance metrics:
```text
# Persistence
loading:0
rdb_changes_since_last_save:452
rdb_last_save_time:1700000000
rdb_last_bgsave_status:ok
rdb_last_bgsave_time_sec:2          # Time child process spent writing RDB
aof_enabled:1
aof_pending_bio_fsync:0             # Crucial: If >0, AOF background thread is blocking
aof_last_rewrite_time_sec:5
aof_last_bgrewrite_status:ok
```

2. **Trigger an Asynchronous Background Snapshot manually:**
```bash
redis-cli BGSAVE
```

3. **Force a Background AOF Log Compaction manually:**
```bash
redis-cli BGREWRITEAOF
```
This is useful during quiet periods after a high-volume batch import to immediately compress the log size.
