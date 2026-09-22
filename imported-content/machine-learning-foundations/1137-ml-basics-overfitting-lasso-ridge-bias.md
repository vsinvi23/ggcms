# ML Model Tuning: Bias-Variance Tradeoff and L1/L2 Regularization

## The Problem
The fundamental challenge of machine learning is training a model that not only performs well on training data but generalizes perfectly to unseen data. 
- **High Bias (Underfitting)**: The model is too simple to capture the underlying patterns (e.g., using a straight line for a sine wave).
- **High Variance (Overfitting)**: The model is too complex and memorizes noise, creating erratic decision boundaries.
We need mathematical constraints to penalize model complexity without sacrificing predictive power.

## Architectural Approach
**Regularization** modifies the loss function to explicitly penalize large weights. By artificially shrinking weights towards zero, we force the model to rely only on the most critical, stable features.

### L2 Regularization (Ridge)
Penalizes the squared magnitude of weights. It forces all weights to become very small, but rarely exactly zero.
$$ J_{Ridge} = \text{Loss} + \lambda \sum w_i^2 $$

### L1 Regularization (Lasso)
Penalizes the absolute magnitude of weights. Because of its diamond-shaped constraint space, L1 frequently drives less important feature weights to exactly $0$, performing inherent **feature selection**.
$$ J_{Lasso} = \text{Loss} + \lambda \sum |w_i| $$

```text
    Model Complexity vs Error
    
    Error ^
          |      \                 /  Test Error (Variance)
          |       \               /
          |        \      _ _ _ _/
          |         \    /
          |          \  / 
          |           \/  <-- Sweet Spot (Optimal Regularization λ)
          |           / \
          |          /   \
          |         /     \_ _ _ _ _ Training Error (Bias)
          |        /
          +----------------------------------->
                Low Complexity          High Complexity
               (High Bias)             (High Variance)
```

## Implementation

The following Python code uses scikit-learn to demonstrate how L1 and L2 regularization affect the learned coefficients when confronting a highly collinear, noisy dataset.

```python
import numpy as np
from sklearn.linear_model import LinearRegression, Ridge, Lasso
from sklearn.datasets import make_regression
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error

def demonstrate_regularization():
    # 1. Create a dataset with 50 features, but only 10 are actually useful (informative)
    X, y = make_regression(n_samples=200, n_features=50, n_informative=10, 
                           noise=25.0, random_state=42)
    X_train, X_test, y_train, y_test = train_test_split(X, y, random_state=42)

    # 2. Unregularized Model (High Variance Risk)
    lr = LinearRegression()
    lr.fit(X_train, y_train)
    lr_test_err = mean_squared_error(y_test, lr.predict(X_test))

    # 3. L2 Regularization (Ridge)
    ridge = Ridge(alpha=10.0) # alpha is equivalent to lambda
    ridge.fit(X_train, y_train)
    ridge_test_err = mean_squared_error(y_test, ridge.predict(X_test))

    # 4. L1 Regularization (Lasso)
    lasso = Lasso(alpha=5.0)
    lasso.fit(X_train, y_train)
    lasso_test_err = mean_squared_error(y_test, lasso.predict(X_test))

    # 5. Analysis
    print("--- Test Set MSE ---")
    print(f"Linear Regression: {lr_test_err:.2f}")
    print(f"Ridge (L2)       : {ridge_test_err:.2f}")
    print(f"Lasso (L1)       : {lasso_test_err:.2f}")

    print("\n--- Feature Selection (Sparsity) ---")
    print(f"LR Zero Weights   : {np.sum(lr.coef_ == 0)} / 50")
    print(f"Ridge Zero Weights: {np.sum(ridge.coef_ == 0)} / 50")
    print(f"Lasso Zero Weights: {np.sum(lasso.coef_ == 0)} / 50 (Inherent Feature Selection!)")

if __name__ == "__main__":
    demonstrate_regularization()
```

## Trade-offs and Considerations
1. **Choosing $\lambda$ (Alpha)**: The hyperparameter $\lambda$ dictates the strength of the penalty. $\lambda = 0$ is standard regression. $\lambda \to \infty$ forces all weights to zero (resulting in a horizontal line). $\lambda$ must be found via Cross-Validation.
2. **Collinearity**: If two features are highly correlated, L2 (Ridge) will shrink their weights equally. L1 (Lasso) will arbitrarily pick one feature and zero out the other. 
3. **Elastic Net**: When you need the stability of L2 but the feature-selection capabilities of L1, the **Elastic Net** algorithm linearly combines both penalty terms into a single objective function.
