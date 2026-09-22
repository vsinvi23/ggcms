---
title: "Consistent Hashing: Routing Data Without Catastrophic Rebalancing"
description: "Why modulo-based sharding collapses cache hit rates when a node fails, how consistent hashing and virtual nodes solve it, with a runnable Python hash-ring implementation."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "consistent-hashing"
  - "hash-ring"
  - "distributed-caching"
  - "virtual-nodes"
  - "system-design"
  - "python"
---

# Consistent Hashing: Routing Data Without Catastrophic Rebalancing

## The Problem

Imagine you are building a distributed Redis cache with 5 servers. To decide which server holds a specific piece of data (e.g., `user_123`), you use a simple modulo hash: `server_index = hash("user_123") % 5`.

This works perfectly until a server crashes. Suddenly, you have 4 servers. The formula becomes `hash("user_123") % 4`. Because the modulo divisor changed, nearly *every single key* now hashes to a different server. Your cache hit rate drops to zero, and a massive wave of cache misses instantly crushes your backend database — the exact "thundering herd" scenario the cache existed to prevent.

We need a hashing algorithm where adding or removing a node only affects the data that was sitting on that specific node.

```text
Modulo hashing with 5 servers:                Same keys after 1 server dies (4 servers):

key -> hash % 5                               key -> hash % 4
"user_1" (h=101) -> 101 % 5 = 1  [Server 1]    "user_1" (h=101) -> 101 % 4 = 1  [Server 1] (lucky)
"user_2" (h=102) -> 102 % 5 = 2  [Server 2]    "user_2" (h=102) -> 102 % 4 = 2  [Server 2] (lucky)
"user_3" (h=103) -> 103 % 5 = 3  [Server 3]    "user_3" (h=103) -> 103 % 4 = 3  [Server 3] (lucky)
"user_4" (h=104) -> 104 % 5 = 4  [Server 4]    "user_4" (h=104) -> 104 % 4 = 0  [Server 0] REMAPPED
"user_5" (h=105) -> 105 % 5 = 0  [Server 0]    "user_5" (h=105) -> 105 % 4 = 1  [Server 1] REMAPPED
                                               -> in practice, ~80% of keys remap on real workloads
```

## The Mental Model

Stop thinking of your servers as an array (`[0, 1, 2, 3, 4]`). Instead, think of a massive roulette wheel or a 360-degree clock face (a "hash ring"). Both the servers and the data are placed somewhere on the edge of this wheel.

## How Consistent Hashing Works

1. **The Ring:** We create a massive mathematical ring, typically representing numbers from `0` to `2^32 - 1`.
2. **Placing Servers:** We take the IP address or ID of our servers (Node A, Node B, Node C), run them through a hash function (like SHA-1 or MD5), and place them on the ring.
3. **Placing Data:** When a request for `user_123` arrives, we hash the key `"user_123"` using the *same* hash function, placing the data point somewhere on the ring.
4. **Routing:** To find out which server holds the data, we start at the data's position on the ring and move **clockwise** until we encounter the first server.

```text
                              0 / 2^32
                                |
                    Key4  x     |     Node A
                         \      |      /
                           \    |    /
                Node C ------- RING ------- (clockwise routing)
                           /    |    \
                         /      |      \
                    Key1        |        Key2 -> next clockwise node = Node A
                              Node B

  Key1 (between Node C and Node B) -> routes clockwise to -> Node B
  Key2 (between Node A and Node C) -> routes clockwise to -> Node C
  Key4 (between Node C and Node A) -> routes clockwise to -> Node A
```

### Handling Failures

If Node B crashes, it is removed from the ring. According to our clockwise rule, any data that previously belonged to Node B will now naturally fall to the next server in line (Node C).
Crucially, the data belonging to Node A and Node C *does not move*. Only `1/N` of the data (where N is the number of servers) is remapped — not nearly all of it, as with modulo hashing.

### The Unbalanced Problem (Virtual Nodes)

If you only have 3 servers on a massive ring, they might clump together randomly, meaning one server ends up responsible for 80% of the ring.

To solve this, we introduce **Virtual Nodes (V-Nodes)**. Instead of hashing Node A once, we hash it 100 times using slight variations (`NodeA#1`, `NodeA#2`, ..., `NodeA#100`). We do this for all servers.

The ring is now populated with hundreds of virtual nodes, perfectly distributing the load. When a virtual node intercepts data, it routes it back to the physical server it represents.

### Reference Implementation (Python)

```python
import bisect
import hashlib
from typing import Dict, List, Optional


class ConsistentHashRing:
    """A consistent hash ring with virtual nodes for even load distribution."""

    def __init__(self, virtual_nodes_per_server: int = 150):
        self.virtual_nodes_per_server = virtual_nodes_per_server
        self.ring: Dict[int, str] = {}        # position on ring -> physical server
        self.sorted_positions: List[int] = []  # kept sorted for binary search

    def _hash(self, key: str) -> int:
        return int(hashlib.sha1(key.encode()).hexdigest(), 16)

    def add_server(self, server_id: str) -> None:
        for i in range(self.virtual_nodes_per_server):
            position = self._hash(f"{server_id}#{i}")
            self.ring[position] = server_id
            bisect.insort(self.sorted_positions, position)

    def remove_server(self, server_id: str) -> None:
        for i in range(self.virtual_nodes_per_server):
            position = self._hash(f"{server_id}#{i}")
            del self.ring[position]
            self.sorted_positions.remove(position)

    def get_server(self, key: str) -> Optional[str]:
        if not self.ring:
            return None
        position = self._hash(key)
        # Find the first virtual-node position >= the key's position (clockwise).
        idx = bisect.bisect(self.sorted_positions, position)
        if idx == len(self.sorted_positions):
            idx = 0  # wrap around the ring
        return self.ring[self.sorted_positions[idx]]


# --- Usage ---
ring = ConsistentHashRing(virtual_nodes_per_server=150)
for server in ["cache-a", "cache-b", "cache-c", "cache-d", "cache-e"]:
    ring.add_server(server)

print(ring.get_server("user_123"))  # e.g. "cache-c"

# Simulate a node failure — only keys owned by cache-b remap, not all keys.
ring.remove_server("cache-b")
print(ring.get_server("user_123"))  # unaffected if it wasn't on cache-b
```

## Architectural Takeaway

Consistent hashing is the fundamental routing algorithm for almost every modern distributed system that partitions state. It is the core routing mechanism behind Amazon DynamoDB, Apache Cassandra, Riak, and massive CDN edge routers like Akamai. Use it whenever you need to dynamically scale a stateful fleet of servers without causing catastrophic data migrations.
