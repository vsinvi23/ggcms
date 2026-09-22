# API Pagination: Why Cursor-Based Pagination Outperforms OFFSET/LIMIT

Pagination is a fundamental requirement for any data-heavy API. However, the default approach most developers reach for—the standard `OFFSET` and `LIMIT` SQL paradigm—harbors a hidden performance cliff and subtle data consistency bugs that only reveal themselves at scale. 

In this article, we'll deconstruct the mechanics of `OFFSET/LIMIT`, examine its failure modes, and explore why Cursor-Based (Keyset) Pagination is the industry standard for high-performance distributed systems.

## The Problem: The "Next Page" Performance Cliff

Imagine a user navigating to page 1,000 of a search results list. Behind the scenes, the application executes a query like this:

```sql
SELECT id, title, created_at 
FROM products 
ORDER BY created_at DESC 
LIMIT 10 OFFSET 10000;
```

Intuitively, it feels like the database should simply "jump" to row 10,000 and return the next 10 rows. This is a dangerous misconception.

### The Mental Model: Counting vs. Bookmarking

Think of `OFFSET` like reading a 10,000-page book to find a specific paragraph. You cannot instantly jump to page 10,000; you must start at page 1, manually turn 10,000 pages, discard them from your memory, and then read the 10 pages you actually want. 

In database terms, an `OFFSET` forces the engine to scan the B-tree index from the beginning, traversing and discarding every row until it reaches the offset value. The time complexity degrades linearly—$O(N)$—as the page number increases. On massive datasets, deep pagination requests can trigger CPU spikes and database thread exhaustion.

### The Stale Data Problem (The Thundering Insert)

Performance is only half the battle. `OFFSET` pagination is notoriously brittle in concurrent environments.

Suppose a user is on Page 1 (items 1-10). While they are reading, a new item is inserted into the database. All existing items shift down by one position. When the user clicks "Page 2" (`OFFSET 10 LIMIT 10`), the item that was previously at position 10 shifts to position 11. The API returns it again. The user experiences a duplicate item. Conversely, if an item on Page 1 is deleted, an item shifts up, causing the user to completely miss a row when moving to Page 2.

## The Solution: Cursor-Based Pagination

Cursor-Based pagination (also known as Keyset pagination) solves both the performance and consistency problems by entirely abandoning the concept of "skipping" rows. Instead, it relies on a **bookmark**.

### The Mental Model: The Bookmark

Instead of saying "Skip the first 10,000 items," cursor pagination says: "Give me 10 items that come immediately *after* this specific item." 

```sql
SELECT id, title, created_at 
FROM products 
WHERE (created_at, id) < ('2023-10-25 14:00:00', 9832)
ORDER BY created_at DESC, id DESC 
LIMIT 10;
```

### Why It Outperforms Offset

1. **$O(1)$ Time Complexity:** If there is a composite index on `(created_at, id)`, the database engine can traverse the B-tree directly to the exact cursor location in logarithmic time, regardless of how deep into the dataset the user has scrolled. It fetches 10 rows and stops. There is zero scan-and-discard overhead.
2. **Stable Windows:** Because the query anchors itself to a specific physical row (the cursor), concurrent inserts and deletes do not shift the data window. The user will never see duplicates or miss items.

## Architectural Considerations

Cursor pagination is not without its architectural constraints. 

First, the sorting column must be **sequential and indexed**. Second, the sorting column must guarantee **absolute uniqueness**. If you sort by `created_at`, it is highly probable that two rows share the exact same timestamp. If a page break occurs between these two rows, data will be lost. To prevent this, tie-breaker columns (like a unique integer `id` or UUID) must be appended to the `ORDER BY` clause and the index.

### The Opaque Cursor String

In practice, APIs do not expose raw database columns in their pagination tokens. Instead, they serialize the keyset into an opaque string (often Base64 encoded) to prevent clients from reverse-engineering the database schema or manually manipulating the cursor.

```json
{
  "data": [...],
  "pageInfo": {
    "hasNextPage": true,
    "endCursor": "W1syMDIzLDEwLDI1LDE0LDAsMF0sOTgzMl0="
  }
}
```

The client simply passes `?after=W1syM...` on the next request. The API decodes the string, extracts the timestamp and ID, and constructs the highly-optimized keyset SQL query.

By enforcing cursor-based pagination at the API Gateway level, system architects can effectively inoculate their databases against the slow, creeping degradation of deep offset queries, ensuring constant-time latency at any scale.