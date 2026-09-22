# Sharded Database Routing: Stabilizing Node Failures with Consistent Hashing and Virtual Nodes (VNodes)

## The Problem: The Modulo Hashing Collapse
In distributed caching (like Memcached) or databases (like Cassandra), we must map a key to a specific node. The naive approach is Modulo Hashing:
`NodeIndex = Hash(Key) % N` (where N is the number of nodes).

If a node fails or we scale up, N changes. If N changes from 4 to 5, almost *every* key maps to a new node. This results in massive cache misses or data migrations, causing a system-wide latency spike or database collapse (the "thundering herd" problem).

## The Solution: Consistent Hashing
Consistent Hashing maps both the keys and the nodes onto a circular abstract space (a "hash ring").

```text
      [Node A] (Hash: 10)
     /        \
(Hash 90)     (Hash 30) [Node B]
  [Node D]    /
     \       /
      [Node C] (Hash: 60)
```

1. Hash the nodes' IP addresses or IDs and place them on the ring (e.g., 0 to 359 degrees).
2. Hash the Data Key (e.g., "user_123").
3. Walk clockwise on the ring from the Data Key's hash until you find a Node. Store/retrieve the data there.

### The Benefit
If Node C fails, only the keys that mapped to Node C are re-routed (to Node D). Keys mapping to Nodes A, B, and D remain completely unaffected. Data movement is minimal.

## The Flaw: Non-Uniform Distribution
In practice, nodes are not spaced evenly on the ring. Node A and Node B might be very close together, causing Node B to take almost no traffic, while a large gap before Node C causes C to become a hot spot.

Furthermore, heterogeneous hardware is a problem. If Node A has 128GB RAM and Node B has 32GB, the hash ring doesn't know this and assigns roughly equal probability to both.

## Virtual Nodes (VNodes)
To solve non-uniform distribution and hardware heterogeneity, we introduce Virtual Nodes (VNodes).
Instead of mapping Node A to the ring once, we map Node A to the ring *multiple times* using different hashes (e.g., `Hash("NodeA_1")`, `Hash("NodeA_2")`).

```text
Ring:
NodeA_1 -> NodeB_1 -> NodeC_1 -> NodeA_2 -> NodeB_2 -> NodeC_2
```

### Advantages of VNodes
1. **Perfect Load Balancing:** With hundreds of VNodes per physical server, the distribution of keys becomes statistically uniform.
2. **Heterogeneous Weighting:** If Node A is twice as powerful as Node B, we simply assign twice as many VNodes to Node A.
3. **Rapid Rebalancing:** When a node fails, its VNodes disappear. Its load is distributed evenly among *all* remaining nodes in the cluster, rather than overwhelming a single adjacent node.

## Code Example: Consistent Hash Ring Implementation
```python
import hashlib
import bisect

class ConsistentHashRing:
    def __init__(self, vnodes_per_node=100):
        self.vnodes_per_node = vnodes_per_node
        self.ring = []
        self.nodes = {}

    def _hash(self, key):
        return int(hashlib.md5(key.encode('utf-8')).hexdigest(), 16)

    def add_node(self, node_name):
        for i in range(self.vnodes_per_node):
            vnode_key = f"{node_name}:{i}"
            h = self._hash(vnode_key)
            self.ring.append(h)
            self.nodes[h] = node_name
        self.ring.sort()

    def get_node(self, key):
        if not self.ring:
            return None
        h = self._hash(key)
        idx = bisect.bisect(self.ring, h)
        if idx == len(self.ring):
            idx = 0 # Wrap around
        return self.nodes[self.ring[idx]]
```

Consistent Hashing with VNodes provides stable routing and elastic scalability, forming the backbone of distributed systems like DynamoDB, Cassandra, and Riak.
