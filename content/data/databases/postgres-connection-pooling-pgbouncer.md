---
title: "Postgres Connection Scaling: Why PgBouncer Is Mandatory in Microservices"
description: "Why PostgreSQL's process-per-connection model collapses under microservices-scale connection counts, and how PgBouncer's pooling modes fix it — with pool_mode trade-offs and pgbouncer.ini tuning."
type: "ARTICLE"
categorySlug: "databases"
articleType: "GUIDE"
tags:
  - "postgresql"
  - "pgbouncer"
  - "connection-pooling"
  - "microservices"
  - "database-scaling"
---

# Postgres Connection Scaling: Why PgBouncer Is Mandatory in Microservices

## The Problem: The Connection Explosion

In a microservices deployment, it's routine to run dozens or hundreds of application instances, each maintaining its own database connection pool. 50 pods, each holding 20 connections, means the database is hit with 1,000 concurrent connections.

For many databases, 1,000 connections is unremarkable. For PostgreSQL, it's an architectural crisis. Postgres uses a **process-per-connection** model — unlike MySQL's or most NoSQL stores' thread-per-connection approach, Postgres forks a full OS process for every incoming connection. A single idle connection typically costs 10-15MB of RAM. 1,000 connections means roughly 10GB dedicated purely to idle sockets — memory taken directly away from `shared_buffers` and OS page cache, the things that actually make queries fast.

Once `max_connections` is exceeded, new service instances fail on startup with:

```text
FATAL: sorry, too many clients already
```

## Mental Model: Decoupling App Connections from DB Processes

The fix is an external pooler — **PgBouncer** — that sits between applications and Postgres, decoupling the number of connections applications *think* they have from the number of physical backend processes Postgres actually runs.

```text
[ Microservices ]          [ PgBouncer ]                [ PostgreSQL ]
 Pod A (20 conns)  --+
 Pod B (20 conns)  --+-->  Port 6432 (1000 virtual) -->  Port 5432 (50 physical)
 Pod C (20 conns)  --+     (holds app connections)       (holds DB processes)
```

Applications connect to PgBouncer exactly as they would connect to Postgres directly. PgBouncer accepts thousands of these virtual connections cheaply (async I/O, lightweight event loop) and funnels the actual work into a small, fixed pool of physical Postgres backend processes.

## Pooling Modes

### 1. Session Pooling (default)

A physical connection stays bound to a client for the client's entire session, until it disconnects. Safest mode — session state (prepared statements, temp tables, session variables) is fully preserved — but it provides **no multiplexing benefit** if application connections are long-lived, which defeats the point for microservices.

### 2. Transaction Pooling (recommended for microservices)

A physical connection is assigned only when a client issues `BEGIN`, and is returned to the pool the instant the transaction commits or rolls back. Since application instances spend the overwhelming majority of their time idle or doing non-DB work, transaction pooling lets a small physical pool (e.g., 50 connections) service a much larger number of application-side connections (e.g., 1,000).

*Caveat:* because the physical connection can change between transactions from the same client, session-scoped features leak or fail unpredictably — `PREPARE` statements, `SET work_mem`, and similar session state don't survive a pool handoff. Disable server-side session assumptions in your driver/ORM (e.g., `serverSideBindings=false` in some JDBC/psycopg configurations) when running in transaction mode.

### 3. Statement Pooling

Connections return to the pool after every individual statement, even mid-transaction. This breaks multi-statement `BEGIN ... COMMIT` blocks outright — used only when you need strict auto-commit semantics and have no multi-statement transactions at all.

## Configuration

```ini
# pgbouncer.ini
[databases]
my_database = host=db.internal port=5432 dbname=my_database

[pgbouncer]
# Must be 'transaction' to get the microservices scaling benefit
pool_mode = transaction

# Maximum incoming (virtual) connections PgBouncer will accept
max_client_conn = 5000

# Maximum physical connections PgBouncer opens to Postgres itself
default_pool_size = 50
```

Capping `default_pool_size` at a low number (50-100) is the whole point: it caps how much RAM Postgres spends on idle backend processes, leaving the rest of memory for `shared_buffers` and page cache — which is what actually drives cache hit ratio and query latency.

## Conclusion

PostgreSQL's process-per-connection model buys stability and crash isolation — one connection's crash can't corrupt another's memory — but it does not scale naturally to thousands of concurrent clients. In any microservices or serverless-function architecture that talks to Postgres, putting PgBouncer in front in `transaction` pooling mode isn't an optional tuning knob; it's what keeps the database from running out of memory on idle sockets before it ever gets to run a query.
