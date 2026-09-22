# Ensemble Learning: From Decision Trees to Random Forests (Bagging)

## The Problem
Single decision trees are highly interpretable models that naturally handle mixed data types (continuous, categorical), require zero feature scaling, and capture complex non-linear feature interactions. However, individual decision trees suffer from a major structural defect: **high variance**. 

Because decision trees split features recursively to perfectly partition the training space, they are extremely sensitive to minor fluctuations in the training dataset. A tiny change in a single sample can alter the root split, completely changing the downstream tree structure. This leads to severe overfitting, where the model performs exceptionally on training data but fails to generalize to unseen test data.

The core engineering challenge is to preserve the non-linear representing power of decision trees while dramatically reducing their prediction variance to construct a stable, high-generalization classifier.

## Technical Architecture

The transition from a high-variance single tree to a robust ensemble involves two distinct concepts: **recursive partitioning metrics** and **Bootstrap Aggregating (Bagging)**.

### Recursive Splitting Criteria
A decision tree is built by finding the split at each node that maximizes the reduction in impurity. The two primary metrics are:

1. **Gini Impurity**:
   $$ Gini(D) = 1 - \sum_{i=1}^{c} p_i^2 $$
   Where $p_i$ is the probability of a sample in dataset $D$ belonging to class $i$, and $c$ is the total number of classes.

2. **Information Entropy**:
   $$ Entropy(D) = -\sum_{i=1}^{c} p_i \log_2(p_i) $$

For a split on feature $A$ partitioning dataset $D$ into children $D_{left}$ and $D_{right}$, the Information Gain (IG) is defined as:

$$ IG(D, A) = Impurity(D) - \frac{|D_{left}|}{|D|} Impurity(D_{left}) - \frac{|D_{right}|}{|D|} Impurity(D_{right}) $$

```text
               Recursive Node Split
                     [Parent]
                  Impurity: I(D)
                     /      \
             Split  /        \  Split
           Feature /          \ Feature
                  v            v
            [Left Child]   [Right Child]
           Impurity: I(DL)  Impurity: I(DR)
```

### Bagging (Bootstrap Aggregating)
Bagging reduces variance by training multiple high-variance estimators (trees) in parallel on different subsets of the training data.
1. **Bootstrapping**: Generate $B$ new datasets $D_b$ by sampling $m$ rows with replacement from the original dataset $D$ of size $m$. On average, each bootstrap sample contains roughly $63.2\%$ of the original unique rows; the remaining $36.8\%$ are "Out-of-Bag" (OOB) samples.
2. **Aggregating**: Train an independent tree $T_b$ on each $D_b$ without pruning. For classification, aggregate predictions via majority voting; for regression, average the predicted outputs.

### The Random Forest Decorrelation Twist
Standard bagging trees can be highly correlated if a few features are dominant predictors. Random Forests solve this by introducing **feature subspace sampling**: at every single node split, the algorithm only evaluates a random subset of $k = \sqrt{n}$ features. This decorrelates the trees, making the ensemble aggregate far more robust.

```text
                               +------------------+
                               |  Training Data   |
                               +------------------+
                                  /     |      \
                    Bootstrap    /      |       \  Bootstrap
                    w/ Replace  v       v        v
                        +---------+  +---------+  +---------+
                        | Sub-DB1 |  | Sub-DB2 |  | Sub-DB3 |
                        +---------+  +---------+  +---------+
                             |            |            |
                             v (Train)    v (Train)    v (Train)
                        +---------+  +---------+  +---------+
                        | Tree T1 |  | Tree T2 |  | Tree T3 |
                        +---------+  +---------+  +---------+
                             \            |            /
                              \           |           /  Predict
                               v          v          v
                        +-----------------------------------+
                        |   Aggregate Predictions (Voting)  |
                        +-----------------------------------+
                                          |
                                          v
                               +------------------+
                               |   Final Class    |
                               +------------------+
```

## Implementation

Below is a Python implementation of a Bootstrap Aggregated (Bagged) Ensemble of shallow decision classifiers, highlighting how sampling and voting work under the hood.

```python
import numpy as np
from collections import Counter
from sklearn.tree import DecisionTreeClassifier
from typing import List

class BaggedForestClassifier:
    def __init__(self, n_estimators: int = 10, max_depth: int = 5, max_features: str = "sqrt") -> None:
        """
        Custom Bagged Forest using scikit-learn base estimators to demonstrate bagging logic.
        """
        self.n_estimators: int = n_estimators
        self.max_depth: int = max_depth
        self.max_features: str = max_features
        self.estimators: List[DecisionTreeClassifier] = []

    def _bootstrap_sample(self, X: np.ndarray, y: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """
        Generates a bootstrap sample (sampling with replacement).
        """
        m: int = X.shape[0]
        indices: np.ndarray = np.random.choice(m, size=m, replace=True)
        return X[indices], y[indices]

    def fit(self, X: np.ndarray, y: np.ndarray) -> 'BaggedForestClassifier':
        """
        Fits n_estimators independently in parallel.
        """
        self.estimators = []
        for _ in range(self.n_estimators):
            X_sample, y_sample = self._bootstrap_sample(X, y)
            
            # Use base DecisionTreeClassifier with random feature selection enabled
            # to simulate the Random Forest behavior
            tree = DecisionTreeClassifier(
                max_depth=self.max_depth,
                max_features=self.max_features,
                random_state=None
            )
            tree.fit(X_sample, y_sample)
            self.estimators.append(tree)
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Aggregates predictions from all trees using majority voting.
        """
        # Gather predictions: shape (n_estimators, m_test)
        predictions: np.ndarray = np.array([tree.predict(X) for tree in self.estimators])
        
        # Transpose to shape (m_test, n_estimators)
        predictions = predictions.T
        
        # Determine majority class for each sample
        final_preds: List[int] = []
        for row in predictions:
            vote_counter = Counter(row)
            majority_class = vote_counter.most_common(1)[0][0]
            final_preds.append(majority_class)
            
        return np.array(final_preds)

if __name__ == "__main__":
    from sklearn.datasets import make_moons
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score

    # Generate synthetic non-linear classification dataset
    X, y = make_moons(n_samples=500, noise=0.3, random_state=42)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    # Compare a single deep, overfitted tree with a Bagged Forest
    overfitted_tree = DecisionTreeClassifier(max_depth=None, random_state=42)
    overfitted_tree.fit(X_train, y_train)
    single_tree_acc = accuracy_score(y_test, overfitted_tree.predict(X_test))

    forest = BaggedForestClassifier(n_estimators=50, max_depth=5)
    forest.fit(X_train, y_train)
    forest_acc = accuracy_score(y_test, forest.predict(X_test))

    print("--- Single Tree vs Bagged Forest Performance ---")
    print(f"Single Tree Test Accuracy: {single_tree_acc * 100:.2f}% (Prone to Overfitting)")
    print(f"Bagged Forest Test Accuracy: {forest_acc * 100:.2f}% (Reduced Variance)")
```

## System Constraints and Optimizations
Ensemble bagging models are incredibly robust, but present clear operational challenges:

1. **Memory Complexity**: Unlike linear models which store a few weights, a Random Forest stores thousands of recursive decision nodes. A forest of 500 deep trees can easily consume gigabytes of memory, impacting container sizing on production prediction servers.
2. **Inference Latency**: Because predicting requires passing input features through every tree in the ensemble, inference time scales linearly with the number of trees ($O(B \cdot \text{depth})$).
3. **Training Time**: Finding the optimal feature split point at each node scales with $O(m \cdot n \log m)$ where $m$ is samples and $n$ is features.

**Production Recommendation**: Bagging models are highly parallelizable during training. Ensure that you utilize multicore processing flags (e.g., `n_jobs=-1` in scikit-learn) during both model fitting and inference. For latency-critical microservices, serialize trees into compressed representations (e.g., using ONNX or ONNXMLTools) to speed up prediction runtime.
