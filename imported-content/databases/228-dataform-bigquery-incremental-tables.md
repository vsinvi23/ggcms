# Dataform Incremental Updates: Optimizing BigQuery Cost by Scanning Delta Dates

### The Problem: The Cost of Full Recomputation

In modern data warehousing platforms like Google BigQuery, compute costs are intrinsically linked to the volume of data scanned. 

Consider a daily batch pipeline that transforms raw event logs into an aggregated `daily_user_metrics` table. The simplest implementation is a full recomputation: executing a `CREATE OR REPLACE TABLE` statement every night. 

If the raw event table holds 10 terabytes of historical data, a full recomputation forces BigQuery to scan all 10 TB every single night. Over a month, this scans 300 TB. As the table grows, query execution time increases, and cloud billing spirals out of control—all to process just a few gigabytes of *new* data generated yesterday.

### The Mental Model: Incremental Tables

Dataform, Google Cloud's ELT orchestration framework, solves this via **Incremental Tables**. 

Instead of blowing away the target table and rebuilding it from scratch, an incremental model assumes the target table already exists. During pipeline execution, Dataform limits the scan to only the **delta**—the new rows that arrived since the last successful run—and strictly `INSERT`s or `MERGE`s those new rows into the historical target table.

```text
Full Recomputation (Costly):
[10 Years of Data] -> (Transform All) -> (Overwrite Target Table)

Incremental Update (Cheap):
[Yesterday's Delta Data] -> (Transform Delta) -> (Append to Target Table)
```

### Implementing Incrementals in Dataform

To convert a standard Dataform table to an incremental table, you change the block configuration `type` to `"incremental"`.

```javascript
config {
  type: "incremental",
  schema: "analytics",
  name: "daily_user_metrics",
  uniqueKey: ["user_id", "date"] 
}
```

The core logic of an incremental model relies on the `incremental()` macro function. This function returns `true` only when the pipeline is running in incremental mode (i.e., the table already exists, and we aren't forcing a full refresh). 

You apply this macro in your `WHERE` clause to filter the source data.

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

In this architecture:
*   **Initial Run:** `incremental()` evaluates to `false`. The `WHERE` clause is ignored. BigQuery scans all historical data and creates the baseline table.
*   **Subsequent Runs:** `incremental()` evaluates to `true`. BigQuery applies the `TIMESTAMP_SUB` filter, scanning only the last 3 days of events, transforming them, and appending them to the target.

### The Critical Optimization: Partitioning

Writing an incremental query in Dataform does **not** automatically save money in BigQuery. 

If the source table (`raw_events`) is not partitioned, BigQuery cannot physically isolate the recent data. Even with the `WHERE event_timestamp >= ...` clause, BigQuery will perform a full table scan, discarding the old data in memory. You pay for scanning 10 TB anyway.

To unlock actual cost savings, the underlying source table **must be partitioned by a date/timestamp column**. When a partitioned table is queried with a date filter, BigQuery utilizes partition pruning. It completely ignores the historical storage blocks, physically scanning only the storage partitions containing the requested days.

Similarly, the target incremental table should also be partitioned and clustered.

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

### The Merge Strategy and Idempotency

When you define a `uniqueKey` in the Dataform config, Dataform compiles the incremental update as a BigQuery `MERGE` statement rather than a simple `INSERT`. 

This is vital for **idempotency**. If a pipeline fails midway or if you need to rerun yesterday's pipeline due to late-arriving data, a simple `INSERT` would create duplicate rows for yesterday. 

The `MERGE` statement uses the `uniqueKey` to match incoming delta rows against existing historical rows. If a match is found (e.g., `user_id` 45 on `date` 2023-10-01), Dataform updates the existing row instead of duplicating it. This guarantees that running the same pipeline multiple times yields the exact same state, ensuring data accuracy while minimizing scan costs.