# ML Model Tuning: Bias-Variance Tradeoff and L1/L2 Regularization

## The Problem
A common pitfall in machine learning is deploying a model that achieves near-perfect accuracy on the training set, only to fail dramatically on out-of-sample production data. This is **overfitting** (high variance). Conversely, deploying a model that is too simplistic to capture the underlying relationships results in poor performance across both training and test datasets. This is **underfitting** (high bias). 

```text
  High Bias (Underfitting)       Balanced Generalization       High Variance (Overfitting)
       +-------------+               +-------------+               +-------------+
       |   o      o  |               |   o  ,-*-.  |               |  _o_   _,-. |
       |  /          |               |  /  *   o \ |               | /   \*'   o |
       | /   o    o  |               | /  o       \|               |/   o   \  / |
       |/            |               |/            |               |         \/  |
       +-------------+               +-------------+               +-------------+
        Linear Fit                    Polynomial Fit                 Spaghetti Fit
```

As developers add features or increase model capacity, variance increases and bias decreases. The core challenge is to identify the optimal sweet spot that minimizes total error while enforcing mathematical constraints directly within the training objective to restrict the growth of model parameters.

## Technical Architecture

The total expected prediction error of any machine learning model can be decomposed mathematically into three distinct components:

$$ \text{Total Error} = \text{Bias}^2 + \text{Variance} + \text{Irreducible Noise} $$

Where:
- **Bias**: Error introduced by approximating a real-world complex problem with a simplified model (e.g., fitting a straight line to quadratic data).
- **Variance**: Error reflecting how much the model's predictions would fluctuate if trained on a different dataset.
- **Irreducible Noise** ($\sigma^2$): The natural variance inherent in the data-generating process itself.

To control the bias-variance tradeoff on complex datasets, we introduce **Regularization**—adding a penalty term to the cost function to restrict the parameters ($\theta$) from growing too large.

### 1. Ridge Regression (L2 Regularization)
Ridge regression adds a quadratic penalty proportional to the squared magnitude of the weights:

$$ J(\theta) = \frac{1}{2m} \sum_{i=1}^{m} \left( h_\theta(x^{(i)}) - y^{(i)} \right)^2 + \frac{\lambda}{2m} \sum_{j=1}^{n} \theta_j^2 $$

Where $\lambda \ge 0$ is the regularization hyperparameter. In vectorized matrix form, the closed-form analytical solution is:

$$ \theta = \left( X^T X + \lambda I \right)^{-1} X^T y $$

Where $I$ is the identity matrix (with a $0$ at the top-left to avoid regularizing the bias term $\theta_0$). Adding $\lambda I$ guarantees that the matrix is invertible even in the presence of multicollinearity.

### 2. Lasso Regression (L1 Regularization)
Lasso (Least Absolute Shrinkage and Selection Operator) adds a penalty proportional to the absolute magnitude of the weights:

$$ J(\theta) = \frac{1}{2m} \sum_{i=1}^{m} \left( h_\theta(x^{(i)}) - y^{(i)} \right)^2 + \frac{\lambda}{m} \sum_{j=1}^{n} |\theta_j| $$

```text
              L1 (Lasso) vs L2 (Ridge) Constraint Spaces
        
           Lasso Constraint (L1)                 Ridge Constraint (L2)
                w2 ^                                  w2 ^
                   |                                       |
                   |   /|                                  |   _--_
                   |  / |                                  |  /    \
        -----------+--*-/--------> w1           -----------+--*-----/----> w1
                  /| /                                    / \      /
                 / |/                                     \  ^____/
                /                                          --_
        
   * = Intersection point occurs on a       * = Intersection occurs away from axes.
   coordinate axis, forcing w2 to 0.        Weights are shrunk but remain non-zero.
```

Because the absolute value function has a sharp corner at zero, its gradient is undefined at $\theta_j = 0$. Instead, Lasso optimization relies on sub-gradients, driving non-essential feature weights to exactly $0$. This results in **sparse models**, effectively performing automatic feature selection.

## Implementation

Below is a complete implementation of Ridge Regression using its analytical closed-form solution, along with Lasso Regression solved iteratively using coordinate descent with soft thresholding.

```python
import numpy as np
from typing import Tuple

class RegularizedRegression:
    def __init__(self, l2_penalty: float = 0.0, l1_penalty: float = 0.0) -> None:
        self.l2_penalty: float = l2_penalty
        self.l1_penalty: float = l1_penalty
        self.theta: np.ndarray = None

    def fit_ridge(self, X: np.ndarray, y: np.ndarray) -> 'RegularizedRegression':
        """
        Fits Ridge Regression (L2) using the closed-form analytical equation.
        """
        if y.ndim == 1:
            y = y.reshape(-1, 1)
        m, n = X.shape
        X_b = np.c_[np.ones((m, 1)), X]
        
        # Create identity-like matrix of size (n+1, n+1)
        # We do not regularize the intercept term (index 0)
        I = np.identity(n + 1)
        I[0, 0] = 0.0
        
        # Analytical formula: (X^T * X + lambda * I)^-1 * X^T * y
        self.theta = np.linalg.inv(X_b.T.dot(X_b) + self.l2_penalty * I).dot(X_b.T).dot(y)
        return self

    def _soft_threshold(self, rho: float, lam: float) -> float:
        """
        Applies soft thresholding operator for Lasso coordinate descent.
        """
        if rho < -lam:
            return rho + lam
        elif rho > lam:
            return rho - lam
        else:
            return 0.0

    def fit_lasso(self, X: np.ndarray, y: np.ndarray, max_iter: int = 1000, tol: float = 1e-4) -> 'RegularizedRegression':
        """
        Fits Lasso Regression (L1) using Coordinate Descent with soft thresholding.
        """
        if y.ndim == 1:
            y = y.reshape(-1, 1)
        m, n = X.shape
        X_b = np.c_[np.ones((m, 1)), X]
        
        # Initialize weights
        self.theta = np.zeros((n + 1, 1))

        for iteration in range(max_iter):
            theta_old = self.theta.copy()
            
            for j in range(n + 1):
                # Calculate prediction excluding feature j
                X_without_j = np.delete(X_b, j, axis=1)
                theta_without_j = np.delete(self.theta, j, axis=0)
                predictions_without_j = X_without_j.dot(theta_without_j)
                
                # Compute rho: correlation of feature j with the residuals
                rho = np.sum(X_b[:, j:j+1] * (y - predictions_without_j))
                
                if j == 0:
                    # Do not regularize the intercept
                    self.theta[j] = rho / m
                else:
                    # Apply L1 soft-thresholding penalty
                    self.theta[j] = self._soft_threshold(rho, self.l1_penalty) / np.sum(X_b[:, j] ** 2)

            # Check convergence tolerance
            if np.sum((self.theta - theta_old) ** 2) < tol:
                break
                
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        m = X.shape[0]
        X_b = np.c_[np.ones((m, 1)), X]
        return X_b.dot(self.theta)

if __name__ == "__main__":
    # Generate multicollinear data: x2 is almost identical to x1
    np.random.seed(42)
    X = np.random.randn(100, 3)
    X[:, 1] = X[:, 0] + np.random.randn(100) * 0.001  # Collinear feature
    y = 5 + 2 * X[:, 0:1] + np.random.randn(100, 1) * 0.1

    # Train L2 Ridge
    model_ridge = RegularizedRegression(l2_penalty=10.0)
    model_ridge.fit_ridge(X, y)
    
    # Train L1 Lasso
    model_lasso = RegularizedRegression(l1_penalty=1.0)
    model_lasso.fit_lasso(X, y)

    print("--- Ridge (L2) Weight Distribution ---")
    print(model_ridge.theta.ravel())  # Collinear weights are balanced and shrunk
    
    print("\n--- Lasso (L1) Weight Distribution ---")
    print(model_lasso.theta.ravel())  # Collinear weight 2 is driven EXACTLY to 0!
```

## System Constraints and Optimizations
Selecting and deploying regularized models requires several strategic decisions:

1. **Hyperparameter Search ($\lambda$)**: The penalty scale $\lambda$ must be selected using cross-validation (e.g., Grid Search or Random Search over validation splits) rather than optimization on the training data.
2. **Computational Non-Differentiability**: Because L1 regularization is non-differentiable at $\theta_j = 0$, you cannot optimize Lasso using standard closed-form matrix calculations. If coordinate descent is too slow on extremely large-scale data, switch to **Elastic Net Regularization**, which linearly combines both L1 and L2 penalties:
   $$ \mathcal{L}_{Elastic} = \mathcal{L}_{MSE} + \gamma_1 \|\theta\|_1 + \gamma_2 \|\theta\|_2^2 $$
3. **Feature Scaling**: Regularization metrics apply penalties directly to weight magnitudes. If one feature is on a scale of $0.001$ and another is on a scale of $1,000,000$, their computed weights will be on dramatically different scales. **Standardizing features is mandatory** before regularizing.
