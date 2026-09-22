---
title: "Vector Clocks: Detecting Concurrent Writes Without a Shared Clock"
description: "How AP distributed databases like DynamoDB and Riak use vector clocks to detect concurrent, conflicting writes after a network partition heals, with a working TypeScript implementation of increment, compare, and merge."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "DEEP_DIVE"
tags:
  - "vector-clocks"
  - "distributed-systems"
  - "eventual-consistency"
  - "cap-theorem"
  - "conflict-resolution"
  - "logical-clocks"
---

# Vector Clocks: Detecting Concurrent Writes Without a Shared Clock

## The Problem: Whose Write Wins?

Consider a shopping cart stored in an active-active database like DynamoDB or Riak — a design that favors **Availability** over strict **Consistency** (the "AP" corner of the CAP theorem). During normal operation, Node A and Node B both accept writes and replicate to each other.

Now a network partition splits the cluster. Node A and Node B can no longer talk to each other, but each keeps accepting writes for the *same* shopping cart from different client devices:

- Client X talks to **Node A** and removes an item.
- Client Y talks to **Node B** and adds a different item.

When the partition heals, the database has two divergent versions of the same record and must decide which one is "newer" — or realize that neither is. You cannot use wall-clock timestamps for this: NTP drift means one server's clock running even 50ms fast could cause it to silently overwrite genuinely newer data from another node. You need a way to reason about *causality* — what happened before what — without relying on physical time at all.

## The Mental Model: Logical Time Instead of Wall Time

Imagine two people co-authoring a document by passing drafts back and forth, but instead of dating each draft, they annotate causality directly:

> "Draft 2: I read Alice's Draft 1."
> Alice writes: "Draft 3: I read Bob's Draft 2."

Because Alice's note explicitly states she incorporated Bob's version, her draft is unambiguously newer — no clock required. If instead Bob and Alice each independently authored a new draft from the *same* Draft 1, without seeing each other's, neither is "newer" than the other: they are concurrent, and someone has to merge them. This causal bookkeeping is exactly what a **vector clock** encodes as a data structure.

## Vector Clock Mechanics

A vector clock is an array of counters, one slot per node in the cluster. For a 3-node cluster (A, B, C), a fresh record starts at `[A:0, B:0, C:0]`. Every time a node writes to the record, it increments *only its own* slot.

```text
Write 1 (Node A): add Apple    -> [A:1, B:0, C:0]
Write 2 (Node A): add Banana   -> [A:2, B:0, C:0]
Replicate A -> B               -> Node B now also holds [A:2, B:0, C:0]

--- Network partition begins ---

Client X -> Node A: remove Banana  -> [A:3, B:0, C:0]
Client Y -> Node B: add Carrot      -> [A:2, B:1, C:0]

--- Network heals; compare ---

Version X: [A:3, B:0, C:0]
Version Y: [A:2, B:1, C:0]
```

### The Comparison Rule

Vector `V1` is **strictly newer** (dominates) `V2` only if every slot in `V1` is greater than or equal to the corresponding slot in `V2`, and at least one slot is strictly greater. Here, X has a higher `A` counter but a lower `B` counter than Y — neither dominates the other. The database concludes they are **concurrent**: a genuine conflict, not a case where one write simply "came later."

```text
                     [A:0, B:0]
                         │
                    add Apple
                         │
                     [A:1, B:0]
                         │
                    add Banana
                         │
                     [A:2, B:0]
                    ╱           ╲
        (Node A branch)      (Node B branch)
     remove Banana            add Carrot
       [A:3, B:0]              [A:2, B:1]
              ╲                  ╱
               CONCURRENT — neither dominates
                   store both as siblings
```

## Implementation: Increment, Compare, Merge in TypeScript

```typescript
type VectorClock = Record<string, number>;

export class VersionedRecord<T> {
  constructor(
    public value: T,
    public clock: VectorClock = {},
  ) {}

  // Called by whichever node processes a write for this record.
  increment(nodeId: string): VersionedRecord<T> {
    const next: VectorClock = { ...this.clock };
    next[nodeId] = (next[nodeId] ?? 0) + 1;
    return new VersionedRecord(this.value, next);
  }
}

export type ClockOrder = 'BEFORE' | 'AFTER' | 'CONCURRENT' | 'EQUAL';

// Compares two vector clocks to determine causal ordering.
export function compareClocks(a: VectorClock, b: VectorClock): ClockOrder {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let aHasGreater = false;
  let bHasGreater = false;

  for (const key of keys) {
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    if (av > bv) aHasGreater = true;
    if (bv > av) bHasGreater = true;
  }

  if (aHasGreater && bHasGreater) return 'CONCURRENT';
  if (aHasGreater) return 'AFTER';
  if (bHasGreater) return 'BEFORE';
  return 'EQUAL';
}

// Decides what to store on write: replace, ignore, or keep both as siblings.
export function reconcile<T>(
  incoming: VersionedRecord<T>,
  existing: VersionedRecord<T>[],
): VersionedRecord<T>[] {
  const siblings: VersionedRecord<T>[] = [];
  let incomingIsObsolete = false;

  for (const current of existing) {
    const order = compareClocks(incoming.clock, current.clock);
    if (order === 'AFTER') {
      continue; // incoming dominates current -> drop current
    }
    if (order === 'BEFORE') {
      incomingIsObsolete = true; // an existing sibling already dominates incoming
      siblings.push(current);
      continue;
    }
    siblings.push(current); // EQUAL or CONCURRENT -> keep current as-is
  }

  if (!incomingIsObsolete) {
    siblings.push(incoming);
  }
  return siblings;
}
```

```typescript
// Usage: reproducing the shopping-cart split from above.
let cartOnA = new VersionedRecord<string[]>(['Apple']).increment('A'); // [A:1]
cartOnA = cartOnA.increment('A'); // add Banana -> value updated externally, clock [A:2]

const cartOnB = new VersionedRecord<string[]>(cartOnA.value, cartOnA.clock);

// Partition: A removes Banana, B adds Carrot, independently.
const versionX = cartOnA.increment('A'); // [A:3, B:0]
const versionY = cartOnB.increment('B'); // [A:2, B:1]

const merged = reconcile(versionX, [versionY]);
console.log(merged.length); // 2 -> both stored as siblings, app must merge them
```

## Resolution: Sibling Records

Because the database cannot safely pick a winner without silently discarding a concurrent update, it stores **both** versions as siblings and returns both on the next read. The client application — which understands the *semantics* of the data, unlike the storage engine — merges them: for a shopping cart, that typically means a union of adds and removes (Apple + Carrot, Banana removed), then writes back a single reconciled record with a new vector clock that dominates both parents.

## Architectural Takeaway

Vector clocks let a distributed system achieve high availability — always accept a write, even mid-partition — without silently losing data to an incorrect "last write wins" heuristic based on wall-clock time. The cost is real: siblings must be surfaced to and merged by application code, and the vector itself grows with the number of distinct nodes that have ever written a record (production systems like Riak historically pruned this with **Dotted Version Vectors**, which track per-client-session context instead of raw node counts). Reach for vector clocks — or their DVV successors — specifically when your system must never reject a write during a partition, but silently overwriting concurrent updates is unacceptable.
