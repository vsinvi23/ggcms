# Ensemble Learning: From Decision Trees to Random Forests (Bagging)

## The Problem
Single decision trees are highly interpretable but notoriously prone to overfitting. They build deep, complex structures that perfectly memorize the training data, capturing the underlying noise rather than the core signal. This results in models with low bias but exceptionally high variance, leading to poor generalization on unseen data.

## Architectural Approach
**Bagging (Bootstrap Aggregating)** mitigates high variance by training multiple independent decision trees on random subsets of the data and aggregating their predictions. 

**Random Forests** extend bagging by introducing *feature randomness*. At each split in a tree, instead of searching greedily across all features, the algorithm randomly selects a subset of features. This decorrelates the individual trees, ensuring that a single dominant feature doesn't dominate every tree's root node.

### Splitting Criteria
Trees recursively partition the data maximizing Information Gain:
- **Gini Impurity**: $G = 1 - \sum (p_i)^2$ (computational efficiency).
- **Entropy**: $H = -\sum p_i \log_2(p_i)$ (balanced trees).

```text
    +-------------------+
    | Original Dataset  |
    +-------------------+
       /      |       \
 (Bootstrap Sampling & Feature Subsetting)
     /        |         \
+-------+ +-------+  +-------+
|Tree 1 | |Tree 2 |  |Tree N |
+-------+ +-------+  +-------+
    \         |         /
     \        |        /
    (Aggregation: Majority Vote or Average)
              |
              v
    +-------------------+
    | Final Prediction  |
    +-------------------+
```

## Implementation

The following Python code demonstrates the underlying mechanics of a Random Forest by utilizing scikit-learn's optimized implementations, focusing on how multiple estimators combine to reduce variance.

```python
import numpy as np
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.datasets import make_moons
from sklearn.metrics import accuracy_score

def compare_tree_vs_forest():
    # 1. Generate a complex, noisy dataset prone to overfitting
    X, y = make_moons(n_samples=500, noise=0.30, random_state=42)
    X_train, X_test, y_train, y_test = train_test_split(X, y, random_state=42)

    # 2. Train a single, unconstrained Decision Tree (High Variance)
    tree_clf = DecisionTreeClassifier(random_state=42)
    tree_clf.fit(X_train, y_train)
    
    tree_train_acc = accuracy_score(y_train, tree_clf.predict(X_train))
    tree_test_acc = accuracy_score(y_test, tree_clf.predict(X_test))

    # 3. Train a Random Forest (Ensemble Bagging)
    # n_estimators: Number of trees in the forest
    # max_features: "sqrt" randomly selects a subset of features for each split
    forest_clf = RandomForestClassifier(n_estimators=100, 
                                        max_features="sqrt", 
                                        n_jobs=-1, 
                                        random_state=42)
    forest_clf.fit(X_train, y_train)
    
    forest_train_acc = accuracy_score(y_train, forest_clf.predict(X_train))
    forest_test_acc = accuracy_score(y_test, forest_clf.predict(X_test))

    # 4. Compare Generalization
    print("--- Single Decision Tree ---")
    print(f"Training Accuracy : {tree_train_acc:.4f} (Overfitting indicator)")
    print(f"Test Accuracy     : {tree_test_acc:.4f}")
    
    print("\n--- Random Forest (Bagging) ---")
    print(f"Training Accuracy : {forest_train_acc:.4f}")
    print(f"Test Accuracy     : {forest_test_acc:.4f} (Better generalization)")

if __name__ == "__main__":
    compare_tree_vs_forest()
```

## Trade-offs and Considerations
1. **Variance Reduction**: Bagging drastically reduces the variance of an algorithm without increasing its bias. This is why random forests almost universally outperform single trees.
2. **Interpretability**: A single decision tree is transparent (you can trace the exact logic path). A random forest of 500 trees operates as a black box. Tools like Feature Importance metrics and SHAP values are required to restore interpretability.
3. **Parallelization**: Because each tree in a random forest is built completely independently on its own bootstrap sample, training can be trivially parallelized across multiple CPU cores (`n_jobs=-1`), making it highly scalable for tabular data.
