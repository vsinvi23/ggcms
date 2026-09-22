---
title: "Vector DB Internals: Hierarchical Navigable Small World (HNSW) Graphs"
description: "How HNSW turns O(N) brute-force nearest-neighbor search into O(log N) layered graph routing — Navigable Small World graphs, the skip-list-style hierarchy, key tuning parameters, and a working NumPy implementation."
type: "ARTICLE"
categorySlug: "generative-ai"
articleType: "DEEP_DIVE"
tags:
  - "hnsw"
  - "approximate-nearest-neighbor"
  - "vector-database"
  - "vector-index"
  - "graph-search"
  - "embeddings"
---

# Vector DB Internals: Hierarchical Navigable Small World (HNSW) Graphs

A vector database advertises sub-millisecond search over 10 million 1536-dimensional embeddings. A brute-force nearest-neighbor scan over that same dataset — comparing the query against every stored vector — would require roughly 15 billion floating-point operations per query. That's not a tuning problem; it's an algorithmic one. HNSW is the graph structure that makes the sub-millisecond number possible, and understanding *how* it does that is what lets you reason correctly about its tuning knobs (`M`, `efConstruction`, `efSearch`) instead of copy-pasting values from a blog post.

## The Problem: The K-Nearest-Neighbors Bottleneck

Generative AI relies heavily on vector embeddings to represent text, images, and audio. To find similar concepts, you perform a K-Nearest-Neighbors (KNN) search.

The naive approach is **flat search (exact KNN)**: calculate the distance (cosine similarity, or L2/Euclidean distance) between the query vector and *every single vector* in the database.

```
K-Nearest Neighbors (KNN) Linear Scan:
  Query Vector ---> [Scan Doc 1, Doc 2, ..., Doc N] ---> O(N * d) complexity (extremely slow)
```

With 10 million vectors at 1536 dimensions each (a common OpenAI embedding size), a single query requires roughly 15 billion float operations. This `O(N · d)` linear scan is computationally impossible for real-time applications once `N` grows into the millions — queries would take seconds, not milliseconds.

To achieve millisecond latency, vector databases (Pinecone, Milvus, Qdrant, pgvector) use **Approximate Nearest Neighbor (ANN)** algorithms, trading a small amount of accuracy for a large amount of speed. The dominant ANN algorithm today is **HNSW (Hierarchical Navigable Small World)**.

## Building Block: Navigable Small World (NSW) Graphs

Before HNSW, there was NSW. Imagine vectors not as rows in a table, but as nodes in a graph. If you connect each node to its closest semantic neighbors, you get a "navigable small world" — the same "six degrees of separation" property that makes social networks navigable with only local information.

To search this graph:

1. Start at a random entry node.
2. Evaluate the neighbors of the current node.
3. Move to whichever neighbor is closest to the target query vector (**greedy routing**).
4. Repeat until you hit a **local minimum** — a node where no neighbor is closer to the query than the node itself.

**The flaw in plain NSW:** with millions of nodes, traversing from a random start node to the target region can still take many hops, and greedy routing can get trapped in local clusters before ever reaching the true nearest neighbors.

## HNSW: Adding the Hierarchical Layer

HNSW fixes the traversal problem by borrowing the core idea from **skip lists**: it stacks multiple layers of NSW graphs on top of each other, with progressively sparser connectivity at higher layers.

```
+---------------------------------------------------------------------------------+
| HNSW Multi-Layer Navigation & Greedy Routing                                    |
+---------------------------------------------------------------------------------+
|                                                                                   |
|   Layer 2 (Sparse)     [Entry Point] --------------------------> (Local Best)   |
|                                                                        |         |
|                                                                        v Drop to Layer 1
|   Layer 1 (Medium)                                              [Local Best]    |
|                                                                        |         |
|                                                        +---------------+         |
|                                                        |                         |
|                                                        v                         |
|                                            [Route through neighbors] -> (Local Best)
|                                                                              |    |
|                                                                              v    |
|   Layer 0 (Dense, every vector)                                        [Local Best]
|                                                                              |    |
|                                                                              v    |
|                                                                       (Exact-ish top-K)
+---------------------------------------------------------------------------------+
```

- **Layer 0 (base layer)** contains *every* vector in the database, densely connected to its immediate spatial neighbors — this is the layer that ultimately determines the returned nearest neighbors.
- **Higher layers** (Layer 1, Layer 2, ...) contain exponentially fewer nodes. Only a randomly-selected subset of vectors is "promoted" to each higher layer, and connections at these layers span much larger semantic distances — the "express lanes."

### The Search Algorithm

1. **Start at the top.** Begin at a predefined entry point on the highest (sparsest) layer.
2. **Greedy routing.** Traverse the current layer, always stepping to whichever neighbor is closest to the query vector, until reaching a local minimum.
3. **Drop down.** Once a local minimum is reached on the current layer, drop to the *exact same node* on the layer below and resume greedy routing from there.
4. **Repeat** until Layer 0 is reached.
5. **Stop at Layer 0.** Because Layer 0 is fully populated (every vector is present), the local minimum found there is the algorithm's approximate answer — the returned top-*k* nearest neighbors.

```
+-------------------------------------------------------+
|                 HNSW Layered Search                    |
+-------------------------------------------------------+
| Layer 2 (Sparse)    [A] --------------------> [B]      |
|                       |                         |       |
| Layer 1 (Medium)    [A] ----> [C] ----------> [B]      |
|                       |         |               |       |
| Layer 0 (Dense)     [A] -[D]- [C] -[E]- [F] - [B]      |
+-------------------------------------------------------+
      <---- Query vector's target is near [C] ---->
```

Because the top layers quickly narrow down the search region — like zooming in on a map, where Layer 2 finds the right country, Layer 1 finds the right city, and Layer 0 finds the exact street address — this hierarchical approach reduces search complexity from `O(N)` to roughly `O(log N)`, bypassing the linear scan entirely while still recovering nearly-exact results.

## Insertion: Building the Graph

Inserting a new vector into an existing HNSW index is itself a multi-step process:

1. **Assign a max layer.** The vector is randomly assigned a maximum layer $L$ it will appear on. The probability of reaching higher layers drops exponentially (roughly $P(L) \sim e^{-L}$), which is what keeps higher layers sparse without any central planning.
2. **Search to insert.** The algorithm runs the same greedy search described above, at each layer up to $L$, to find the new vector's nearest existing neighbors.
3. **Wire the edges.** At each layer, the new vector is connected to its $M$ nearest neighbors found during the search.
4. **Prune edges.** To preserve the graph's navigability and bound memory usage, a heuristic ensures no node exceeds $M_{max}$ connections — favoring diverse, spread-out connections over redundant local clusters, since a node connected only to near-duplicates of itself is a poor router for distant queries.

## Key Configuration Parameters

| Parameter | Function | Operational trade-off |
| :--- | :--- | :--- |
| **M** | Max bidirectional connections per node, per layer. | Higher $M$ improves recall on high-dimensional data but increases memory usage and construction time. |
| **efConstruction** | Size of the dynamic candidate list evaluated during index build. | Higher values increase build time but produce a better-connected, more accurate graph. |
| **efSearch** | Size of the dynamic candidate list evaluated during query execution. | Higher values increase query latency but improve recall — this is the knob you tune post-deployment, per query, without rebuilding the index. |

`M` and `efConstruction` are one-time build-time costs; `efSearch` is the knob you can adjust live to trade latency for recall as your accuracy requirements change.

## Implementation: A Core HNSW-Style Greedy Search Engine

This NumPy implementation demonstrates the routing math on a single graph layer — the mechanism that repeats at every layer of a real multi-layer HNSW index.

```python
import numpy as np
from typing import Dict, List, Set, Tuple


def cosine_distance(u: np.ndarray, v: np.ndarray) -> float:
    """Computes cosine distance (1 - cosine similarity) between two vectors."""
    dot_product = np.dot(u, v)
    norm_u = np.linalg.norm(u)
    norm_v = np.linalg.norm(v)
    if norm_u == 0.0 or norm_v == 0.0:
        return 1.0
    similarity = dot_product / (norm_u * norm_v)
    return 1.0 - float(np.clip(similarity, -1.0, 1.0))


class HNSWLayerSimulation:
    def __init__(self, dimension: int):
        self.dimension = dimension
        self.vectors: Dict[int, np.ndarray] = {}
        self.adjacency: Dict[int, List[int]] = {}

    def add_node(self, node_id: int, vector: np.ndarray, neighbors: List[int]):
        """Adds a node with pre-defined spatial neighbors to the graph (bidirectional)."""
        self.vectors[node_id] = vector / np.linalg.norm(vector)
        self.adjacency[node_id] = neighbors
        for neighbor in neighbors:
            if neighbor not in self.adjacency:
                self.adjacency[neighbor] = []
            if node_id not in self.adjacency[neighbor]:
                self.adjacency[neighbor].append(node_id)

    def greedy_search(self, query_vector: np.ndarray, entry_point: int) -> Tuple[int, float]:
        """Greedily traverses the graph layer to find the node closest to the query."""
        query_vector = query_vector / np.linalg.norm(query_vector)
        current_node = entry_point
        current_dist = cosine_distance(query_vector, self.vectors[current_node])

        visited: Set[int] = {current_node}
        changed = True

        print(f"Starting search from entry point: Node {entry_point} (dist {current_dist:.4f})")

        while changed:
            changed = False
            best_neighbor = current_node
            best_dist = current_dist

            for neighbor in self.adjacency[current_node]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    dist = cosine_distance(query_vector, self.vectors[neighbor])
                    if dist < best_dist:
                        best_dist = dist
                        best_neighbor = neighbor
                        changed = True

            if changed:
                print(f"--> Stepping to Node {best_neighbor} (dist {best_dist:.4f})")
                current_node = best_neighbor
                current_dist = best_dist

        return current_node, current_dist


if __name__ == "__main__":
    np.random.seed(42)
    space = HNSWLayerSimulation(dimension=3)

    # Nodes spread across regions of a 3D vector space
    space.add_node(0, np.array([0.1, 0.9, 0.0]), neighbors=[1])   # North
    space.add_node(1, np.array([0.2, 0.7, 0.1]), neighbors=[0, 2])  # Mid-North
    space.add_node(2, np.array([0.4, 0.4, 0.4]), neighbors=[1, 3])  # Center
    space.add_node(3, np.array([0.7, 0.2, 0.6]), neighbors=[2, 4])  # Mid-South
    space.add_node(4, np.array([0.9, 0.1, 0.1]), neighbors=[3])   # South (target region)

    query = np.array([0.85, 0.15, 0.12])  # physically close to Node 4

    print("Graph adjacency:")
    for node, neighbors in space.adjacency.items():
        print(f"  Node {node} -> {neighbors}")

    print("\nRunning greedy routing from Node 0 (North) toward query (South)...")
    best_node, final_distance = space.greedy_search(query, entry_point=0)

    print(f"\nNearest node found: Node {best_node} (cosine distance {final_distance:.4f})")

    # Verify against brute-force linear scan
    distances = {nid: cosine_distance(query, vec) for nid, vec in space.vectors.items()}
    best_bf = min(distances, key=distances.get)
    print(f"True nearest (brute-force): Node {best_bf} (dist {distances[best_bf]:.4f})")

    assert best_node == best_bf, "HNSW greedy search failed to locate the true closest node."
    print("Verification successful: greedy search located the optimal nearest neighbor.")
```

## Key Takeaways

- Flat, brute-force KNN search is `O(N · d)` — correct, but too slow past a few hundred thousand vectors for real-time queries.
- HNSW combines **Navigable Small World graphs** (local, spatially-connected routing) with a **skip-list-style layer hierarchy** (long-range shortcuts at sparse upper layers) to route queries in roughly `O(log N)` time.
- Search always starts at the sparsest layer and greedily descends: each layer narrows the search region before handing off to the denser layer below, until Layer 0 — which contains every vector — produces the final approximate answer.
- `M` and `efConstruction` control build-time graph quality and cost; `efSearch` is the one knob you can retune after deployment to trade query latency against recall without rebuilding the index.
- HNSW sacrifices a small, tunable amount of recall for a large, necessary reduction in query latency — that trade-off is the entire reason ANN search exists as a field.
