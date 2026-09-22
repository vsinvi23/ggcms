# ML Model Tuning: Bias-Variance Tradeoff and L1/L2 Regularization

## The Problem
Developing highly accurate machine learning models requires balancing two opposing sources of error: Bias and Variance. High bias (underfitting) occurs when a model is too simple to capture the underlying structure of the data, such as a linear model applied to quadratic data. High variance (overfitting) occurs when a model is excessively complex, memorizing random noise and training fluctuations rather than generalizing.

When models are over-parameterized relative to the sample size, they easily overfit. While expanding the feature set or training for more iterations decreases training error, it eventually degrades generalization performance on unseen test data. The core challenge is to establish a mathematically controlled constraint system—known as **Regularization**—that penalizes excessive model complexity, directly shrinking parameter weights to stabilize predictions.

## Technical Architecture

The total generalization error of any predictive model can be decomposed into three distinct components:

$$ \text{Total Expected Error} = \text{Bias}[\hat{f}(x)]^2 + \text{Variance}[\hat{f}(x)] + \sigma^2 $$

Where $\sigma^2$ is the irreducible noise (the theoretical limit of prediction accuracy due to unobserved features or random processes).

```text
The Bias-Variance Tradeoff:
  Error
   ^
   |       \                                 /  <-- High Variance (Overfitting)
   |        \  Total Generalization Error   /
   |         \                             /
   |          \        *                  /
   |           \_____/   \_______________/
   |           /  Optimal \
   |  Bias    /     Model  \
   |  (Under- /   Complexity\
   |  fitting)              \  Variance
   +--------------------------------------------------> Model Complexity
              Low                      High

Geometric Representation of Constraints:
        L1 Regularization (Lasso)             L2 Regularization (Ridge)
               w2                                    w2
               ^                                     ^
               |   /\  Contours of                   |  / \  Contours of
               |  /  \ MSE Loss                      | |   | MSE Loss
             __| /____\__                            |  \ /
            /  |/      \                             |---*---
       <---*---|--------*---> w1                <---*----|----*---> w1
            \  |       /                             |  / \
             \ |______/                              | |   |
               |                                     |  \ /
               v                                     v
         Diamond Constraint                    Circular Constraint
       (Intersects exactly on axis:          (Intersects smoothly,
        sparsity w2 = 0)                      no exact zero weights)
```

To limit model complexity, we add a penalty term $R(\theta)$ to the standard Mean Squared Error loss:

### 1. L1 Regularization: Lasso Regression
Lasso (Least Absolute Shrinkage and Selection Operator) penalizes the absolute values of the weights:

$$ J(\theta) = \frac{1}{2m} \sum_{i=1}^{m} \left( h_\theta(x^{(i)}) - y^{(i)} \right)^2 + \alpha \sum_{j=1}^{n} |\theta_j| $$

Because the L1 absolute value penalty generates a diamond-shaped constraint boundary, the optimal parameter selection often intersects the constraint region at a corner. This forces some weights $\theta_j$ to become **exactly zero**, making Lasso highly effective for automated feature selection and sparse representation.

### 2. L2 Regularization: Ridge Regression
Ridge penalizes the squared magnitude of the weights:

$$ J(\theta) = \frac{1}{2m} \sum_{i=1}^{m} \left( h_\theta(x^{(i)}) - y^{(i)} \right)^2 + \frac{\alpha}{2} \sum_{j=1}^{n} \theta_j^2 $$

The L2 quadratic penalty generates a circular, smooth constraint boundary. This pulls parameter values close to zero but **never exactly to zero**, distributing weights across all features to reduce sensitivity to highly correlated inputs.

### 3. Elastic Net Regression
Elastic Net combines both L1 and L2 regularization to balance feature selection and correlation grouping:

$$ J(\theta) = \text{MSE}(\theta) + r \alpha \sum_{j=1}^{n} |\theta_j| + \frac{1-r}{2} \alpha \sum_{j=1}^{n} \theta_j^2 $$

Where $r \in [0, 1]$ represents the ratio of L1 to L2 penalty.

## Implementation

The following Python class implements Regularized Linear Regression using Gradient Descent. For L1 (Lasso) optimization, because $|\theta|$ is non-differentiable at $0$, the gradient update uses a **subgradient** approach based on the mathematical sign of $\theta$.

```python
import numpy as np
from typing import Tuple

class RegularizedRegressionScratch:
    """
    Linear Regression with L1 (Lasso) and L2 (Ridge) Regularization 
    optimized via Gradient Descent.
    """
    def __init__(self, learning_rate: float = 0.01, n_iterations: int = 1000,
                 alpha: float = 0.1, penalty: str = 'l2') -> None:
        self.learning_rate: float = learning_rate
        self.n_iterations: int = n_iterations
        self.alpha: float = alpha
        self.penalty: str = penalty.lower()
        self.theta: np.ndarray = None

    def fit(self, X: np.ndarray, y: np.ndarray) -> 'RegularizedRegressionScratch':
        """
        Fits regularized coefficients. Note that the bias/intercept term is NOT regularized.
        """
        if y.ndim == 1:
            y = y.reshape(-1, 1)
            
        m, n = X.shape
        # Prepend column of ones for intercept
        X_b = np.c_[np.ones((m, 1)), X]
        self.theta = np.zeros((n + 1, 1))

        for _ in range(self.n_iterations):
            predictions = X_b.dot(self.theta)
            errors = predictions - y
            
            # Base MSE gradient
            gradient = (1.0 / m) * X_b.T.dot(errors)
            
            # Apply regularization penalty (skipping bias term theta_0)
            reg_term = np.zeros_like(self.theta)
            if self.penalty == 'l2':
                # Ridge: Derivative of (alpha/2) * sum(theta^2) = alpha * theta
                reg_term[1:] = self.alpha * self.theta[1:]
            elif self.penalty == 'l1':
                # Lasso: Subgradient of alpha * sum(|theta|) = alpha * sign(theta)
                reg_term[1:] = self.alpha * np.sign(self.theta[1:])
                
            gradient += reg_term
            self.theta -= self.learning_rate * gradient

        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Predicts target using fitted regularized parameters.
        """
        if self.theta is None:
            raise ValueError("Model is not fitted yet.")
        m = X.shape[0]
        X_b = np.c_[np.ones((m, 1)), X]
        return X_b.dot(self.theta)

if __name__ == "__main__":
    # Generate high-dimensional dataset with collinearity
    np.random.seed(42)
    X_train = np.random.randn(100, 8) # 100 samples, 8 features
    # Only features 0 and 1 are informative, others are random noise
    y_train = X_train[:, 0] * 2.5 + X_train[:, 1] * -1.5 + np.random.randn(100) * 0.15
    y_train = y_train.reshape(-1, 1)

    # Train L1 (Lasso) and L2 (Ridge) models
    lasso = RegularizedRegressionScratch(penalty='l1', alpha=0.5, n_iterations=2000)
    lasso.fit(X_train, y_train)

    ridge = RegularizedRegressionScratch(penalty='l2', alpha=0.5, n_iterations=2000)
    ridge.fit(X_train, y_train)

    print("--- Lasso (L1) Parameter Coefficients ---")
    print(lasso.theta.flatten()) # Expected: Noise columns (2 to 7) shrunk exactly to 0
    print("Number of zeroed weights:", np.sum(np.abs(lasso.theta[1:]) < 1e-3))

    print("\n--- Ridge (L2) Parameter Coefficients ---")
    print(ridge.theta.flatten()) # Expected: Small, non-zero weights for noise features
    print("Number of zeroed weights:", np.sum(np.abs(ridge.theta[1:]) < 1e-3))
```

## System Constraints and Optimizations

Implementing regularized learning models at scale requires managing two crucial constraints:

1. **Feature Scale Sensitivity**: Regularization applies an identical penalty multiplier ($\alpha$) across all weight coefficients. If feature units differ (e.g., age in years vs. annual income in dollars), the model will artificially assign tiny weights to features with massive scales. This prevents them from being regularized correctly. Standardizing features to zero mean and unit variance is **mandatory** before applying regularization.
2. **Computational Non-Differentiability of L1**: The L1 penalty contains the absolute value function $|\theta|$, which lacks a derivative at $\theta_j = 0$. Using vanilla gradient descent leads to numeric oscillations around zero. Production systems use **Coordinate Descent** or **Proximal Gradient Methods** (such as the FISTA algorithm) to update parameters efficiently and guarantee sparse convergence.
3. **Hyperparameter Optimization Cost**: Finding the optimal tuning parameters ($\alpha$ and Elastic Net ratio $r$) requires exploring a wide continuous space. Running cross-validation across massive datasets to locate the minimal generalization error can introduce high compute costs.

**Production Recommendation**: Always apply **standardization preprocessing** before fitting regularized models. Use Ridge regression if you expect many small, distributed signals, and Lasso if you seek maximum model interpretability and sparsity-based feature reduction.
