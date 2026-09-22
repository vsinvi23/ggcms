# AVL Trees in Java: Implementing Self-Balancing Left and Right Rotations

## The Problem: Degenerate Trees
A standard Binary Search Tree (BST) provides no structural guarantees. Sequential insertions transform it into a linked list, dropping lookup performance from $O(\log N)$ to $O(N)$. The AVL tree (Adelson-Velsky and Landis) solves this by enforcing a strict invariant: the heights of the left and right subtrees of *any* node differ by at most 1.

## Memory-Level Internals
In Java, standard objects carry a 12-16 byte object header. To track balance, an AVL tree augments the standard BST node with an integer `height` field. 

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
Updating heights and evaluating the "balance factor" (Left Height - Right Height) during unwinding of the insertion stack dictates whether rotations are triggered. 

## The Rotations: Pointer Surgery
Rotations restore balance without violating the BST property (in-order traversal remains sorted). 

### Right Rotation (LL Case)
Triggered when a left-heavy subtree receives a left insertion. The left child becomes the new root.

```java
private AVLNode rightRotate(AVLNode y) {
    AVLNode x = y.left;
    AVLNode T2 = x.right;

    // Perform rotation
    x.right = y;
    y.left = T2;

    // Update heights
    y.height = Math.max(height(y.left), height(y.right)) + 1;
    x.height = Math.max(height(x.left), height(x.right)) + 1;

    return x;
}
```

### Complex Cases (LR and RL)
If the insertion is on the "inside" (e.g., right child of a left subtree), a single rotation isn't enough. We perform a Left Rotation on the child, reducing it to the LL case, followed by a Right Rotation on the parent.

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
AVL trees prioritize rapid lookups via strict balancing, trading off higher rotation overhead during insertions.
