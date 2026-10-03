---
title: "Fenwick Trees (BIT) in C++: Bitwise Magic for Fast Cumulative Frequencies"
description: "Implement a Fenwick Tree (Binary Indexed Tree) in C++ using two's-complement bit tricks for O(log N) prefix-sum queries and point updates with half the memory of a segment tree."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "GUIDE"
tags:
  - "cpp"
  - "fenwick-tree"
  - "binary-indexed-tree"
  - "data-structures"
  - "bitwise-operations"
---

# Fenwick Trees (BIT) in C++: Bitwise Magic for Fast Cumulative Frequencies

## The Problem: The Segment Tree Overhead

While segment trees process range queries in O(log N), they require 4N memory and recursively branch down the tree, polluting the call stack. If the problem is strictly about cumulative frequencies (prefix sums) and point updates — for example, tracking running totals of stock trades per price bucket, or cumulative click counts per time bucket — segment trees are computationally heavy overkill.

## Memory-Level Internals: Two's Complement

The Fenwick Tree, or Binary Indexed Tree (BIT), solves this using pure bitwise arithmetic. It operates directly on a 1-indexed array of size exactly N+1, halving the memory footprint compared to a segment tree and eliminating all recursion.

The underlying principle leverages two's complement binary representation. In C++, `x & -x` perfectly isolates the least significant set bit (LSB) of `x`. For example, `12` (binary `1100`) has an LSB of `4` (`0100`).

A node at index `i` in the BIT stores the sum of a specific range of elements — specifically, the sum of `i & -i` elements ending at index `i`.

```text
 Index:        1    2    3    4    5    6    7    8
 Binary:     0001 0010 0011 0100 0101 0110 0111 1000
 LSB (i&-i):    1    2    1    4    1    2    1    8
 BIT[i] covers: [1]  [1,2] [3]  [1..4] [5]  [5,6] [7]  [1..8]

 update(i):  i += (i & -i)  -> walk UP, touching every node that covers i
 query(i):   i -= (i & -i)  -> walk DOWN, summing disjoint covering ranges
```

```cpp
#include <vector>

class FenwickTree {
    std::vector<int> bit;
    int n;

public:
    FenwickTree(int size) {
        n = size;
        bit.assign(n + 1, 0); // 1-indexed
    }
    // ...
};
```

## The Update Operation (O(log N))

When an element at index `i` changes, we must update all BIT nodes that "cover" this index. We find the next covering node by repeatedly *adding* the LSB to `i`.

```cpp
void add(int i, int delta) {
    // Traverse up the implicit tree
    for (; i <= n; i += (i & -i)) {
        bit[i] += delta;
    }
}
```

A tight `for` loop with one array fetch and one bitwise operation easily outperforms the recursive branching of a segment tree.

## The Query Operation (O(log N))

To find the prefix sum up to index `i`, we repeatedly *subtract* the LSB, jumping backwards through the disjoint ranges that make up the prefix.

```cpp
int query(int i) {
    int sum = 0;
    // Traverse down the implicit tree
    for (; i > 0; i -= (i & -i)) {
        sum += bit[i];
    }
    return sum;
}

// Range sum [L, R] is simply query(R) - query(L - 1)
int queryRange(int l, int r) {
    return query(r) - query(l - 1);
}
```

Fenwick Trees represent the pinnacle of algorithmic elegance: substituting structural graph overhead with the raw, intrinsic bitwise logic of the ALU.

## Complete Working Example

```cpp
#include <iostream>
#include <vector>
using namespace std;

class FenwickTree {
    vector<int> bit;
    int n;

public:
    FenwickTree(int size) : n(size) {
        bit.assign(n + 1, 0);
    }

    void add(int i, int delta) {
        for (; i <= n; i += (i & -i)) {
            bit[i] += delta;
        }
    }

    int query(int i) {
        int sum = 0;
        for (; i > 0; i -= (i & -i)) {
            sum += bit[i];
        }
        return sum;
    }

    int queryRange(int l, int r) {
        return query(r) - query(l - 1);
    }
};

int main() {
    FenwickTree tree(10);

    // Point updates: add value 5 at index 3, value 2 at index 7
    tree.add(3, 5);
    tree.add(7, 2);
    tree.add(5, 10);

    cout << "Prefix sum up to index 5: " << tree.query(5) << "\n"; // 15
    cout << "Range sum [3, 7]: " << tree.queryRange(3, 7) << "\n"; // 17

    return 0;
}
```
