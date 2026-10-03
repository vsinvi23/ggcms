---
title: "Cache-Aside, Write-Through, and Write-Behind: Choosing a Caching Strategy"
description: "How an application should coordinate reads and writes between an in-memory cache and the database it fronts, with real Redis-backed Python implementations of all three strategies and the consistency trade-offs of each."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "caching"
  - "cache-aside"
  - "write-through"
  - "write-behind"
  - "redis"
  - "consistency"
---

# Cache-Aside, Write-Through, and Write-Behind: Choosing a Caching Strategy

## The Problem

A production database is fundamentally constrained by disk I/O. As read traffic grows, repeatedly querying the same rows drives up latency and, eventually, brings the whole system down under load. The standard fix is an in-memory cache (Redis, Memcached) that serves the hottest data orders of magnitude faster than a disk-backed database can. But introducing a cache raises a design question that determines your entire consistency model: **who talks to whom, and in what order?**

## The Mental Model

Think of a library. The database is the archive in the basement — slow to reach, but with unlimited shelf space. The cache is the librarian's front desk — extremely fast to check, but with room for only a handful of books. The three strategies below are three different policies for what the librarian keeps on the desk and when.

## Strategy 1: Cache-Aside (Lazy Loading)

The application, not the cache, orchestrates every interaction. The cache never talks to the database directly.

```text
   App                     Cache                    Database
    │── GET key ──────────▶│                            │
    │◀── MISS ─────────────│                            │
    │── SELECT * WHERE id=key ─────────────────────────▶│
    │◀──────────────────────────────────── row ─────────│
    │── SET key = row ─────▶│                            │
    │◀── return row to caller ──                         │
```

```python
import json
import redis
import psycopg2

r = redis.Redis(host="localhost", port=6379, db=0)
db = psycopg2.connect("dbname=app user=app")

def get_user(user_id: str) -> dict:
    cache_key = f"user:{user_id}"
    cached = r.get(cache_key)
    if cached:
        return json.loads(cached)  # cache hit — no DB round trip

    # cache miss — fall back to the database
    with db.cursor() as cur:
        cur.execute("SELECT id, name, email FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        if row is None:
            return None
        user = {"id": row[0], "name": row[1], "email": row[2]}

    r.setex(cache_key, 300, json.dumps(user))  # populate cache, 5 min TTL
    return user

def update_user_email(user_id: str, new_email: str) -> None:
    with db.cursor() as cur:
        cur.execute("UPDATE users SET email = %s WHERE id = %s", (new_email, user_id))
        db.commit()
    r.delete(f"user:{user_id}")  # invalidate rather than update — avoids races
```

**Pros:** the cache only ever holds data that was actually requested (efficient memory use); if the cache is unavailable, the app degrades to hitting the database directly instead of failing outright.
**Cons:** the first request after a miss pays the full latency of a database round trip; data can go stale if another process writes to the database without invalidating the cache key.

## Strategy 2: Write-Through

The application treats the cache as its only data store; the cache provider itself is responsible for synchronously propagating writes to the database.

```text
    App                     Cache                    Database
     │── SET key = X ──────▶│                            │
     │                      │── INSERT/UPDATE X ────────▶│
     │                      │◀── ack ────────────────────│
     │◀── write success ────│                            │
```

```python
class WriteThroughCache:
    def __init__(self, redis_client, db_connection):
        self.r = redis_client
        self.db = db_connection

    def write(self, user_id: str, fields: dict) -> None:
        cache_key = f"user:{user_id}"
        with self.db.cursor() as cur:
            cur.execute(
                "UPDATE users SET name = %s, email = %s WHERE id = %s",
                (fields["name"], fields["email"], user_id),
            )
            self.db.commit()  # DB write must succeed before we trust the cache

        self.r.setex(cache_key, 300, json.dumps(fields))  # cache never goes stale
```

**Pros:** simpler read path — the cache is always correct, so reads never need a fallback query; no stale-data window.
**Cons:** every write pays the latency of *both* systems, synchronously; data that's written far more often than it's read wastes cache memory for no read benefit.

## Strategy 3: Write-Behind (Write-Back)

Built for extreme write throughput. Like Write-Through, the application only ever talks to the cache — but the cache acknowledges the write immediately and flushes to the database asynchronously, in batches.

```python
import threading
import queue
import time

class WriteBehindCache:
    def __init__(self, redis_client, db_connection, flush_interval_sec=2):
        self.r = redis_client
        self.db = db_connection
        self.dirty_queue: "queue.Queue[tuple[str, dict]]" = queue.Queue()
        threading.Thread(target=self._flush_loop, args=(flush_interval_sec,), daemon=True).start()

    def write(self, key: str, fields: dict) -> None:
        self.r.setex(f"view_count:{key}", 3600, json.dumps(fields))
        self.dirty_queue.put((key, fields))  # queue for later, don't block on DB

    def _flush_loop(self, interval: int) -> None:
        while True:
            time.sleep(interval)
            batch = []
            while not self.dirty_queue.empty():
                batch.append(self.dirty_queue.get())
            if not batch:
                continue
            with self.db.cursor() as cur:
                cur.executemany(
                    "INSERT INTO view_counts (key, count) VALUES (%s, %s) "
                    "ON CONFLICT (key) DO UPDATE SET count = EXCLUDED.count",
                    [(k, v["count"]) for k, v in batch],
                )
                self.db.commit()
```

**Pros:** blazing-fast writes since the caller never waits on the database; well suited to write-heavy, tolerant-of-loss workloads like view counters or leaderboards, since database writes get batched.
**Cons:** **data-loss risk** — if the cache node crashes before the background flush runs, those writes are gone permanently.

## Architectural Takeaway

- Use **Cache-Aside** for read-heavy workloads where brief staleness is acceptable (user profile pages).
- Use **Write-Through** when the cache and database must never disagree (account settings, permissions).
- Use **Write-Behind** when write volume would otherwise overwhelm the database and occasional data loss is an acceptable trade-off (view counters, telemetry, leaderboard scores) — never for anything you'd need to reconstruct after a crash, like financial ledgers.
