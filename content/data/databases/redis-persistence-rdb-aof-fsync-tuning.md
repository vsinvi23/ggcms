---
title: "Redis Persistence: Tuning RDB, AOF, and Fsync Pacing for Durability"
description: "How Redis RDB snapshots and AOF logging work internally, the write()/fsync() system-call trade-off behind appendfsync policies, and a production redis.conf profile that balances durability against write latency."
type: "ARTICLE"
categorySlug: "databases"
articleType: "GUIDE"
tags:
  - "redis"
  - "persistence"
  - "rdb"
  - "aof"
  - "fsync"
  - "durability"
---

# Redis Persistence: Tuning RDB, AOF, and Fsync Pacing for Durability

A team runs Redis purely as a cache and is unbothered by data loss on restart — until product asks Redis to also back a session store and a lightweight job queue. Now a crash that used to just mean "warm the cache again" means logged-out users and lost jobs. The fix isn't switching databases; it's understanding what Redis's two persistence mechanisms actually guarantee, and at what latency cost.

## The Problem: The Performance-Durability Dilemma in In-Memory Datastores

Redis is an in-memory key-value database designed for microsecond write latency. Because its active state lives entirely in volatile RAM, a crash, reboot, or power outage means total data loss unless persistence is configured. Two failure modes pull in opposite directions:

- **The latency trap:** forcing synchronous disk writes on every modification defeats the purpose of an in-memory database, dropping throughput from hundreds of thousands of ops/sec to disk I/O's mechanical limits.
- **The data-loss trap:** relying on coarse, infrequent snapshot intervals risks losing minutes of valuable writes during a crash.

## The Architecture: Internals of RDB and AOF

```text
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

### 1. RDB — point-in-time snapshotting

RDB creates a compact, point-in-time binary representation of the entire dataset. To build a snapshot without blocking active traffic, Redis calls the Linux `fork()` system call to create a child process. The OS uses Copy-on-Write (COW) memory mapping: the child shares the parent's physical memory pages, and if a client writes during the snapshot, the OS duplicates only the targeted page for the parent — the child's view stays static.

**Trade-offs:** virtually zero performance impact on the parent process, extremely fast restarts. But if the server crashes, every write since the last snapshot is permanently lost, and `fork()` on very large datasets with high write volume can cause noticeable latency spikes.

### 2. AOF — the append-only log

AOF tracks state by recording every write command sequentially into a log file on disk. On restart, Redis replays the log to reconstruct the dataset exactly.

When a write command runs, it is formatted into RESP and appended to `server.aof_buf` in RAM. Persisting it to physical disk requires two system calls:

1. **`write(fd, buf, len)`** — copies data from the user-space Redis buffer into the kernel-space OS page cache. Non-blocking and fast, but the data is still in volatile memory; a power failure loses it.
2. **`fsync(fd)`** — forces the kernel to flush the page cache directly to the physical storage device. This is a blocking system call.

## The Fsync Pacing Policies

The `appendfsync` directive controls when step 2 happens, trading latency against durability:

| Policy | Internals | Durability | Write Latency |
| :--- | :--- | :--- | :--- |
| `always` | `fsync()` after every command, before replying success to the client. | Maximum (0 data loss). | Extremely high — limited by disk write speed. |
| `everysec` | Main thread `write()`s every command; a background thread `fsync()`s once per second. | High — max 1–2 seconds of data loss. | Very low — the industry-standard balance. |
| `no` | Redis calls `write()` but never `fsync()`; the OS controls the flush schedule (usually ~30 seconds). | Low — unpredictable data loss window. | Minimal — fastest option. |

`appendfsync always` can drop a Redis instance capable of 100k ops/sec down to roughly 500 ops/sec — reserve it for strict regulatory zero-loss requirements. `everysec` is the default and the right choice for the overwhelming majority of workloads.

## AOF Rewriting (Log Compaction)

Because AOF logs every operation, it grows indefinitely — a key incremented 1,000 times produces 1,000 log entries. Redis mitigates this with **AOF rewriting** (`BGREWRITEAOF`): it forks a child process that reads the current in-memory dataset and writes the shortest command sequence needed to rebuild that exact state (collapsing 1,000 `INCR`s into a single `SET`), then swaps the files.

Modern Redis (4.0+) supports a **hybrid RDB+AOF mode**: during a rewrite, the child writes the current state as a binary RDB payload inside the AOF file, then appends only the new AOF operations that occur during the rewrite. This combines RDB's fast restart and compaction with AOF's granular durability.

## Practical Configuration and Monitoring Runbook

### Optimized `redis.conf` profile

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

### Administrative operations

**Inspect persistence efficiency and fork timing:**

```bash
redis-cli INFO persistence
```

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

**Trigger an asynchronous background snapshot manually:**

```bash
redis-cli BGSAVE
```

**Force a background AOF log compaction manually** — useful during quiet periods after a high-volume batch import to immediately shrink the log:

```bash
redis-cli BGREWRITEAOF
```

## Key Takeaways

- RDB gives fast restarts and compact backups but can lose an entire snapshot interval of writes on crash; AOF gives near-zero loss but grows unbounded without periodic rewriting.
- The `appendfsync` policy is really a choice about when `fsync()` runs relative to `write()` — `everysec` is the right default for nearly every workload.
- Hybrid RDB-preamble AOF (Redis 4.0+) combines both mechanisms' strengths and should be the default for any workload needing real durability.
- Watch `aof_pending_bio_fsync` in `INFO persistence` — a nonzero value means the AOF background fsync thread is falling behind and blocking.
