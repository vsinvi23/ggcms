# Sharded Database Routing: Stabilizing Node Failures with Consistent Hashing and VNodes

## The Problem: The Modulo Hashing Migration Nightmare

When scaling a database horizontally, developers often shard data across multiple physical nodes. A common initial routing strategy is simple **modulo hashing**:

$$\text{Shard ID} = \text{hash}(\text{key}) \pmod N$$

Where $N$ is the number of database shards. This works perfectly under static conditions. However, in modern dynamic cloud environments, shards are regularly added to scale capacity or removed due to hardware failures. 

If $N$ changes from 4 to 5, the math completely collapses. Because the denominator has changed, nearly $90\%$ of all keys will suddenly hash to a different shard ID. 

```
N = 4 shards: hash("user_102") % 4 = 2 (Routes to Shard 2)
N = 5 shards: hash("user_102") % 5 = 3 (Routes to Shard 3 - MISS!)
```

This sudden routing shift causes a catastrophic **cache stampede** if sharding a caching layer, or forces an immediate, cluster-wide data-redistribution migration for a database. Your system is brought to its knees under the intense network and disk I/O of re-sharding.

---

## The Mental Model: Consistent Hashing Rings and Virtual Nodes

Consistent Hashing resolves this by decoupling key routing from the absolute number of active nodes. 

Instead of a linear array, we map both **data keys** and **physical servers** onto a continuous 360-degree mathematical circle called the **Hash Ring** (ranging from $0$ to $2^{32} - 1$).

```
                      [0 / 2^32 - 1]
                       /          \
                Node A-vn1       Node B-vn1
                  /                    \
                 |   Key ("user_102")   |
                 |      (Hashes here)   |
                 |          |           |
                 |          v           |
                 |   (Walk Clockwise)   |
                 |          |           |
                  \         v          /
                Node C-vn1 <-----------
```

To route a key, we hash the key to get its position on the ring. We then walk clockwise until we encounter the first mapped node. If a node fails, only the keys that were directly mapping to that specific node must be reassigned to its clockwise neighbor. The rest of the cluster routing remains entirely unaffected.

However, if we only map physical nodes directly, they might be distributed unevenly, leading to "hotspots" where one node handles $80\%$ of the key space. To solve this, we introduce **Virtual Nodes (VNodes)**. Each physical server is assigned multiple (e.g., 100 to 200) virtual positions on the ring. This spreads the keys uniformly across all physical hardware, ensuring load balancing.

---

## Implementing a Consistent Hash Ring with VNodes

Below is a complete, highly optimized TypeScript implementation of a Consistent Hash Ring utilizing binary search for $O(\log M)$ node lookups.

```typescript
import crypto from 'crypto';

export class ConsistentHashRing {
  private ring: { hash: number; physicalNode: string }[] = [];
  private readonly vnodeCount: number;

  constructor(vnodeCount = 100) {
    this.vnodeCount = vnodeCount;
  }

  // 1. Unsigned 32-bit Integer Hash Function
  private hash(key: string): number {
    const md5 = crypto.createHash('md5').update(key).digest();
    return md5.readUInt32BE(0); // Outputs integer between 0 and 2^32 - 1
  }

  // 2. Add Physical Node with VNodes
  public addNode(node: string): void {
    for (let i = 0; i < this.vnodeCount; i++) {
      const vnodeKey = `${node}-vnode-${i}`;
      const vnodeHash = this.hash(vnodeKey);
      this.ring.push({ hash: vnodeHash, physicalNode: node });
    }
    // Maintain sorted ring for binary search lookups
    this.ring.sort((a, b) => a.hash - b.hash);
  }

  // 3. Remove Physical Node and its VNodes
  public removeNode(node: string): void {
    this.ring = this.ring.filter(item => item.physicalNode !== node);
  }

  // 4. Locate the closest clockwise Node for a key
  public getNode(key: string): string {
    if (this.ring.length === 0) {
      throw new Error('No active database nodes mapped in the ring.');
    }

    const keyHash = this.hash(key);
    
    // Binary search to find the first node with hash >= keyHash
    let low = 0;
    let high = this.ring.length - 1;
    let index = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.ring[mid].hash >= keyHash) {
        index = mid;
        high = mid - 1; // Look for a closer node to the left
      } else {
        low = mid + 1;
      }
    }

    // Wrap around to index 0 if keyHash is greater than all hashes on the ring
    return this.ring[index].physicalNode;
  }
}
```

---

## Architectural Guardrails and Trade-offs

1. **VNode Count Tuning**: A higher VNode count (e.g., 250) yields a more uniform key distribution but increases lookup latency and memory consumption. A sorted array of 100,000 VNodes is fast for binary search, but must be managed as a singleton to prevent garbage collection spikes.
2. **Weighted Nodes**: In heterogeneous clusters, configure physical servers with different VNode counts based on their memory and CPU specifications.
3. **Data Replication**: In production sharded systems, replicate keys not only to the first clockwise node but also to the next $K$ subsequent physical nodes on the ring to maintain high availability.
