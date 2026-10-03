---
title: "Dijkstra's Algorithm in C++: Using std::priority_queue for Network Routing"
description: "Implement Dijkstra's shortest-path algorithm in C++ with a std::priority_queue min-heap and lazy deletion, modeling how network routers like OSPF pick fastest routes."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "GUIDE"
tags:
  - "cpp"
  - "graph-algorithms"
  - "dijkstra"
  - "priority-queue"
  - "shortest-path"
---

# Dijkstra's Algorithm in C++: Using std::priority_queue for Network Routing

## The Problem: Shortest Path on Weighted Graphs

Network routers using protocols like OSPF (Open Shortest Path First) need to determine the fastest route for data packets across a network where links have varying latencies or costs. Dijkstra's algorithm provides the optimal O((V + E) log V) solution for finding the single-source shortest path on graphs with non-negative edge weights.

## Memory-Level Internals of Dijkstra

Dijkstra's relies on a min-heap to constantly extract the closest known, unprocessed vertex. In C++, `std::priority_queue` is the standard tool. By default, it operates as a max-heap, so we invert its behavior using `std::greater`.

At the hardware level, `std::priority_queue` is an adapter over `std::vector`. Heap operations (`push` and `pop`) involve contiguous memory swaps, making them highly cache-efficient compared to pointer-based tree structures. However, C++'s standard queue lacks a `decrease_key` operation. Instead of updating an existing node's distance, we simply insert a new `(distance, vertex)` pair. The duplicate, obsolete nodes (stale pairs) are lazily discarded when extracted if their distance is strictly greater than the recorded shortest distance.

```text
 Min-Heap (vector-backed) after relaxing edges from Router 0:
 ┌────────────┬────────────┬────────────┬────────────┐
 │ (0, R0)    │ (3, R4)    │ (10, R1)   │ ...        │  <- top() always cheapest
 └────────────┴────────────┴────────────┴────────────┘
        pop (0,R0) -> relax R0's edges -> push (3,R4), (10,R1)
        pop (3,R4) -> relax R4's edges -> may push stale (11,R1); later popped & skipped
```

## Robust C++ Implementation

The implementation below models network nodes and uses lazy deletion to manage the min-heap effectively.

```cpp
#include <iostream>
#include <vector>
#include <queue>
#include <limits>

using namespace std;

const int INF = numeric_limits<int>::max();

// Defines an edge with a destination and weight (latency)
struct Edge {
    int to;
    int weight;
};

class NetworkGraph {
private:
    int vertices;
    vector<vector<Edge>> adjList;

public:
    NetworkGraph(int v) : vertices(v), adjList(v) {}

    void addEdge(int from, int to, int weight) {
        adjList[from].push_back({to, weight});
        // Uncomment for undirected graph:
        // adjList[to].push_back({from, weight});
    }

    vector<int> dijkstra(int source) {
        vector<int> distances(vertices, INF);
        distances[source] = 0;

        // Min-Heap storing {distance, vertex}
        using pii = pair<int, int>;
        priority_queue<pii, vector<pii>, greater<pii>> pq;

        pq.push({0, source});

        while (!pq.empty()) {
            int currentDist = pq.top().first;
            int u = pq.top().second;
            pq.pop();

            // Lazy deletion: ignore stale elements
            if (currentDist > distances[u]) {
                continue;
            }

            for (const auto& edge : adjList[u]) {
                int v = edge.to;
                int weight = edge.weight;

                // Relaxation step
                if (distances[u] + weight < distances[v]) {
                    distances[v] = distances[u] + weight;
                    pq.push({distances[v], v});
                }
            }
        }

        return distances;
    }
};

int main() {
    NetworkGraph router(5);
    router.addEdge(0, 1, 10);
    router.addEdge(0, 4, 3);
    router.addEdge(1, 2, 2);
    router.addEdge(1, 4, 4);
    router.addEdge(2, 3, 9);
    router.addEdge(3, 2, 7);
    router.addEdge(4, 1, 1);
    router.addEdge(4, 2, 8);
    router.addEdge(4, 3, 2);

    vector<int> shortestPaths = router.dijkstra(0);

    cout << "Latencies from Router 0:\n";
    for (int i = 0; i < shortestPaths.size(); i++) {
        cout << "To Router " << i << " : " << shortestPaths[i] << " ms\n";
    }

    return 0;
}
```

## Architectural Considerations

The lazy deletion approach pushes O(E) elements into the heap, yielding O(E log E) time, which is effectively O(E log V) since E ≤ V². If the graph is extremely dense, writing a custom min-heap with a vertex-to-heap-index array to support O(log V) `decrease_key` operations strictly bounds the complexity to O(E + V log V).

Additionally, grouping `Edge` structs by destination and weight in a 1D vector (Compressed Sparse Row layout) guarantees optimal cache line utilization during the relaxation step loop, a crucial optimization for high-frequency trading networks.
