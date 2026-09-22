# Resolving GraphQL N+1 Query Loops: Request Coalescing and Ticking Batch Queues

## The Problem: The Graph Expansion Trap

GraphQL’s primary strength is enabling clients to specify exactly the shape of the data they need. However, this hierarchical, graph-based execution model naturally leads to the dreaded N+1 query problem. 

Consider a query fetching a list of 100 `Posts`, and for each post, fetching its `Author`. 
A naive GraphQL execution engine will resolve the `Posts` (1 query), and then iterate through the results, invoking the `Author` resolver 100 times. This results in 101 separate database queries:
1. `SELECT * FROM posts LIMIT 100;`
2. `SELECT * FROM users WHERE id = 1;`
3. `SELECT * FROM users WHERE id = 2;`
...and so on.

This scattershot querying annihilates database performance through excessive connection overhead and failure to utilize index batching.

## The Dataloader Pattern

The Dataloader pattern, originally popularized by Facebook, intercepts these individual resolver requests. Instead of executing them immediately, it queues them up. It waits for the current tick of the event loop to finish (coalescing the requests), deduplicates the requested keys, and dispatches a single batch query to the database.

## ASCII Architecture: Request Coalescing

```text
 [GraphQL Resolver]      [GraphQL Resolver]      [GraphQL Resolver]
 (Needs Author 1)        (Needs Author 2)        (Needs Author 1)
        │                       │                       │
        └───▶ [ Dataloader Queue (Event Loop Tick) ] ◀──┘
                        │
                        │ 1. Coalesce & Deduplicate [1, 2]
                        │
                        ▼
            [ Batch Execution Function ]
                        │
                        │ 2. Single DB Query
                        ▼
       SELECT * FROM users WHERE id IN (1, 2);
                        │
                        │ 3. Return Array of Results
                        ▼
            [ Dataloader Map Distribution ]
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
     [Author 1]     [Author 2]     [Author 1]
    (To Resolver)  (To Resolver)  (To Resolver)
```

## Implementation: The Batching Queue

A Dataloader relies heavily on asynchronous primitives and the runtime's event loop. Below is a simplified, framework-agnostic implementation of a Dataloader in JavaScript/TypeScript using `process.nextTick`.

```typescript
type BatchLoadFn<K, V> = (keys: K[]) => Promise<(V | Error)[]>;

export class DataLoader<K, V> {
  private batchLoadFn: BatchLoadFn<K, V>;
  private queue: Array<{ key: K; resolve: Function; reject: Function }> = [];
  private cache = new Map<K, Promise<V>>();
  private ticking = false;

  constructor(batchLoadFn: BatchLoadFn<K, V>) {
    this.batchLoadFn = batchLoadFn;
  }

  // Resolvers call this method
  public load(key: K): Promise<V> {
    // 1. Deduplication (Cache check)
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    // 2. Queue the request
    const promise = new Promise<V>((resolve, reject) => {
      this.queue.push({ key, resolve, reject });
    });
    
    this.cache.set(key, promise);

    // 3. Schedule execution on the next event loop tick
    if (!this.ticking) {
      this.ticking = true;
      process.nextTick(() => this.dispatchQueue());
    }

    return promise;
  }

  private async dispatchQueue() {
    const currentQueue = this.queue;
    this.queue = [];
    this.ticking = false;

    if (currentQueue.length === 0) return;

    const keys = currentQueue.map(item => item.key);

    try {
      // Execute the provided batch function (e.g., SELECT ... WHERE id IN (...))
      const values = await this.batchLoadFn(keys);

      // Distribute the results back to the waiting promises
      currentQueue.forEach((item, index) => {
        const val = values[index];
        if (val instanceof Error) item.reject(val);
        else item.resolve(val);
      });
    } catch (error) {
      // Handle batch-level failure
      currentQueue.forEach(item => item.reject(error));
    }
  }
}
```

## Implementation Usage in GraphQL

When wiring up the resolver, the developer provides the batch loading logic.

```typescript
// Create the loader (typically per-request to avoid cross-user cache leaking)
const userLoader = new DataLoader(async (userIds) => {
  // A single query for all requested IDs!
  const users = await db.query('SELECT * FROM users WHERE id = ANY($1)', [userIds]);
  
  // Important: Must return results in the exact order of the requested userIds
  const userMap = new Map(users.map(u => [u.id, u]));
  return userIds.map(id => userMap.get(id) || new Error('Not found'));
});

// GraphQL Resolver
const resolvers = {
  Post: {
    author: (post) => userLoader.load(post.authorId),
  }
};
```

## Architectural Trade-offs

1. **Ordering Constraint:** The underlying database query might not return rows in the same order as the `IN` clause. The batch function *must* explicitly re-sort or map the database results to align exactly with the incoming array of keys, otherwise resolvers receive the wrong data.
2. **Memory Leaks:** Dataloaders utilize a memoization cache. If a Dataloader instance is instantiated globally across the server rather than per-HTTP-request, it will infinitely cache data, leading to memory leaks and cross-tenant data exposure. Always scope Dataloaders to the request context.

By implementing request coalescing, GraphQL architectures transform destructive O(N) database access patterns into efficient O(1) batch lookups, stabilizing infrastructure under high query depth.
