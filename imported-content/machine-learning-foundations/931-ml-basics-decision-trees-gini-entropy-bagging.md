# Ensemble Learning: From Decision Trees to Random Forests (Bagging)

## The Problem
Individual Decision Trees are highly intuitive, require minimal preprocessing, and natively handle both categorical and numerical features. However, they suffer from extreme variance: they are prone to growing excessively deep to fit noise in the training set (overfitting). A minute fluctuation in the training data can lead to a completely different set of splits. 

In production systems, this high variance leads to fragile models that generalize poorly to unseen data. To solve this, we must transition from single, fragile estimators to ensemble architectures. The objective is to combine multiple high-variance, low-bias decision trees to create a highly robust model with low variance, without inflating bias.

## Technical Architecture

The transition from a single Decision Tree to a Random Forest is built upon two core concepts: **split impurity criteria** and **Bootstrap Aggregation (Bagging)**.

### 1. Split Impurity Criteria
A decision tree recursively partitions the feature space. At each node, it selects the feature $X_j$ and threshold $t$ that maximize the reduction in impurity (Information Gain). Two common impurity metrics for classification are Gini Impurity and Entropy:

* **Gini Impurity**: Measures how often a randomly chosen element from the set would be incorrectly labeled if it were randomly labeled according to the distribution of labels in the subset:

$$ I_G(p) = 1 - \sum_{k=1}^{C} p_k^2 $$

* **Entropy (Shannon Entropy)**: Measures the average level of information or uncertainty in the subset:

$$ H(p) = -\sum_{k=1}^{C} p_k \log_2(p_k) $$

Where $p_k$ is the proportion of samples belonging to class $k$ in that node, and $C$ is the total number of classes.

### 2. Bootstrap Aggregation (Bagging)
Given a dataset of size $m$, Bagging constructs $B$ different datasets of size $m$ by **bootstrap sampling** (sampling with replacement). Each decision tree $f_b(x)$ is trained independently on its respective bootstrap sample $D_b$.

$$\text{Bootstrap Sample: } D_b \subset D, \quad |D_b| = m \quad (\text{with replacement})$$

### 3. Feature Bagging (The Random Forest Secret)
If features are highly dominant, different bagged trees will still select the same top features for their root nodes, creating highly correlated trees. Random Forests solve this by restricting each split in a tree to a random subset of $d$ features (typically $d = \sqrt{n}$ for classification, where $n$ is total features). This de-correlates the individual trees, driving down the variance of the ensemble's average.

The ensemble prediction for classification is determined by a majority vote across all $B$ trees:

$$ \hat{y} = \text{mode} \left\{ f_1(x), f_2(x), \dots, f_B(x) \right\} $$

```text
Original Dataset (Size m, Features n)
                 |
  +--------------+--------------+
  | (Bootstrap)  | (Bootstrap)  | (Bootstrap)
  v              v              v
Dataset D1     Dataset D2     Dataset DB   (All size m, sampled with replacement)
  |              |              |
  | Random       | Random       | Random
  | Feature      | Feature      | Feature
  | Subset (d)   | Subset (d)   | Subset (d)
  v              v              v
Tree T1        Tree T2        Tree TB      (Independently grown, max depth)
  \              |              /
   \             |             /
    v            v            v
  +-------------------------------+
  | Predictions [y1, y2, ..., yB] |
  +-------------------------------+
                 |
                 | Majority Voting (Argmax)
                 v
          Final Class Prediction (Y)
```

## Implementation

The Python class below implements a `BootstrapEnsembleForest` from scratch using scikit-learn's `DecisionTreeClassifier` as the base model. This allows us to focus purely on the mathematical mechanics of bootstrapping, feature restriction, and ensemble voting.

```python
import numpy as np
from sklearn.tree import DecisionTreeClassifier
from collections import Counter
from typing import List, Optional

class BootstrapEnsembleForest:
    def __init__(self, n_estimators: int = 50, max_depth: Optional[int] = None, max_features: str = "sqrt") -> None:
        self.n_estimators: int = n_estimators
        self.max_depth: Optional[int] = max_depth
        self.max_features: str = max_features
        self.estimators: List[DecisionTreeClassifier] = []
        self.feature_indices_per_tree: List[np.ndarray] = []

    def fit(self, X: np.ndarray, y: np.ndarray) -> 'BootstrapEnsembleForest':
        self.estimators = []
        self.feature_indices_per_tree = []
        m, n = X.shape

        # Set number of features to select at each node/tree
        if self.max_features == "sqrt":
            self.d = int(np.sqrt(n))
        else:
            self.d = n

        for _ in range(self.n_estimators):
            # 1. Generate Bootstrap Sample indices
            bootstrap_indices = np.random.choice(m, size=m, replace=True)
            X_b, y_b = X[bootstrap_indices], y[bootstrap_indices]

            # 2. Select a random subset of features
            feature_indices = np.random.choice(n, size=self.d, replace=False)
            X_b_subset = X_b[:, feature_indices]

            # 3. Fit base tree
            tree = DecisionTreeClassifier(max_depth=self.max_depth)
            tree.fit(X_b_subset, y_b)

            self.estimators.append(tree)
            self.feature_indices_per_tree.append(feature_indices)

        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Predicts classes by running inference across all trees and executing majority vote.
        """
        m = X.shape[0]
        # Gather predictions from each individual estimator
        all_preds = np.zeros((self.n_estimators, m))

        for idx, (tree, feats) in enumerate(zip(self.estimators, self.feature_indices_per_tree)):
            all_preds[idx] = tree.predict(X[:, feats])

        # Execute majority vote for each sample
        final_predictions = np.zeros(m, dtype=int)
        for i in range(m):
            sample_votes = all_preds[:, i]
            vote_counts = Counter(sample_votes)
            final_predictions[i] = vote_counts.most_common(1)[0][0]

        return final_predictions

if __name__ == "__main__":
    # Generate noisy synthetic binary data
    np.random.seed(42)
    X_train = np.random.randn(300, 15)  # 300 samples, 15 features
    # True label depends on combinations of first 3 features
    y_train = ( (X_train[:, 0] + X_train[:, 1]*2 - X_train[:, 2]**2) > 0.5 ).astype(int)

    # Instantiate and fit our ensemble
    forest = BootstrapEnsembleForest(n_estimators=30, max_depth=5, max_features="sqrt")
    forest.fit(X_train, y_train)

    print("--- Random Forest Ensemble Results ---")
    print(f"Ensemble Size: {len(forest.estimators)} Decision Trees")
    
    # Simple training accuracy
    train_preds = forest.predict(X_train)
    accuracy = np.mean(train_preds == y_train)
    print(f"Training accuracy: {accuracy * 100:.2f}%")
```

## System Constraints and Optimizations
Ensemble Baggers like Random Forests present different engineering profiles compared to single trees:

1. **Memory Overhead**: Storing hundreds of deep decision trees requires substantial memory footprint. In production, this can lead to bloated serialization models (e.g., heavy pickle or ONNX files).
2. **Prediction Latency**: While training can be parallelized since each tree is independent, predicting requires routing inputs through every individual tree sequentially or via multi-threading. For real-time sub-millisecond API response limits, Random Forests can face latency constraints.
3. **Extrapolation Failure**: Because they are based on tree splits, they cannot extrapolate outside the boundary of training domain data. They act as step-wise constant function approximators.

**Production Recommendation**: Limit tree complexity by setting `max_depth` or `min_samples_leaf` to keep serialization files lean and prediction paths shallow. For latency-critical pipelines, compile the model into C-based structures using libraries such as ONNX-runtime or Treelite.
