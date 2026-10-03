---
title: "Consistent Hashing and Virtual Nodes for Sharded Systems"
description: "How consistent hashing rings and virtual nodes stop a single shard addition or removal from remapping most of your keyspace, with a full binary-search-based TypeScript implementation."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "DEEP_DIVE"
tags:
  - "consistent-hashing"
  - "sharding"
  - "distributed-systems"
  - "virtual-nodes"
  - "hash-ring"
---

# Consistent Hashing and Virtual Nodes for Sharded Systems

## The Problem: The Modulo Hashing Migration Nightmare

When scaling a database or cache horizontally, engineers shard data across multiple physical nodes. A common initial routing strategy is simple **modulo hashing**:

```
Shard ID = hash(key) mod N
```

Where `N` is the number of shards. This works perfectly under static conditions. But in dynamic cloud environments, shards are regularly added to scale capacity or removed due to hardware failures. If `N` changes from 4 to 5, the math collapses — because the denominator changed, nearly 90% of all keys suddenly hash to a different shard:

```
N = 4 shards: hash("user_102") % 4 = 2   (routes to Shard 2)
N = 5 shards: hash("user_102") % 5 = 3   (routes to Shard 3 — MISS!)
```

This sudden routing shift causes a catastrophic **cache stampede** if you're sharding a caching layer, or forces an immediate, cluster-wide data-redistribution migration for a database — your system grinds under the network and disk I/O of re-sharding almost every key at once.

## The Mental Model: Hash Rings and Virtual Nodes

Consistent hashing decouples key routing from the absolute number of active nodes. Instead of a linear array indexed by `key % N`, both **data keys** and **physical servers** are mapped onto a continuous ring (conceptually `0` to `2^32 - 1`).

```
                              0 / 2^32-1
                          ┌───────┴───────┐
                          │               │
                    Node A-vn1       Node B-vn1
                          │               │
                          │   key "user_102"
                          │   hashes here, then
                          │   walks CLOCKWISE
                          │   until it hits a node
                          │               │
                          └───────┬───────┘
                              Node C-vn1
                       (key "user_102" lands here)
```

To route a key: hash it to get a ring position, then walk clockwise until the first mapped node is found. If a node fails, only the keys that mapped directly to that node need reassignment — to its clockwise neighbor. The rest of the cluster's routing is untouched.

Mapping physical nodes directly onto the ring, however, distributes them unevenly — one node might end up owning 80% of the keyspace by chance. **Virtual Nodes (VNodes)** fix this: each physical server is assigned many (100-200) virtual positions on the ring, spreading its share of the keyspace uniformly across all physical hardware.

## Implementing a Consistent Hash Ring with VNodes

Below is a complete TypeScript implementation using binary search for `O(log M)` node lookups, where `M` is the total number of virtual node entries on the ring.

```typescript
import crypto from 'crypto';

export class ConsistentHashRing {
  private ring: { hash: number; physicalNode: string }[] = [];
  private readonly vnodeCount: number;

  constructor(vnodeCount = 100) {
    this.vnodeCount = vnodeCount;
  }

  // Unsigned 32-bit integer hash function
  private hash(key: string): number {
    const md5 = crypto.createHash('md5').update(key).digest();
    return md5.readUInt32BE(0); // 0 to 2^32 - 1
  }

  // Add a physical node, expanded into vnodeCount virtual positions
  public addNode(node: string): void {
    for (let i = 0; i < this.vnodeCount; i++) {
      const vnodeKey = `${node}-vnode-${i}`;
      const vnodeHash = this.hash(vnodeKey);
      this.ring.push({ hash: vnodeHash, physicalNode: node });
    }
    // Maintain sorted ring for binary search lookups
    this.ring.sort((a, b) => a.hash - b.hash);
  }

  // Remove a physical node and every virtual position it owned
  public removeNode(node: string): void {
    this.ring = this.ring.filter(item => item.physicalNode !== node);
  }

  // Locate the closest clockwise node for a key
  public getNode(key: string): string {
    if (this.ring.length === 0) {
      throw new Error('No active nodes mapped in the ring.');
    }

    const keyHash = this.hash(key);

    // Binary search for the first node with hash >= keyHash
    let low = 0;
    let high = this.ring.length - 1;
    let index = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.ring[mid].hash >= keyHash) {
        index = mid;
        high = mid - 1; // keep looking left for a closer node
      } else {
        low = mid + 1;
      }
    }

    // If keyHash is greater than every hash on the ring, wrap to index 0
    return this.ring[index].physicalNode;
  }
}
```

```typescript
// Usage: adding Node D barely disturbs existing routing
const ring = new ConsistentHashRing(150);
ring.addNode('node-a');
ring.addNode('node-b');
ring.addNode('node-c');

console.log(ring.getNode('user_102')); // e.g. "node-c"

ring.addNode('node-d');
console.log(ring.getNode('user_102')); // still "node-c" for most keys —
                                        // only keys whose ring position falls
                                        // between node-d's vnodes and their
                                        // previous owner get remapped
```

## Architectural Guardrails and Trade-offs

1. **VNode count tuning.** A higher VNode count (e.g., 250) yields a more uniform key distribution but increases lookup cost and memory. A sorted array of 100,000 VNode entries is still fast for binary search, but treat the ring as a singleton to avoid repeated allocation and GC pressure.
2. **Weighted nodes.** In heterogeneous clusters, give physical servers with more memory/CPU proportionally more VNodes so they absorb a larger share of the keyspace.
3. **Replication.** In production sharded systems, replicate each key not just to the first clockwise node, but to the next `K` subsequent physical nodes on the ring, so a single node failure doesn't cause data loss — only a routing change.

## Key Takeaways

- Modulo hashing (`hash(key) % N`) remaps almost the entire keyspace whenever `N` changes — unacceptable for systems that add or remove nodes dynamically.
- Consistent hashing maps both keys and nodes onto a ring; only the keys between a changed node and its neighbor move.
- Virtual nodes solve the uneven-distribution problem that plain consistent hashing has with a small number of physical nodes.
- Binary search over a sorted array of VNode hashes gives `O(log M)` routing lookups even at very large VNode counts.
