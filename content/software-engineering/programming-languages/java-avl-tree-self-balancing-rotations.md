---
title: "AVL Trees in Java: Self-Balancing Rotations and the Degenerate BST Problem"
description: "Why an ordinary binary search tree can degrade into an O(N) linked list under sorted insertions, how AVL trees enforce a strict height-balance invariant, and how left/right rotations restore it in O(1) per rotation."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "GUIDE"
tags:
  - "java"
  - "avl-tree"
  - "binary-search-tree"
  - "self-balancing-tree"
  - "data-structures"
  - "algorithms"
---

# AVL Trees in Java: Self-Balancing Rotations and the Degenerate BST Problem

## The Problem: Degenerate Trees

A plain binary search tree (BST) gives no structural guarantees at all. Insert keys in sorted order — `10, 20, 30, 40, 50` — and every new node becomes the right child of the previous one. The "tree" is really a linked list wearing a tree's clothing:

```
BST after inserting 10, 20, 30, 40, 50 in order:

10
  \
   20
     \
      30
        \
         40
           \
            50
```

Lookup, which should be O(log N) in a balanced tree, degrades to O(N) — every search has to walk the entire chain. For a service doing millions of lookups against a tree built from mostly-sorted input (timestamps, auto-increment IDs, sorted imports), this isn't a theoretical edge case; it's a routine production failure mode.

The **AVL tree** (Adelson-Velsky and Landis, 1962) solves this by enforcing a strict invariant after every insertion: for *any* node in the tree, the heights of its left and right subtrees differ by at most 1. That single rule is enough to guarantee the tree's height stays O(log N) no matter what order keys arrive in.

## Memory-Level Internals

Each node needs one extra field beyond a plain BST node: an integer `height`, used to compute the balance factor during rebalancing.

```java
class AVLNode {
    int key;
    String value;
    int height;
    AVLNode left, right;

    AVLNode(int key, String value) {
        this.key = key;
        this.value = value;
        this.height = 1;
    }
}
```

On top of Java's normal 12–16 byte object header, this adds one `int` (height) and two references (left/right) per node — a small, constant per-node overhead in exchange for a guaranteed logarithmic height.

As insertion recursion unwinds back up the tree, each ancestor recomputes its own height and its **balance factor** — `height(left) - height(right)`. A balance factor outside `{-1, 0, 1}` means the invariant has been violated at that node, and a rotation is required to restore it before returning further up the stack.

## The Rotations: Pointer Surgery

Rotations restore balance without breaking the BST ordering property — an in-order traversal of the tree still comes out sorted before and after any rotation.

### Right Rotation (the LL case)

Triggered when a left-heavy subtree receives another left-side insertion. The left child becomes the new local root; the old root becomes that child's right child.

```
Before (left-heavy, balance factor +2 at y):        After right-rotate(y):

        y                                                    x
       / \                                                  / \
      x   T3                                              x1   y
     / \              ---- rightRotate(y) ---->           /   / \
    x1  T2                                              ...  T2  T3
```

```java
private AVLNode rightRotate(AVLNode y) {
    AVLNode x = y.left;
    AVLNode T2 = x.right;

    // Perform rotation
    x.right = y;
    y.left = T2;

    // Update heights (y first — it's now the lower node)
    y.height = Math.max(height(y.left), height(y.right)) + 1;
    x.height = Math.max(height(x.left), height(x.right)) + 1;

    return x;
}
```

`leftRotate` is the mirror image (RR case), swapping every `left`/`right` reference above.

### Complex Cases: LR and RL

If the new node is inserted on the "inside" — e.g., the right child of a left subtree (LR case) — a single rotation isn't enough to fix the balance factor. First rotate the child left (turning the LR shape into a plain LL shape), then rotate the parent right:

```java
private AVLNode insert(AVLNode node, int key, String value) {
    if (node == null) return new AVLNode(key, value);

    if (key < node.key) node.left = insert(node.left, key, value);
    else if (key > node.key) node.right = insert(node.right, key, value);
    else return node; // No duplicates allowed

    node.height = 1 + Math.max(height(node.left), height(node.right));
    int balance = getBalance(node);

    // LL Case
    if (balance > 1 && key < node.left.key) return rightRotate(node);
    // RR Case
    if (balance < -1 && key > node.right.key) return leftRotate(node);
    // LR Case
    if (balance > 1 && key > node.left.key) {
        node.left = leftRotate(node.left);
        return rightRotate(node);
    }
    // RL Case
    if (balance < -1 && key < node.right.key) {
        node.right = rightRotate(node.right);
        return leftRotate(node);
    }
    return node;
}
```

Each of the four cases requires at most two rotations, and every rotation is O(1) — a constant number of pointer reassignments and height recalculations. Since insertion first recurses O(log N) deep and then rebalances at most O(1) work per ancestor on the way back up, total insertion cost stays O(log N), matching lookup.

## Key Takeaways

- **Plain BSTs give no height guarantee** — sorted or adversarial input degrades lookup to O(N).
- **AVL trees enforce a strict balance-factor invariant** (`|height(left) - height(right)| <= 1` at every node), guaranteeing O(log N) height regardless of insertion order.
- **Rotations are O(1) pointer surgery** that preserve the BST ordering property while restoring the balance invariant; the LR/RL cases just compose two of the basic LL/RR rotations.
- **AVL trees trade a small per-insertion rebalancing cost for consistently fast O(log N) lookups** — a good fit for read-heavy workloads where lookup speed matters more than insertion throughput (as opposed to a red-black tree, which rebalances less aggressively and favors insertion-heavy workloads).
