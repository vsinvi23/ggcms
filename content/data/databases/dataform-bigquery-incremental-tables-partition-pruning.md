---
title: "Dataform Incremental Tables: Cutting BigQuery Cost with Partition Pruning"
description: "How Dataform's incremental() macro, MERGE-based upserts, and BigQuery partition pruning combine to avoid full-table rescans on every pipeline run."
type: "ARTICLE"
categorySlug: "databases"
articleType: "GUIDE"
tags:
  - "dataform"
  - "bigquery"
  - "incremental-tables"
  - "partition-pruning"
  - "data-engineering"
---

# Dataform Incremental Tables: Cutting BigQuery Cost with Partition Pruning

## The Problem: The Cost of Full Recomputation

In BigQuery, compute cost is directly tied to the volume of data scanned.

Consider a daily batch pipeline that transforms raw event logs into an aggregated `daily_user_metrics` table. The simplest implementation is a full recomputation: run `CREATE OR REPLACE TABLE` every night.

If the raw event table holds 10 terabytes of historical data, a full recomputation forces BigQuery to scan all 10 TB every single night. Over a month, that is 300 TB scanned — to process just a few gigabytes of *new* data generated yesterday.

## The Mental Model: Incremental Tables

Dataform solves this with **incremental tables**. Instead of dropping and rebuilding the target table, an incremental model assumes the target table already exists. During execution, Dataform limits the scan to only the **delta** — new rows since the last successful run — and `INSERT`s or `MERGE`s just those rows into the historical target table.

```text
Full Recomputation (Costly):
[10 Years of Data] -> (Transform All) -> (Overwrite Target Table)

Incremental Update (Cheap):
[Yesterday's Delta Data] -> (Transform Delta) -> (Append to Target Table)
```

## Implementing Incrementals in Dataform

To convert a standard Dataform table to an incremental table, set the config block's `type` to `"incremental"`.

```javascript
config {
  type: "incremental",
  schema: "analytics",
  name: "daily_user_metrics",
  uniqueKey: ["user_id", "date"]
}
```

The core logic relies on the `incremental()` macro function, which returns `true` only when the pipeline is running in incremental mode (the table already exists and a full refresh isn't being forced). Apply it in the `WHERE` clause to filter the source data:

```sql
SELECT
  user_id,
  DATE(event_timestamp) as date,
  COUNT(*) as total_events
FROM ${ref("raw_events")}
WHERE 1=1
${when(incremental(), `AND event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 3 DAY)` )}
GROUP BY 1, 2
```

- **Initial run:** `incremental()` evaluates to `false`. The `WHERE` clause is ignored — BigQuery scans all historical data and creates the baseline table.
- **Subsequent runs:** `incremental()` evaluates to `true`. BigQuery applies the `TIMESTAMP_SUB` filter, scanning only the last 3 days of events, transforming them, and appending them to the target.

## The Critical Optimization: Partitioning

Writing an incremental query does **not** automatically save money in BigQuery.

If the source table (`raw_events`) is not partitioned, BigQuery cannot physically isolate the recent data. Even with the `WHERE event_timestamp >= ...` clause, BigQuery performs a full table scan and discards the old rows in memory afterward — you still pay for scanning 10 TB.

To unlock real cost savings, the underlying source table **must be partitioned** by a date/timestamp column. When a partitioned table is queried with a date filter, BigQuery uses partition pruning: it completely ignores historical storage blocks, physically scanning only the partitions covering the requested days.

The target incremental table should also be partitioned and clustered:

```javascript
config {
  type: "incremental",
  schema: "analytics",
  name: "daily_user_metrics",
  uniqueKey: ["user_id", "date"],
  bigquery: {
    partitionBy: "date",
    clusterBy: ["user_id"]
  }
}
```

```text
Unpartitioned source + WHERE filter:
[10 TB scanned] -> (filter applied in memory) -> [rows discarded, still billed]

Partitioned source + WHERE filter:
[Partition pruning] -> only [3 days of partitions] physically scanned -> [~GBs billed]
```

## The Merge Strategy and Idempotency

When a `uniqueKey` is defined, Dataform compiles the incremental update as a BigQuery `MERGE` statement rather than a plain `INSERT`.

This is vital for **idempotency**. If a pipeline fails midway, or needs to rerun for late-arriving data, a plain `INSERT` would create duplicate rows for the same day. `MERGE` uses the `uniqueKey` to match incoming delta rows against existing historical rows — if a match is found (e.g., `user_id` 45 on `date` 2023-10-01), Dataform updates the existing row instead of duplicating it. This guarantees that running the same pipeline multiple times yields the exact same state, preserving accuracy while minimizing scan cost.
