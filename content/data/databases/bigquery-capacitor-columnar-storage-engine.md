---
title: "Google BigQuery Internals: The Capacitor Columnar Storage Engine"
description: "How BigQuery's Capacitor storage engine pivots data into columns, encodes nested/repeated fields with repetition and definition levels, and applies RLE and dictionary compression to scan petabytes in milliseconds."
type: "ARTICLE"
categorySlug: "databases"
articleType: "DEEP_DIVE"
tags:
  - "bigquery"
  - "columnar-storage"
  - "capacitor"
  - "dremel"
  - "olap"
  - "data-compression"
---

# Google BigQuery Internals: The Capacitor Columnar Storage Engine

## The Problem: The Row-Based Bottleneck in Analytics

Traditional relational databases (PostgreSQL, MySQL) utilize a row-oriented storage architecture. Data is written to disk blocks sequentially by row. If you have a `Users` table with 50 columns, all 50 columns for User A are stored physically next to each other on the disk.

This is highly optimized for OLTP (Online Transaction Processing). If a user logs in, `SELECT * FROM Users WHERE id = 1` fetches the entire row in a single disk seek.

However, in OLAP (Online Analytical Processing) workloads, analysts run queries like `SELECT SUM(revenue) FROM Sales`. To calculate this sum, a row-oriented database must read entire disk blocks containing all 50 columns, pulling gigabytes of irrelevant data (names, addresses, timestamps) from disk into RAM, just to extract the single `revenue` column. This I/O bottleneck makes querying petabyte-scale datasets impossibly slow.

Google BigQuery solves this physics problem by completely abandoning row-oriented storage in favor of a proprietary, highly compressed columnar storage engine known as **Capacitor**.

## The Mental Model: Pivoting the Disk

In a columnar storage engine, data is physically pivoted. Instead of storing Row 1, then Row 2, Capacitor stores Column A for all rows, then Column B for all rows.

```text
[ Row-Oriented Storage (Postgres) ]
Disk Block 1: [ID:1, Name:Alice, Age:30] [ID:2, Name:Bob, Age:40]
(To get average age, must read IDs and Names)

[ Columnar Storage (BigQuery Capacitor) ]
Disk Block 1 (IDs)   : [1, 2, 3, 4, 5, 6...]
Disk Block 2 (Names) : [Alice, Bob, Charlie...]
Disk Block 3 (Ages)  : [30, 40, 25, 60, 22...]
(To get average age, only read Block 3)
```

When you query `SELECT SUM(revenue)`, BigQuery directs its massively parallel execution tree (Dremel) to exclusively read the disk sectors containing the `revenue` column. The I/O footprint is reduced by 99%, allowing BigQuery to scan terabytes of data in milliseconds.

## Deep Dive: Repetition and Definition Levels

Storing flat columns is easy. BigQuery's true engineering marvel is how it handles nested and repeated data (JSON-like structures, arrays, structs) natively within a columnar format.

If a row has a nested array (e.g., a customer with multiple shipping addresses), how do you store that in flat columns while preserving the relationship? Capacitor utilizes a mathematical concept popularized by the Dremel paper: **Repetition and Definition Levels**.

1. **Repetition Level**: Indicates at what level of the nested structure the array is repeating. A repetition level of 0 means this is a brand-new row. A repetition level of 1 or 2 means this value belongs to the array of the *previous* row.
2. **Definition Level**: Solves the problem of `NULL` values in nested structures. It records how deep into the schema path a field is defined. If an address array exists, but the `zip_code` field is missing, the definition level tells the engine exactly where the null occurred without explicitly storing a `NULL` string, saving massive amounts of space.

By storing these integers alongside the data, BigQuery can perfectly reconstruct complex nested JSON structures on the fly, entirely from flat columns.

```text
Logical row:
{ "name": "Alice", "addresses": [{"city": "NY"}, {"city": "SF"}] }

Flattened column "addresses.city":
value="NY"  repetition=0  definition=2   (new row, fully defined)
value="SF"  repetition=1  definition=2   (repeat within same row's array)
```

## Deep Dive: Advanced Compression (RLE and Dictionary)

Because a single column in Capacitor contains values of the exact same data type (e.g., all booleans, or all strings), it is highly susceptible to extreme compression algorithms.

### Run-Length Encoding (RLE)

If you have a column storing `is_active`, and you have 100,000 active users consecutively, a row-database writes "True" 100,000 times. Capacitor uses Run-Length Encoding to write it as `[True x 100,000]`. This compresses megabytes of data down to a few bytes.

### Dictionary Encoding

If a string column stores `Country`, instead of writing "United States" millions of times, Capacitor builds a small local dictionary: `0 = United States`, `1 = Canada`. It then replaces the massive string column with a highly compressed array of bit-packed integers `[0, 1, 0, 0, 0, 1]`.

Furthermore, Capacitor intelligently reorders the rows within its internal blocks to maximize the efficiency of RLE and Dictionary encoding, often achieving 10x to 15x compression ratios.

## Practical Implication: Writing Capacitor-Friendly Queries

```sql
-- Anti-pattern: forces BigQuery to read every column's disk blocks
SELECT * FROM `project.dataset.sales` WHERE region = 'EMEA';

-- Capacitor-friendly: only the referenced columns' blocks are scanned
SELECT order_id, revenue
FROM `project.dataset.sales`
WHERE region = 'EMEA';
```

Because BigQuery bills by bytes scanned, selecting only the columns you need is not just a performance optimization — it is a direct cost optimization, since Capacitor only reads the column blocks your query actually references.

## Conclusion

Google BigQuery's ability to scan petabytes of data without traditional indexes is entirely reliant on the Capacitor storage engine. By physically separating columns on disk, mapping complex nested arrays using Repetition and Definition levels, and applying aggressive type-specific compression, Capacitor ensures that analytical queries only pay the I/O cost for the exact fields they analyze. Understanding this architecture fundamentally changes how data engineers write SQL — proving why `SELECT *` is the ultimate anti-pattern in BigQuery.
