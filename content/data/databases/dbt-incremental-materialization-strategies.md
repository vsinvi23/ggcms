---
title: "dbt Incremental Materialization: Append, Merge, and Delete+Insert Strategies"
description: "How dbt's is_incremental() macro avoids full table rebuilds, the trade-offs of append/merge/delete+insert strategies, and handling late-arriving data with lookback windows."
type: "ARTICLE"
categorySlug: "databases"
articleType: "GUIDE"
tags:
  - "dbt"
  - "incremental-models"
  - "data-engineering"
  - "snowflake"
  - "bigquery"
---

# dbt Incremental Materialization: Append, Merge, and Delete+Insert Strategies

## The Problem: The Cost of Full Refreshes

In the modern data stack (dbt + Snowflake/BigQuery), analytics engineering often starts with simple `table` materializations. Every time a dbt model runs, it drops the target table and recreates it from scratch via `CREATE OR REPLACE TABLE`.

This works brilliantly at 10 million rows. But once event logs reach 10 billion rows (terabyte scale), rebuilding the entire history daily becomes computationally abusive, slow, and financially ruinous. How do you update massive tables without starting over?

## The Solution: Incremental Materialization

dbt provides the `incremental` materialization strategy. Instead of rebuilding the table, an incremental model only transforms and loads the *new* or *updated* records that arrived since the model last ran.

### Mental Model: The Delta Filter

Imagine maintaining a physical dictionary. A full refresh is burning the dictionary and re-printing it every time a new word is invented. An incremental load simply prints a small appendix page of new words and glues it into the back of the existing book.

```text
[ Raw Source Table ]
       |
       v
+-----------------------------+
| Filter: timestamp > MAX(ts) | (dbt macro: is_incremental())
+-----------------------------+
       | (Only delta rows)
       v
[ Transformations ]
       |
       v
[ Target Table ] <--- MERGE / APPEND / DELETE+INSERT
```

## How `is_incremental()` Works

The magic of incremental models relies on Jinja templating. You wrap delta-filtering logic inside an `if is_incremental()` block. During a normal run, dbt compiles the SQL, sees the target table exists, and applies the filter. Run with `--full-refresh`, and dbt ignores the block and builds the whole table.

```sql
{{
    config(
        materialized='incremental',
        unique_key='event_id',
        incremental_strategy='merge',
        cluster_by=['event_date']
    )
}}

SELECT
    event_id,
    user_id,
    event_name,
    DATE(event_timestamp) AS event_date,
    event_timestamp
FROM {{ source('raw', 'clickstream') }}

{% if is_incremental() %}
  -- This filter is ONLY applied on incremental runs
  WHERE event_timestamp >= (
    SELECT MAX(event_timestamp) FROM {{ this }}
  )
{% endif %}
```

## Incremental Strategies

The `incremental_strategy` config tells dbt how to apply the delta rows to the target.

### 1. Append

- **How it works:** blindly `INSERT`s the delta rows into the target.
- **Use case:** immutable event streams (logs, clicks) where records are never updated.
- **Trade-off:** blazingly fast, but risks duplicate data if a pipeline runs twice for the same time window.

### 2. Merge (default for Snowflake/BigQuery)

- **How it works:** uses a `MERGE` statement; requires a `unique_key`. If the key exists, it `UPDATE`s the row; otherwise it `INSERT`s.
- **Use case:** mutable data (users, orders) where status changes over time.
- **Trade-off:** prevents duplicates and handles updates, but `MERGE` is computationally expensive on massive tables.

### 3. Delete+Insert

- **How it works:** deletes rows in the target table matching the `unique_key` in the delta, then inserts the delta.
- **Use case:** alternative to merge on warehouses that don't support it, or when replacing whole partitions.

## Advanced: Late-Arriving Data and Lookback Windows

A common trap with `MAX(event_timestamp)` is late-arriving data. If an event from 10:00 AM arrives at 10:05 AM, but the model ran at 10:02 AM, the model's new max timestamp is 10:02 AM — the 10:00 AM event is permanently skipped.

**Solution:** implement a lookback window.

```sql
{% if is_incremental() %}
  -- Look back 3 days to catch late-arriving events
  WHERE event_timestamp >= (
    SELECT TIMESTAMP_SUB(MAX(event_timestamp), INTERVAL 3 DAY) FROM {{ this }}
  )
{% endif %}
```

Combined with a `merge` strategy, this safely reprocesses late data without creating duplicates — the `unique_key` match turns the reprocessed rows into idempotent updates rather than new inserts.

## Conclusion

Transitioning from `table` to `incremental` materialization is one of the most impactful optimizations an analytics engineer can make in dbt. Carefully selecting the `unique_key`, managing lookback windows for late data, and aligning incremental updates with warehouse clustering/partitioning can cut pipeline costs dramatically while delivering faster data freshness to the business.
