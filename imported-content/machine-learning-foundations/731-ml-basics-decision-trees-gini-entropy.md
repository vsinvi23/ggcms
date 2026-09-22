# Ensemble Learning: From Decision Trees to Random Forests (Bagging)

## The Problem
A single Decision Tree is a highly interpretable model that greedily splits data based on feature values to maximize information gain. However, standalone decision trees are highly susceptible to overfitting—they memorize training noise, creating complex, deep trees with extremely high variance. Small perturbations in the training dataset can yield wildly different tree structures. The engineering challenge is reducing this variance and stabilizing predictions without sacrificing the expressive power of non-linear decision boundaries.

## Technical Architecture

The solution is Bootstrap Aggregating (Bagging). Random Forest is the quintessential bagging algorithm, constructing an ensemble (a "forest") of independent decision trees. 

### Bagging Mechanics
1. **Bootstrapping**: For $B$ trees, sample $m$ instances from the training data with replacement. Each tree sees a slightly different subset of data.
2. **Feature Randomness**: At each split in a tree, instead of searching greedily across *all* features, a random subset of features (typically $\sqrt{n}$) is evaluated.
3. **Aggregation**: 
   - Regression: Average the predictions of all trees.
   - Classification: Majority voting.

### Split Criteria (Gini and Entropy)
To evaluate the quality of a split, Random Forests rely on impurity metrics:

**Gini Impurity (default in CART):** Measures the probability of misclassifying a randomly chosen element.
$$ Gini(p) = 1 - \sum_{i=1}^{J} p_i^2 $$
Where $p_i$ is the ratio of class $i$ instances in the node.

**Entropy (Information Gain):** Measures the uncertainty in the node.
$$ Entropy(p) = - \sum_{i=1}^{J} p_i \log_2(p_i) $$

```text
               +-------------------+
               | Original Dataset  |
               +-------------------+
             /           |           \
     Bootstrap 1    Bootstrap 2 ... Bootstrap B
        /                |                \
 +----------+      +----------+      +----------+
 |  Tree 1  |      |  Tree 2  |      |  Tree B  |
 +----------+      +----------+      +----------+
      \                  |                  /
       \                 |                 /
        +---------------------------------+
        |     Aggregation (Voting/Mean)   |
        +---------------------------------+
```

## Implementation

The robust strength of a Random Forest lies in the decorrelation of its constituent trees. We simulate a minimal Random Forest implementation focusing on the Bootstrap and Feature Randomization architectural components.

```python
import numpy as np
from sklearn.tree import DecisionTreeClassifier
from collections import Counter

class RandomForestClassifierCustom:
    def __init__(self, n_estimators: int = 100, max_depth: int = 10, max_features: str = 'sqrt'):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.max_features = max_features
        self.trees = []

    def fit(self, X: np.ndarray, y: np.ndarray) -> None:
        self.trees = []
        n_samples, n_features = X.shape
        
        # Calculate max features to use at each split
        if self.max_features == 'sqrt':
            max_feat = int(np.sqrt(n_features))
        else:
            max_feat = n_features

        for _ in range(self.n_estimators):
            # Bootstrapping: sample with replacement
            indices = np.random.choice(n_samples, n_samples, replace=True)
            X_bootstrap, y_bootstrap = X[indices], y[indices]
            
            # Train base tree
            tree = DecisionTreeClassifier(
                max_depth=self.max_depth, 
                max_features=max_feat,
                criterion='gini' # Utilizing Gini Impurity
            )
            tree.fit(X_bootstrap, y_bootstrap)
            self.trees.append(tree)

    def predict(self, X: np.ndarray) -> np.ndarray:
        # Collect predictions from all trees
        tree_preds = np.array([tree.predict(X) for tree in self.trees])
        
        # Majority voting
        y_pred = []
        for i in range(X.shape[0]):
            sample_preds = tree_preds[:, i]
            most_common = Counter(sample_preds).most_common(1)[0][0]
            y_pred.append(most_common)
            
        return np.array(y_pred)

# Example Usage
if __name__ == "__main__":
    from sklearn.datasets import load_breast_cancer
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score

    X, y = load_breast_cancer(return_X_y=True)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    rf = RandomForestClassifierCustom(n_estimators=50, max_depth=5)
    rf.fit(X_train, y_train)
    
    preds = rf.predict(X_test)
    print(f"Random Forest Accuracy: {accuracy_score(y_test, preds):.4f}")
```

## System Constraints and Optimizations
Random Forests natively parallelize. Because trees are built independently, distributed systems (like Spark) compute trees across cluster nodes without synchronization blocks. However, forests are memory-intensive. A 1000-tree forest on dense data yields massive serialized payloads. To optimize inference time in production latency-sensitive APIs, use libraries like ONNX or Treelite to compile the ensemble structure down to highly optimized C++ switch statements, significantly dropping millisecond latency.
