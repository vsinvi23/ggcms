# Segment Trees in C++: $O(\log N)$ Range Sum Queries for Game Engines

## The Problem: Dynamic Range Queries
Consider an array representing terrain heights or particle counts across a 1D coordinate system in a game. We frequently need to calculate the sum of values in a specific range $[L, R]$ and update values at specific indices. A naive array offers $O(1)$ updates but $O(N)$ range queries. Prefix sum arrays offer $O(1)$ queries but $O(N)$ updates. We need both in $O(\log N)$.

## Memory-Level Internals: The Implicit Tree
A Segment Tree solves this by recursively dividing the array into halves. The leaves represent individual elements, and internal nodes store the merged result (e.g., sum) of their children.

In C++, pointer-based trees are slow to allocate. Instead, we use an implicit binary tree embedded within a contiguous `std::vector`. If the array has $N$ elements, the segment tree requires exactly $4N$ memory in the worst case, completely eliminating pointer overhead and ensuring perfect L1 cache locality. For a node at index `i`, its left child is `2*i` and its right child is `2*i+1`.

```cpp
#include <vector>

class SegmentTree {
    std::vector<int> tree;
    int n;

public:
    SegmentTree(const std::vector<int>& arr) {
        n = arr.size();
        tree.resize(4 * n);
        build(arr, 1, 0, n - 1);
    }
    // ...
};
```

## Construction and Updates
Building the tree is a bottom-up $O(N)$ operation.

```cpp
void build(const std::vector<int>& arr, int node, int start, int end) {
    if (start == end) {
        tree[node] = arr[start];
        return;
    }
    int mid = (start + end) / 2;
    build(arr, 2 * node, start, mid);
    build(arr, 2 * node + 1, mid + 1, end);
    tree[node] = tree[2 * node] + tree[2 * node + 1];
}
```

Point updates traverse down to the specific leaf, update it, and recalculate sums on the way back up.

## The Query Magic
To query a range $[L, R]$, we traverse the tree. If a node's represented segment is completely inside $[L, R]$, we return its precomputed sum, immediately short-circuiting the traversal. This prune-heavy DFS bounds the time complexity to strictly $O(\log N)$.

```cpp
int query(int node, int start, int end, int l, int r) {
    // 1. Completely outside
    if (r < start || end < l) return 0;
    
    // 2. Completely inside
    if (l <= start && end <= r) return tree[node];
    
    // 3. Partial overlap
    int mid = (start + end) / 2;
    int p1 = query(2 * node, start, mid, l, r);
    int p2 = query(2 * node + 1, mid + 1, end, l, r);
    return p1 + p2;
}
```
