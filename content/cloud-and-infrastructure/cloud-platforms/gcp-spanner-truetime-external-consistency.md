---
title: "Google Cloud Spanner: TrueTime and Global External Consistency"
description: "How Cloud Spanner uses GPS and atomic-clock synchronized TrueTime intervals and a commit-wait protocol to deliver globally consistent, strictly-ordered transactions without global locks, plus the schema and key-design trade-offs it demands."
type: "ARTICLE"
categorySlug: "cloud-platforms"
articleType: "DEEP_DIVE"
tags:
  - "gcp"
  - "cloud-spanner"
  - "truetime"
  - "distributed-systems"
  - "cap-theorem"
  - "external-consistency"
---

# Google Cloud Spanner: TrueTime and Global External Consistency

Picture a global inventory system: a warehouse in Tokyo decrements a SKU's stock count at the same instant a warehouse in Frankfurt is checking whether that SKU is still available to sell. If the two servers involved disagree, even briefly, about which event happened first, the system can oversell inventory that no longer exists — a correctness bug that costs real money, not just a stale UI. This is the exact problem that made globally-distributed relational databases seem structurally impossible for decades, and it's the problem Google Cloud Spanner was built to solve.

## The Problem: You Can't Order Events You Can't Time Precisely

The CAP theorem states a distributed data store can provide at most two of Consistency, Availability, and Partition tolerance. Traditional relational databases (PostgreSQL, MySQL) pick strong consistency by routing all writes through a single primary — which becomes a global latency and availability bottleneck the moment you try to serve users on multiple continents. NoSQL systems (Cassandra, DynamoDB) pick availability and partition tolerance, accepting *eventual consistency*: a write in New York might not be visible to a read in Tokyo for seconds. For a financial ledger or an inventory system, that gap is not an acceptable trade-off.

The underlying reason strong global consistency is hard is more fundamental than "networks are slow": **it's a clock problem.** Server A's local quartz clock and Server B's local quartz clock both drift, independently, by microseconds to milliseconds per second. Without a way to agree on *what time it actually is*, two servers cannot agree on the order two concurrent transactions actually happened in — Server A might timestamp its commit at `10:00:00.001` while Server B, processing a causally later transaction, timestamps its own at `10:00:00.000`, making the later event appear to have happened first. Historically, the only fix was slow, chatty two-phase-commit coordination across every node involved — which kills the performance a global system needs.

## The Solution: TrueTime — Synchronized Clocks With Bounded Uncertainty

Google solved this with dedicated hardware, not cleverer software. Every Google data center runs **GPS receivers and atomic clocks**, synchronized against each other, giving every server access to a globally-consistent notion of time via the **TrueTime API**.

The critical design choice: TrueTime does not pretend to return a single, perfectly accurate timestamp — because no clock, however precise, can claim zero error. Instead, `TrueTime.now()` returns an **interval**: `[earliest, latest]`. This interval is a hard guarantee that the actual, objective moment in time lies somewhere inside it — typically a window of 1 to 7 milliseconds.

```text
Transaction A calls TrueTime.now() -> returns [ T1, T2 ]   (true time is somewhere in this window)
Transaction B calls TrueTime.now() -> returns [ T3, T4 ]   (true time is somewhere in this window)
```

Embracing uncertainty explicitly, rather than hiding it behind a false-precision single timestamp, is what makes the next step possible.

## External Consistency via Commit Wait

Spanner's strongest guarantee is **external consistency**: if transaction A commits before transaction B *starts* (in real, wall-clock time, as observed by any external client), then A's assigned commit timestamp is guaranteed to be strictly smaller than B's. This has to hold true globally, without any node-to-node coordination at commit time — otherwise you're back to slow cross-continent locking.

The mechanism is called **Commit Wait**:

```text
1. Transaction acquires a TrueTime interval [earliest, latest] for its commit.
2. Spanner assigns `latest` as the transaction's commit timestamp (T_commit).
3. Spanner performs the writes locally.
4. Spanner WAITS — it does not acknowledge success to the client yet — until it can
   prove, via a fresh TrueTime.now() call, that TrueTime.earliest() > T_commit.
5. Only now does Spanner respond "commit succeeded" to the client.
```

Step 4 is the entire trick: by waiting until the *earliest possible* real time has already passed the assigned commit timestamp, Spanner guarantees that no other transaction anywhere in the world — which must also go through this same protocol — can ever be assigned an overlapping or earlier timestamp for a causally later event. Because the TrueTime uncertainty window is only a few milliseconds, this wait is imperceptible to applications, but it is what lets Spanner assign a strict, global, monotonically meaningful order to every transaction purely by comparing timestamps — with **no distributed locking protocol required at commit time**.

```text
        Without Commit Wait                          With Commit Wait
  (timestamps can be misordered)              (timestamps are provably ordered)

Tx A: commits, timestamp = 100         Tx A: commits, timestamp = 100
                                              |  waits until TrueTime.earliest() > 100
Tx B: starts after A commits                  |  (a few ms, bounded by clock uncertainty)
Tx B: commits, timestamp = 99  <- BUG!        v
                                        Tx B: starts, guaranteed to get
                                              timestamp > 100
```

## Architectural Trade-offs This Design Forces

Spanner's consistency model is not free — it imposes real constraints on schema and key design that engineers coming from traditional RDBMS backgrounds routinely get wrong on their first design:

1. **Sequential primary keys create hotspots.** An auto-incrementing ID or a plain timestamp as a primary key funnels every new write to the same physical key range and the same server, defeating the entire point of horizontal write scaling. Use UUIDs or bit-reversed sequential IDs to spread writes across the keyspace.

   ```sql
   -- Bad: monotonically increasing keys hot-spot on one server
   CREATE TABLE Orders (
     OrderId INT64 NOT NULL,   -- 1, 2, 3, 4... all land on the same split
     ...
   ) PRIMARY KEY (OrderId);

   -- Good: UUID or bit-reversed sequence distributes writes across splits
   CREATE TABLE Orders (
     OrderId STRING(36) NOT NULL,  -- UUID, uniformly distributed
     ...
   ) PRIMARY KEY (OrderId);
   ```

2. **Related data must be co-located explicitly.** Spanner's `INTERLEAVE IN PARENT` clause physically co-locates a child table's rows with its parent row on the same server, so a query joining `Orders` and `OrderItems` for one customer doesn't require a cross-server round trip.

   ```sql
   CREATE TABLE Customers (
     CustomerId STRING(36) NOT NULL,
     Name STRING(200),
   ) PRIMARY KEY (CustomerId);

   CREATE TABLE Orders (
     CustomerId STRING(36) NOT NULL,
     OrderId STRING(36) NOT NULL,
     Amount NUMERIC,
   ) PRIMARY KEY (CustomerId, OrderId),
     INTERLEAVE IN PARENT Customers ON DELETE CASCADE;
   ```

3. **Cost and operational floor.** Spanner requires a minimum baseline of provisioned compute nodes to operate and is priced well above Cloud SQL — it is the right tool when you genuinely need global, strongly-consistent, horizontally-scaled SQL, not a default choice for a single-region application.

## Conclusion

Cloud Spanner's core insight is that the classic SQL-vs-NoSQL global consistency trade-off isn't really a data-modeling problem — it's a clock problem. By investing in physical, GPS- and atomic-clock-synchronized time (TrueTime) and using the resulting bounded uncertainty interval to enforce a Commit Wait before acknowledging any transaction, Spanner achieves a global, provable transaction order without cross-continent locking. The cost of that guarantee shows up not in the API surface — Spanner still speaks SQL — but in schema design: key distribution and data locality decisions that determine whether you get Spanner's promised horizontal scale or accidentally build a single-server bottleneck on top of a globally distributed database.
