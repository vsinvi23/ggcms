---
title: "MongoDB Aggregation Pipeline Optimization: Stage Ordering and Memory Limits"
description: "Why aggregation pipeline stage order determines whether MongoDB uses an index or blows through its 100MB in-memory sort/group limit, and how to structure pipelines as a narrowing funnel instead of a wide-open cylinder."
type: "ARTICLE"
categorySlug: "databases"
articleType: "GUIDE"
tags:
  - "mongodb"
  - "aggregation-pipeline"
  - "query-optimization"
  - "indexing"
  - "nosql"
---

# MongoDB Aggregation Pipeline Optimization: Stage Ordering and Memory Limits

## The Problem: The Infinite RAM Illusion

MongoDB's document model gives developers immense flexibility — nested arrays, flexible schemas, no rigid join constraints. Once simple CRUD isn't enough, teams reach for the **Aggregation Framework** to do grouping, transformation, and analysis in the database itself.

A common anti-pattern: treating the aggregation pipeline like an in-memory data processing script (pandas-style), ignoring how the database physically fetches data. A pipeline pulls 5 million documents off disk, unwinds massive arrays, and sorts the results in memory — and the query either takes tens of seconds or dies with:

```text
Sort exceeded memory limit of 104857600 bytes, but did not opt in to external sorting.
```

In MongoDB, the *order* of stages in a pipeline determines whether the query runs in milliseconds using a B-Tree index, or exhausts memory trying to sort or group data that should have been filtered out three stages earlier.

## Mental Model: Unix Pipe, Shaped as a Funnel

The aggregation pipeline is modeled directly on Unix shell piping (`cat data.txt | grep "error" | sort | head -n 10`) — data flows sequentially, one stage's output becomes the next stage's input.

The goal is to make the pipeline a **funnel**: narrow as early as possible, not a cylinder that stays wide the whole way through.

```text
[ Bad Pipeline (Cylinder) ]        [ Good Pipeline (Funnel) ]
 1M Docs --(fetch all)-->            1M Docs --($match, index)-->
         |                                   |
 1M Docs --($unwind array)-->        5K Docs --($sort, index)-->
         |                                   |
 5M Docs --($match subset)-->        5K Docs --($unwind array)-->
         |                                   |
 5K Docs --($group / $sort)          15K Docs --($group logic)
```

Filtering *after* transforming forces the CPU to process millions of documents that were always going to be discarded.

## Rule 1: Indexes Only Help at the Start of the Pipeline

MongoDB has a query optimizer that tries to reorder some stages (it can pull a `$match` ahead of a `$project`, for instance), but it cannot rescue an arbitrarily-ordered complex pipeline.

**Indexes can only be used by the stages at the very beginning of the pipeline.** Once data passes through a transforming stage — `$project`, `$group`, `$unwind` — the stream no longer corresponds to the on-disk B-Tree structure. Any `$match` or `$sort` placed *after* that point runs entirely in memory, over whatever documents survived up to that stage.

Put your `$match` first. If you follow it immediately with a `$sort` and have a compound index covering both fields, the sort is essentially free — the index already returns documents in that order.

```javascript
// Index-backed: $match and $sort both hit the compound index
db.orders.aggregate([
  { $match: { status: "completed" } },
  { $sort: { created_at: -1 } },
  { $group: { _id: "$customer_id", total: { $sum: "$amount" } } }
])
// supporting index:
db.orders.createIndex({ status: 1, created_at: -1 })
```

## Rule 2: `$unwind` Before `$match` Is a Memory Bomb

`$unwind` deconstructs an array field into one output document per array element. A document with a 100-item array becomes 100 documents downstream.

Unwinding 100,000 documents that each carry a 100-item array before filtering inflates the pipeline to 10,000,000 in-flight documents — all of which then get thrown away by the next `$match`. Always filter with `$match` *before* `$unwind`ing:

```javascript
// Wrong: unwind everything, then filter — 10M docs flow through $unwind
db.orders.aggregate([
  { $unwind: "$items" },
  { $match: { "items.category": "electronics" } }
])

// Right: filter to the relevant subset first, then unwind only what's left
db.orders.aggregate([
  { $match: { status: "completed" } },
  { $unwind: "$items" },
  { $match: { "items.category": "electronics" } }
])
```

## Rule 3: The 100MB Stage Memory Limit and `allowDiskUse`

By default MongoDB caps each aggregation stage (notably `$group` and in-memory `$sort`) at 100MB of RAM. Exceeding it fails the query outright unless you opt in to disk-backed execution:

```javascript
db.orders.aggregate([
   { $match: { status: "completed" } },
   { $group: { _id: "$customer_id", total: { $sum: "$amount" } } },
   { $sort: { total: -1 } }
], { allowDiskUse: true })
```

`allowDiskUse: true` lets MongoDB spill intermediate `$group`/`$sort` state to temporary files on disk instead of failing. It prevents the crash, but disk-backed sorting and grouping are dramatically slower than in-memory or index-backed execution — this is a safety valve, not a substitute for filtering early.

## Diagnosing a Slow Pipeline

Use `.explain("executionStats")` to see whether early stages are actually index-backed:

```javascript
db.orders.aggregate([
  { $match: { status: "completed" } },
  { $group: { _id: "$customer_id", total: { $sum: "$amount" } } }
], { explain: true })
```

Look for:

- `IXSCAN` in the winning plan for the `$match` stage — confirms an index is being used, not `COLLSCAN`.
- `nReturned` at each stage vs. the collection's total document count — a `$match` that isn't narrowing much means the index/predicate isn't selective, and later stages will still be doing heavy lifting.
- `usedDisk: true` on a `$group`/`$sort` stage — a sign the 100MB limit was hit and `allowDiskUse` (or a redesigned pipeline) is required.

## Conclusion

MongoDB's aggregation framework is a genuinely powerful in-database analytics engine, but it requires mechanical sympathy: place indexed `$match` (and index-compatible `$sort`) stages first, defer `$unwind` and `$group` until the document set is already small, and treat `allowDiskUse` as a last resort rather than a default. Enforcing the funnel shape — narrow early, transform late — is what separates millisecond aggregations from ones that crash with a memory-limit error at 2am.
