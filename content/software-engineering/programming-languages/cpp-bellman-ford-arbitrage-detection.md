---
title: "Bellman-Ford in C++: Detecting Currency Arbitrage with Negative Cycles"
description: "Implement the Bellman-Ford algorithm in C++ to detect negative-weight cycles in a forex exchange-rate graph, a real technique used to find currency arbitrage opportunities."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "GUIDE"
tags:
  - "cpp"
  - "graph-algorithms"
  - "bellman-ford"
  - "shortest-path"
  - "fintech-algorithms"
---

# Bellman-Ford in C++: Detecting Currency Arbitrage with Negative Cycles

## The Problem: Negative Weights and Cycles

Dijkstra's algorithm is fast but fails catastrophically if a graph has negative edge weights, because it assumes the shortest path to a vertex is finalized the moment that vertex is extracted from the heap — an assumption that breaks the instant a later negative edge could still shorten that path. In financial systems, discovering currency arbitrage (e.g., converting USD to EUR to JPY and back to USD, ending up with more money than you started with) is mathematically equivalent to finding a negative-weight cycle in a directed graph, where each edge weight represents `-log(exchange_rate)`.

Why the negative logarithm? Multiplying exchange rates along a cycle (`0.90 * 0.85 * 1.10 * 1.25`) is equivalent to summing their logarithms. An arbitrage opportunity exists when that product exceeds 1.0 — which, after negating the logs, means the summed edge weights around the cycle are negative. This transforms a multiplicative profitability check into an additive graph-cycle-detection problem that Bellman-Ford is built to solve.

The Bellman-Ford algorithm handles negative weights and explicitly detects negative cycles in O(V·E) time.

## Memory-Level Internals of Bellman-Ford

Bellman-Ford is essentially dynamic programming over edges. Instead of jumping around the graph via a heap, it relaxes *all* edges exactly V - 1 times.

Memory-wise, Bellman-Ford only needs an array of distances (`vector<double> dist(V)`) and a flat list of all edges. The simplicity of iterating linearly over a contiguous `vector<Edge>` means it achieves near-perfect CPU cache utilization, often making the O(V·E) constant factor extremely small on modern architectures compared to pointer-chasing graph representations.

```text
 Pass 1: relax every edge once     Pass 2: relax again     ...     Pass V-1
 ┌─────┬─────┬─────┬─────┐        ┌─────┬─────┬─────┐             ┌─────┐
 │ e0  │ e1  │ e2  │ e3  │  --->   │ e0  │ e1  │ e2  │  --->  ...  │ eN  │
 └─────┴─────┴─────┴─────┘        └─────┴─────┴─────┘             └─────┘
      distances converge to shortest paths after V-1 full passes
                       │
                       ▼
        Pass V: if ANY edge still relaxes -> negative cycle exists
```

## Robust C++ Implementation

This implementation defines an edge-list based graph and performs arbitrage detection. We use a flat `vector` of structs for maximum spatial locality.

```cpp
#include <iostream>
#include <vector>
#include <limits>
#include <cmath>

using namespace std;

struct Edge {
    int src;
    int dest;
    double weight; // represents -log(exchange_rate)
};

class ForexGraph {
private:
    int vertices;
    vector<Edge> edges;

public:
    ForexGraph(int v) : vertices(v) {}

    void addExchangeRate(int from, int to, double rate) {
        // To find multiplicative arbitrage > 1.0,
        // we find a negative additive cycle by taking -log(rate)
        edges.push_back({from, to, -log(rate)});
    }

    bool hasArbitrageOpportunity(int sourceCurrency) {
        // Initialize distances to infinity
        vector<double> dist(vertices, numeric_limits<double>::infinity());
        dist[sourceCurrency] = 0.0;

        // Step 1: Relax all edges |V| - 1 times
        for (int i = 1; i <= vertices - 1; i++) {
            bool relaxed = false;
            for (const auto& edge : edges) {
                if (dist[edge.src] != numeric_limits<double>::infinity() &&
                    dist[edge.src] + edge.weight < dist[edge.dest]) {

                    dist[edge.dest] = dist[edge.src] + edge.weight;
                    relaxed = true;
                }
            }
            // Early termination if no edges were relaxed in this pass
            if (!relaxed) break;
        }

        // Step 2: Check for negative-weight cycles
        // If an edge can STILL be relaxed, a negative cycle exists
        for (const auto& edge : edges) {
            if (dist[edge.src] != numeric_limits<double>::infinity() &&
                dist[edge.src] + edge.weight < dist[edge.dest]) {
                return true; // Arbitrage cycle detected!
            }
        }

        return false;
    }
};

int main() {
    // 0: USD, 1: EUR, 2: GBP, 3: CHF
    ForexGraph market(4);

    market.addExchangeRate(0, 1, 0.90);
    market.addExchangeRate(1, 2, 0.85);
    market.addExchangeRate(2, 3, 1.10);

    // Cycle: CHF -> USD at 1.25 gives overall 0.90 * 0.85 * 1.10 * 1.25 = 1.0518 > 1
    market.addExchangeRate(3, 0, 1.25);

    if (market.hasArbitrageOpportunity(0)) {
        cout << "Arbitrage opportunity detected!" << endl;
    } else {
        cout << "Market is efficient; no arbitrage found." << endl;
    }

    return 0;
}
```

## Architectural Considerations

In High-Frequency Trading (HFT) environments, processing latency is measured in nanoseconds. The memory layout of `vector<Edge>` is critical. By ensuring `sizeof(Edge)` is small (e.g., 16 bytes: two 32-bit ints, one 64-bit double), the CPU can pack four edges into a single 64-byte L1 cache line. Utilizing SIMD (AVX-512) instructions to relax multiple edges in parallel, or offloading the flat edge array to a GPU via CUDA, drastically enhances Bellman-Ford's O(V·E) performance for massive market graphs spanning hundreds of currency pairs.
