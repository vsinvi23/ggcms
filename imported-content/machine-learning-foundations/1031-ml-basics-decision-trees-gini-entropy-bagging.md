# Ensemble Learning: From Decision Trees to Random Forests (Bagging)

## The Problem
Single decision trees are highly intuitive, require minimal data preprocessing, and easily model non-linear relationships. However, in production environments, they are notoriously unstable. Decision trees suffer from high variance: they are prone to overfitting the training data, capturing noise rather than the underlying distribution. A minor perturbation in the training dataset can result in a completely different tree topology and conflicting predictions.

To deploy robust machine learning systems, we must reduce model variance without inflating model bias. Simply building a single, extremely deep tree fails to generalize. The challenge is to construct a system architecture that averages away individual tree errors through ensemble methods, specifically using Bootstrap Aggregating (Bagging) and random feature subsets to decorrelate individual estimators.

## Technical Architecture

The transition from a single decision tree to a Random Forest involves two key concepts: node splitting math and ensemble-wide bootstrap aggregation.

### 1. Single Node Splitting Criteria
A decision tree recursively partitions the feature space. At each node, it selects a feature and a threshold that maximizes impurity reduction. For a dataset with $c$ classes, where $p_i$ is the probability of a sample belonging to class $i$ at a given node:

* **Gini Impurity**: Measures the probability of misclassifying a randomly chosen element from the set if it were randomly labeled according to the distribution of labels.
  $$ G = 1 - \sum_{i=1}^{c} p_i^2 $$
  
* **Entropy**: Measures the information content and disorder of the system.
  $$ H = -\sum_{i=1}^{c} p_i \log_2(p_i) $$

* **Information Gain (IG)**: The metric used to evaluate a potential split $S$, computed as the difference in impurity before and after the split:
  $$ \text{IG}(S) = I(\text{parent}) - \left( \frac{N_{\text{left}}}{N_{\text{parent}}} I(\text{left}) + \frac{N_{\text{right}}}{N_{\text{parent}}} I(\text{right}) \right) $$
  Where $I$ represents either Gini Impurity or Entropy.

### 2. Bootstrap Aggregating (Bagging)
Given a dataset $D$ of size $m$, Bagging constructs $B$ new training sets $D_b$ by sampling $m$ observations from $D$ uniformly and **with replacement**. About $63.2\%$ of unique samples are selected in each bootstrap, while the remaining are left as Out-Of-Bag (OOB) data.

### 3. Random Forest (Feature Bagging)
While standard bagging reduces variance by training trees on different data subsets, the individual trees remain highly correlated if a few dominant features exist. Random Forests resolve this by forcing each split in a tree to select from a random subset of $k$ features (typically $k = \sqrt{n}$ for classification). This decorrelates the trees, allowing the ensemble average to achieve a dramatic reduction in variance.

```text
               +--------------------------------------+
               |        Original Dataset D (m, n)     |
               +--------------------------------------+
                 /                  |                 \
  Random Bootstrapping    Random Bootstrapping    Random Bootstrapping
  (With Replacement)      (With Replacement)      (With Replacement)
              v                     v                     v
       +-------------+       +-------------+       +-------------+
       |  D_1 (m, n) |       |  D_2 (m, n) |       |  D_B (m, n) |
       +-------------+       +-------------+       +-------------+
              |                     |                     |
      Feature Bagging       Feature Bagging       Feature Bagging
      (k = sqrt(n))         (k = sqrt(n))         (k = sqrt(n))
              v                     v                     v
       +-------------+       +-------------+       +-------------+
       | Tree_1 Fit  |       | Tree_2 Fit  |       | Tree_B Fit  |
       +-------------+       +-------------+       +-------------+
              \                     |                     /
               \                    |                    /
                v                   v                   v
              +-------------------------------------------+
              | Individual Class Predictions [y1, y2, yB] |
              +-------------------------------------------+
                                    |
                                    | Majority Voting / Averaging
                                    v
                              +------------+
                              | Final y    |
                              +------------+
```

## Implementation

The following code implements a Random Forest Classifier from scratch in Python, utilizing `scikit-learn`'s `DecisionTreeClassifier` as the base estimator to demonstrate bootstrap sampling, feature subset restriction, and parallelizable ensemble voting.

```python
import numpy as np
from sklearn.tree import DecisionTreeClassifier
from typing import List, Optional

class RandomForestClassifierScratch:
    """
    A Random Forest Classifier built using bootstrap aggregation 
    and random feature subset selections.
    """
    def __init__(self, n_estimators: int = 10, max_depth: Optional[int] = None, 
                 max_features: str = 'sqrt', min_samples_split: int = 2) -> None:
        self.n_estimators: int = n_estimators
        self.max_depth: Optional[int] = max_depth
        self.max_features: str = max_features
        self.min_samples_split: int = min_samples_split
        self.trees: List[DecisionTreeClassifier] = []
        self.feature_indices: List[np.ndarray] = []

    def _get_bootstrap_indices(self, m: int) -> np.ndarray:
        """
        Samples row indices with replacement.
        """
        return np.random.choice(m, size=m, replace=True)

    def _get_feature_subset(self, n: int) -> np.ndarray:
        """
        Selects a random subset of feature indices.
        """
        if self.max_features == 'sqrt':
            num_features = int(np.sqrt(n))
        elif isinstance(self.max_features, float):
            num_features = int(self.max_features * n)
        else:
            num_features = n
            
        num_features = max(1, num_features)
        # Select unique feature indices without replacement
        return np.random.choice(n, size=num_features, replace=False)

    def fit(self, X: np.ndarray, y: np.ndarray) -> 'RandomForestClassifierScratch':
        """
        Trains n_estimators of decorrelated decision trees.
        """
        self.trees = []
        self.feature_indices = []
        m, n = X.shape

        for _ in range(self.n_estimators):
            # Apply bootstrap row sampling
            boot_idx = self._get_bootstrap_indices(m)
            X_boot, y_boot = X[boot_idx], y[boot_idx]

            # Apply random column sampling (feature bagging)
            feat_idx = self._get_feature_subset(n)
            self.feature_indices.append(feat_idx)

            # Restrict training data to selected columns
            X_boot_sub = X_boot[:, feat_idx]

            # Initialize and fit individual estimator
            tree = DecisionTreeClassifier(
                max_depth=self.max_depth,
                min_samples_split=self.min_samples_split,
                random_state=None
            )
            tree.fit(X_boot_sub, y_boot)
            self.trees.append(tree)

        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Aggregate predictions of all fitted trees via majority voting.
        """
        m = X.shape[0]
        # Collect predictions from each tree: shape (n_estimators, m)
        predictions = np.zeros((self.n_estimators, m), dtype=int)

        for i, (tree, feat_idx) in enumerate(zip(self.trees, self.feature_indices)):
            X_sub = X[:, feat_idx]
            predictions[i] = tree.predict(X_sub)

        # Compute majority vote along columns (axis 0)
        final_predictions = np.zeros(m, dtype=int)
        for j in range(m):
            counts = np.bincount(predictions[:, j])
            final_predictions[j] = np.argmax(counts)

        return final_predictions

if __name__ == "__main__":
    # Generate synthetic binary classification dataset
    from sklearn.datasets import make_classification
    X_data, y_data = make_classification(
        n_samples=200, n_features=10, n_informative=8, n_redundant=2, random_state=42
    )
    
    # Split train and test
    split = 150
    X_train, X_test = X_data[:split], X_data[split:]
    y_train, y_test = y_data[:split], y_data[split:]

    # Train Random Forest Classifier
    rf = RandomForestClassifierScratch(n_estimators=15, max_depth=5, max_features='sqrt')
    rf.fit(X_train, y_train)
    
    # Evaluate predictions
    y_pred = rf.predict(X_test)
    test_accuracy = np.mean(y_pred == y_test)
    
    print("--- Random Forest Classifier Diagnostics ---")
    print(f"Number of trained estimators: {len(rf.trees)}")
    print(f"Features sampled per tree split: {len(rf.feature_indices[0])}")
    print(f"Generalization Accuracy: {test_accuracy * 100:.2f}%")
```

## System Constraints and Optimizations

Deploying Random Forests in low-latency environments highlights critical system tradeoffs:

1. **Memory Inflation**: Unlike parametric models (e.g., Logistic Regression), a Random Forest is non-parametric and grows with data size. An ensemble of 500 deep trees can require gigabytes of RAM to store node split values, thresholds, and leaf values. This presents obstacles when deploying to edge devices or serverless instances.
2. **Inference Latency**: Evaluating an ensemble requires passing the input vector through hundreds of tree structures sequentially or in parallel. In sub-millisecond response SLA pipelines (such as search ranking or high-frequency trading), this depth traversal overhead is often unacceptable.
3. **Sparsity Handling**: Decision trees require evaluating numerical thresholds. For high-dimensional sparse inputs (e.g., millions of one-hot tokens), evaluating splits on zeroes is highly inefficient compared to sparse matrix operations in linear models.

**Production Recommendation**: Use Random Forests as a robust, out-of-the-box model for multi-type tabular data requiring high accuracy and minimal tuning. If serving latency is your primary bottleneck, prune tree depths, reduce the number of estimators, or export model structures to optimized runtimes like ONNX or Treelite.
