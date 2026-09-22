# Vector DB Internals: Hierarchical Navigable Small World (HNSW) Graphs

**The Problem:** Finding the closest vector (Cosine Similarity or L2 distance) to a query vector in a database of billions of embeddings requires computing the distance against every single vector. This $O(N)$ Exact Nearest Neighbor (k-NN) search is too slow for production. Vector databases (like Pinecone, Milvus, Qdrant, or pgvector) rely on Approximate Nearest Neighbor (ANN) algorithms to achieve sub-millisecond latencies at scale. HNSW is the undisputed king of ANN algorithms.

## Small World Graphs

HNSW is based on the concept of a Navigable Small World (NSW) graph. In a graph where vectors are nodes and edges connect them based on proximity, you can navigate from an entry node to a target node very quickly if the graph has both short-range (local) and long-range (expressway) connections.

To search an NSW graph:
1. Start at a predefined entry point.
2. Evaluate all connected neighbors.
3. Move to the neighbor closest to the query vector.
4. Repeat (Greedy Routing) until a local minimum is reached.

The issue with flat NSW is that early routing is slow because the graph is too dense; long-range traversal takes too many hops.

## Hierarchical Navigable Small World (HNSW)

HNSW solves this by introducing a layer architecture, inspired by Skip Lists. The graph is built hierarchically with multiple layers.

```text
Layer 3 (Top):    [ Node A ] ------------------------> [ Node Z ]
                     |                                    |
Layer 2:          [ Node A ] ----> [ Node M ] ----> [ Node Z ]
                     |                 |                  |
Layer 1 (Base):   [ Node A ] - [B] - [M] - [X] - [Y] - [Z]
```

### Architecture Mechanics
- **Layer 0 (Base Layer):** Contains *all* vectors. Extremely dense local connections.
- **Higher Layers:** Contain exponentially fewer vectors. Connections act as long-range expressways.
- When inserting a vector, a random probability function determines its maximum layer height (most nodes only exist in layer 0, a few make it to layer 1, very few to layer 2, etc.).

## The HNSW Search Algorithm

1. **Start at the Top:** Search begins at the entry point of the highest layer.
2. **Greedy Routing Downward:** At the current layer, move to the neighbor closest to the query vector.
3. **Drop a Layer:** When no neighbor is closer to the query than the current node, drop down to the exact same node in the layer below.
4. **Repeat:** The search resumes at the lower layer, which has more nodes and finer granularity.
5. **Base Layer Execution:** When the search reaches Layer 0, the algorithm switches from a single-node greedy search to a priority queue (maintaining a dynamic list of the $ef\_search$ closest candidates) to find the final Top-K results.

### The Math of Search Parameters

HNSW requires tuning two critical hyperparameters that balance Speed vs. Recall.

- **`m` (Max Edges):** The maximum number of connections a node can have per layer. Higher `m` increases recall (better accuracy) but drastically increases memory consumption and construction time.
- **`ef_search` (Execution Factor for Search):** The size of the dynamic priority queue used during the search phase, especially at Layer 0. 

```python
# Conceptual behavior of ef_search at Layer 0
candidates_queue = [entry_node]
visited = {entry_node}
results_pool = [] # Size bound by ef_search

while candidates_queue:
    current = candidates_queue.pop_closest_to(query)
    for neighbor in current.get_neighbors():
        if neighbor not in visited:
            visited.add(neighbor)
            dist = calculate_distance(query, neighbor)
            
            # Keep pool sorted. If better than worst in pool, add it.
            if len(results_pool) < ef_search or dist < results_pool.worst_dist():
                results_pool.insert(neighbor, dist)
                candidates_queue.add(neighbor)
```

If `ef_search` is set to 50, the algorithm evaluates a wide net of possibilities, maximizing recall. If set to 10, it's fast but might get stuck in a local minimum.

## Hardware Trade-offs

HNSW is incredibly fast, achieving $O(\log N)$ logarithmic complexity for searches. However, it is **highly memory intensive**. Unlike Product Quantization (PQ), which compresses vectors, HNSW keeps the full vectors in memory *plus* the heavy overhead of the graph edge pointers. For 1 billion 768-dimensional vectors, the HNSW index alone can consume hundreds of gigabytes of RAM, necessitating tiering strategies in modern Vector DBs.
