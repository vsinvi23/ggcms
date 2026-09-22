# Ensemble Learning: From Decision Trees to Random Forests (Bagging)

Many real-world machine learning tasks are governed by highly non-linear relationships. While linear models struggle to represent complex boundaries without manual interaction or polynomial features, Decision Trees recursively partition the feature space to make predictions. However, a single decision tree is notorious for high variance—it easily overfits and is highly sensitive to minor perturbations in the training data. Ensemble learning solves this vulnerability. Specifically, Random Forests combine multiple trees using Bootstrap Aggregating (Bagging) to construct a highly resilient model.

---

## The Problem: High Variance and Overfitting in Single Decision Trees

A Decision Tree operates by making sequential splits along feature axes to minimize impurity (Gini or Entropy). The deeper a tree grows, the more complex its decision boundaries become, eventually memorizing individual noise or outliers in the training data.

This structural vulnerability leads to a classic **high-variance, low-bias** problem. If you change only a few rows of data, the entire root split can change, altering the downstream node logic completely. To build a robust, generalizable model, we must reduce this variance.

---

## Technical Architecture of Random Forests (Bagging)

Bootstrap Aggregating, or **Bagging**, is an ensemble meta-algorithm designed to improve the stability and accuracy of machine learning algorithms. A **Random Forest** is an extension of bagging that also decorrelates trees by randomly subsampling the feature space at each split.

```
                   Original Dataset [N samples, D features]
                                 |
         +-----------------------+-----------------------+
         | (Bootstrap 1)         | (Bootstrap 2)         | (Bootstrap K)
         v                       v                       v
    Subset D_1              Subset D_2              Subset D_K
    (random features)       (random features)       (random features)
         |                       |                       |
         v                       v                       v
     Tree 1                  Tree 2                  Tree K
    (Prediction y_1)        (Prediction y_2)        (Prediction y_K)
         |                       |                       |
         +-----------------------+-----------------------+
                                 |
                                 v
                        [ Majority Vote / Avg ]
                                 |
                                 v
                          Final Prediction
```

### 1. Mathematics of Node Splitting
We measure node impurity using **Gini Impurity** ($I_G$) or **Entropy** ($H$). For a node containing data partitioned into $C$ classes:

$$I_G(p) = 1 - \sum_{i=1}^C p_i^2$$

$$H(p) = -\sum_{i=1}^C p_i \log_2(p_i)$$

The best split maximizes the **Information Gain** ($IG$):

$$IG(D, A) = I(D) - \sum_{v \in \text{splits}} \frac{|D_v|}{|D|} I(D_v)$$

### 2. Random Feature Subsampling
If trees are bagged on bootstrapped samples alone, they remain highly correlated because the same dominant features will be chosen as the top splits across most trees. To decorrelate the trees, Random Forests select a random subset of $m$ features (typically $m = \sqrt{D}$ for classification) at each node split. This forces trees to learn from alternative feature representations, reducing ensemble variance.

---

## Implementation of Bagging and Random Feature Selection in Python

The following code implements the bootstrapping, random feature selection, and aggregation mechanics of a Random Forest from scratch using NumPy.

```python
import numpy as np

class RandomForestSim:
    def __init__(self, n_trees: int = 10, max_depth: int = 5, min_samples_split: int = 2):
        self.n_trees = n_trees
        self.max_depth = max_depth
        self.min_samples_split = min_samples_split
        self.trees = []

    def _get_bootstrap_sample(self, X: np.ndarray, y: np.ndarray):
        """
        Samples N data points with replacement (bootstrap sampling).
        """
        n_samples = X.shape[0]
        indices = np.random.choice(n_samples, size=n_samples, replace=True)
        return X[indices], y[indices]

    def _get_random_features(self, n_features: int) -> np.ndarray:
        """
        Selects a random subset of features (typically sqrt(total_features)).
        """
        n_sub = int(np.sqrt(n_features))
        return np.random.choice(n_features, size=n_sub, replace=False)

    def fit(self, X: np.ndarray, y: np.ndarray):
        """
        Simulates training multiple trees using bootstrapping and feature subsampling.
        """
        self.trees = []
        n_samples, n_features = X.shape

        for i in range(self.n_trees):
            # 1. Generate Bootstrap Sample
            X_boot, y_boot = self._get_bootstrap_sample(X, y)

            # 2. Select Random Features for this tree's training
            feature_indices = self._get_random_features(n_features)
            
            # Store mock tree representation (feature indices and bootstrap parameters)
            # In a full model, we would train a real DecisionTree using these parameters
            tree_metadata = {
                "features": feature_indices,
                "bootstrap_indices": X_boot,
                "class_distribution": np.bincount(y_boot)
            }
            self.trees.append(tree_metadata)

    def predict_simulated(self, X: np.ndarray) -> np.ndarray:
        """
        Simulates final aggregation via voting.
        """
        # In this mock predictor, we return the argmax of the aggregated distributions
        aggregated_votes = np.zeros((X.shape[0], len(self.trees[0]["class_distribution"])))
        for tree in self.trees:
            # Add weighted distributions based on the tree's selected training features
            for i, x in enumerate(X):
                val = np.sum(x[tree["features"]])
                if val > 0:
                    aggregated_votes[i] += tree["class_distribution"]
        
        return np.argmax(aggregated_votes, axis=1)
```

---

## Developer Takeaways

* **Out-of-Bag (OOB) Evaluation:** Because bootstrapping samples with replacement, roughly $36.8\%$ of the dataset is left unselected for each tree. This "Out-of-Bag" data acts as a built-in validation set, allowing you to estimate generalization error without a separate validation split.
* **Feature Importance:** Random Forests provide high-quality feature importance rankings. By measuring how much the Gini impurity drops across all trees due to splits on a specific feature, developers can determine which variables hold the most predictive power.
* **Bagging vs. Boosting:** Bagging trains trees in parallel and reduces variance. Boosting trains trees sequentially (each tree correcting the mistakes of its predecessor) and reduces bias.
