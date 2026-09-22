---
title: "PostgreSQL MVCC Internals: Dead Tuples, VACUUM, and Transaction ID Wraparound"
description: "How PostgreSQL implements lock-free MVCC using xmin/xmax visibility, why dead tuples accumulate and bloat tables, how VACUUM reclaims them, and why unmanaged transaction ID wraparound can force a full database shutdown."
type: "ARTICLE"
categorySlug: "databases"
articleType: "DEEP_DIVE"
tags:
  - "postgresql"
  - "mvcc"
  - "vacuum"
  - "dead-tuples"
  - "transaction-id-wraparound"
  - "database-internals"
---

# PostgreSQL MVCC Internals: Dead Tuples, VACUUM, and Transaction ID Wraparound

A reporting dashboard runs a long `SELECT` inside a `SERIALIZABLE` transaction that stays open for twelve hours. Meanwhile, an unrelated `orders` table is being hammered with thousands of updates per minute. A few days later, disk usage alerts fire: `orders` has ballooned to gigabytes despite holding only a few hundred thousand live rows, and autovacuum logs show it has barely run. The two facts are connected — and understanding why requires going underneath SQL into how PostgreSQL actually stores and versions rows.

## The Problem: The Lock Contention Bottleneck

Relational databases must enforce **Isolation** (the "I" in ACID). If transaction A is updating a user's address while transaction B runs a report counting active users, B must not see A's uncommitted edits. Older engines enforced this with table or row locks: readers waited for write locks to release, and "readers blocked writers, writers blocked readers" — a serious throughput ceiling for any system serving hundreds of concurrent operations.

Modern web platforms need the opposite: **readers never block writers, and writers never block readers**, without sacrificing isolation or consistency.

## A Simple Mental Model: The Animation Flipbook

PostgreSQL solves this with **Multi-Version Concurrency Control (MVCC)** — think of a flipbook where each page is a version of a row.

```text
                         FLIPBOOK PAGE LAYER (Storage Heap)
   =============================================================================
   [ Page 1: Alice (Active) ] ---> [ Page 2: Bob (Active) ] ---> [ Page 3: Charlie (Dead) ]
                                                                       ^
                                                            An update was executed.
                                                            Charlie was 'copied' to Page 4,
                                                            leaving Page 3 as a dead phantom.
```

When you change a row, Postgres does **not** overwrite the old data. It writes a completely new, independent tuple version, marking the old version invisible ("dead") to subsequent transactions. Every transaction reads a consistent snapshot corresponding to the exact instant it started, ignoring concurrent updates entirely.

## Under the Hood: MVCC Page Structure and Dead Tuples

Every tuple carries hidden system columns used exclusively by the MVCC engine:

- **`xmin`** — the Transaction ID (TXID) that inserted the row.
- **`xmax`** — the TXID that updated or deleted the row (`0` if the row is still active).

```text
  Step 1: INSERT Row 1
  [ Page Offset ] ----------------------------> Tuple 1: "Alice" (xmin: 101, xmax: 0) [Active]

  Step 2: UPDATE Row 1 to "Bob"
  [ Page Offset ] ----------------------------> Tuple 1: "Alice" (xmin: 101, xmax: 102) [DEAD!]
                                                Tuple 2: "Bob"   (xmin: 102, xmax: 0)   [Active]
```

1. **The update:** transaction 102 updates "Alice" to "Bob".
2. **The result:** instead of editing "Alice" in place, Postgres writes a new tuple "Bob" with `xmin: 102`, and sets "Alice"'s `xmax` to `102`.
3. **Visibility:** any transaction starting after TXID 102 sees "Bob". An older transaction still running from TXID 101 continues reading the dead "Alice" tuple — preserving isolation.
4. **The side effect:** once every transaction older than TXID 102 completes, "Alice" is invisible to everyone. It is now a **dead tuple** — garbage that still consumes physical page space.

## The Solution: The VACUUM Engine

Unattended dead tuples cause **table bloat**: a table holding 10,000 active rows can easily occupy 10 GB on disk if those rows are updated frequently, forcing the database to pull mountains of dead data into RAM and degrading query speed.

```text
  [ Heap Page with Dead Tuples ] ---> VACUUM ---> [ Dead Tuples Marked as Free Space ]
```

- **Standard `VACUUM`** scans table pages, identifies dead tuples, and marks their space as free for future `INSERT`s. It does **not** return space to the OS — the file size stays the same, but future writes reuse the gaps instead of expanding the file further.
- **`VACUUM FULL`** locks the entire table, builds a brand-new contiguous file containing only active rows, and deletes the old file. This *does* release space to the OS, but the exclusive lock means no queries can run during execution — avoid it under production traffic.
- **Autovacuum** is the background daemon that monitors write activity and automatically triggers a standard `VACUUM` once the dead-tuple percentage crosses a configured threshold.

## The Nightmare: Transaction ID (TXID) Wraparound

PostgreSQL represents Transaction IDs as 32-bit integers — a maximum of roughly 4.2 billion unique transactions. Because TXIDs increment continuously, the counter will eventually wrap back to 0.

**The danger:** if wraparound happened uncontrolled, old transactions would suddenly appear to have occurred in the future, rendering all existing data invisible. To prevent this catastrophic failure, Postgres hardcodes a safeguard: if the database approaches 2 billion transactions without a freeze vacuum, it locks down, rejects all incoming SQL, and raises:

```text
FATAL: database is not accepting commands to avoid wraparound data loss in database "postgres"
```

**The mitigation — freezing.** The vacuum engine runs a special **freeze vacuum** that scans old pages and replaces historical `xmin` values with a permanent identifier, `FrozenTransactionId` (value 2). A frozen TXID is considered mathematically older than any active transaction, letting Postgres safely reset the active TXID counter.

## Hands-On SQL: Analyzing Bloat and Dead Tuples

### Check table bloat and dead-tuple metrics

```sql
SELECT
    schemaname,
    relname AS table_name,
    n_live_tup AS active_rows,
    n_dead_tup AS dead_rows,
    -- Calculate the percentage of dead tuples
    ROUND(100.0 * n_dead_tup / NULLIF(n_dead_tup + n_live_tup, 0), 2) AS dead_tuple_ratio,
    last_vacuum,
    last_autovacuum
FROM pg_stat_user_tables
WHERE relname = 'orders';
```

### Tune autovacuum for high-write tables

Default thresholds are tuned for small, low-write tables. For a high-traffic table executing thousands of updates per minute, tighten the trigger:

```sql
-- Make Autovacuum trigger when 5% of rows are dead (default is 20%)
ALTER TABLE orders SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_vacuum_threshold = 1000
);
```

## Common Misconceptions

**"Vacuuming defragments indexes automatically."** Standard `VACUUM` only clears dead tuples from heap pages — it does not shrink or defragment bloated B-Tree indexes. If indexes are bloated from heavy update churn, they need an explicit `REINDEX` (ideally `REINDEX CONCURRENTLY` to avoid downtime).

**"Postgres MVCC is identical to MySQL InnoDB."** They are structurally different. InnoDB overwrites rows in place and writes the historical version to a separate undo log, which readers traverse to reconstruct past state. This avoids table bloat but adds write overhead from managing undo chains — the opposite trade-off from Postgres's append-and-vacuum model.

## Pause and Think

**Question:** if a long-running reporting query has been executing for twelve hours inside a `SERIALIZABLE` transaction, why does it completely block autovacuum from cleaning up newly created dead tuples across the *entire* database — not just the table it reads?

**Answer:** Autovacuum cannot delete any dead tuple whose `xmin` or `xmax` is newer than the oldest active transaction ID. Since the twelve-hour-old transaction is still running, Postgres must preserve every data version created since that transaction started, on every table, preventing vacuum from reclaiming storage anywhere until that transaction ends.

## Key Takeaways

- Postgres MVCC writes a new tuple on every `UPDATE`, leaving the old version as a dead tuple rather than overwriting in place.
- Dead tuples consume physical disk space and drive table bloat, degrading query latency.
- `VACUUM` marks dead-tuple space as reusable but never shrinks the on-disk file size — only `VACUUM FULL` or `REINDEX`/rebuild tooling does that.
- Keep transactions short so autovacuum can advance the visibility horizon and reclaim garbage aggressively.
- Monitor transaction ID age to avoid the fatal wraparound shutdown.
