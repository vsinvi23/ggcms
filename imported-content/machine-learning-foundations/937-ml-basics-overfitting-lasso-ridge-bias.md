# ML Model Tuning: Bias-Variance Tradeoff and L1/L2 Regularization

## The Problem
A primary objective when training machine learning models is ensuring they generalize to unseen, out-of-sample data. When a model fails, it typically falls into one of two traps: **underfitting** (high bias), where the model's structural assumptions are too simple to capture the underlying data patterns, or **overfitting** (high variance), where the model is overly complex and memorizes random training noise. 

In high-dimensional spaces or under conditions of multicollinearity (correlated features), standard Ordinary Least Squares (OLS) linear models generate extremely large, unstable parameter weights. This produces high variance and fragile generalizability. To solve this, we must establish a mathematical framework to control the model's capacity and manage the bias-variance tradeoff systematically.

## Technical Architecture

The total expected prediction error of any regression model can be decomposed mathematically:

$$ \text{Total Expected Error} = \text{Bias}^2 + \text{Variance} + \sigma^2 \quad \text{(Irreducible Error)} $$

Regularization manages this tradeoff by introducing a penalty term directly into the cost function, tradeing a slight increase in bias for a massive reduction in parameter variance.

```text
       L1 Lasso Penalty Geometry                    L2 Ridge Penalty Geometry
               theta2                                       theta2
                 ^                                            ^
                 |   / \                                      |   ****
                 |  /   \   Contours of                       |  *    *   Contours of
                 | /     \  Unpenalized Cost                  | *      *  Unpenalized Cost
        ---------+---------=========> theta1         ---------+---------=========> theta1
                 | \     /   *                                | *      *   *
                 |  \   /   * *                               |  *    *   * *
                 |   \ /     *                                |   ****     *
                 +                                            +
         (Diamond Constraint)                          (Circular Constraint)
  Intersects axis exactly at corners             Intersects tangentially, shrinking
  (forces coefficients to 0 -> sparse)          coefficients smoothly toward 0
```

### 1. L2 Regularization: Ridge Regression
Ridge regression adds a penalty proportional to the sum of **squared** magnitudes of the coefficients (excluding the intercept):

$$ J(\theta) = \frac{1}{2m} \sum_{i=1}^{m} \left( h_\theta(x^{(i)}) - y^{(i)} \right)^2 + \frac{\lambda}{2} \sum_{j=1}^{n} \theta_j^2 $$

Where $\lambda \geq 0$ is the regularization strength. The closed-form analytical solution for Ridge is defined as:

$$ \theta = \left( X^T X + \lambda I' \right)^{-1} X^T y $$

where $I'$ is an $(n+1) \times (n+1)$ identity matrix with its top-left element set to 0, ensuring the intercept $\theta_0$ is not penalized. Adding $\lambda I'$ guarantees that the matrix is always invertible, resolving numerical issues caused by multicollinearity.

### 2. L1 Regularization: Lasso Regression
Lasso (Least Absolute Shrinkage and Selection Operator) regression adds a penalty proportional to the sum of the **absolute** values of the coefficients:

$$ J(\theta) = \frac{1}{2m} \sum_{i=1}^{m} \left( h_\theta(x^{(i)}) - y^{(i)} \right)^2 + \lambda \sum_{j=1}^{n} |\theta_j| $$

Because the absolute value penalty has a sharp vertex at zero (non-differentiable diamond geometry), optimization often drives parameters exactly to 0. This performs automatic feature selection, producing a sparse model. Because Lasso has no closed-form analytical solution due to the non-differentiable $L_1$ norm, we optimize it using **Coordinate Descent**.

## Implementation

The class below implements both Ridge (closed-form) and Lasso (Coordinate Descent) regularized regression from scratch in NumPy.

```python
import numpy as np
from typing import Tuple

class RegularizedLinearRegression:
    def __init__(self, regularization: str = "ridge", lmbda: float = 1.0, max_iters: int = 1000, tol: float = 1e-4) -> None:
        self.regularization: str = regularization.lower()
        self.lmbda: float = lmbda
        self.max_iters: int = max_iters
        self.tol: float = tol
        self.theta: np.ndarray = None

    def fit(self, X: np.ndarray, y: np.ndarray) -> 'RegularizedLinearRegression':
        if y.ndim == 1:
            y = y.reshape(-1, 1)
        m, n = X.shape

        if self.regularization == "ridge":
            # Append intercept column
            X_b = np.c_[np.ones((m, 1)), X]
            # Construct modified identity matrix where I[0,0] = 0 (do not penalize intercept)
            I_prime = np.identity(n + 1)
            I_prime[0, 0] = 0
            
            # Analytical Ridge solution: theta = (X^T * X + lambda * I')^-1 * X^T * y
            X_b_T = X_b.T
            self.theta = np.linalg.pinv(X_b_T.dot(X_b) + self.lmbda * I_prime).dot(X_b_T).dot(y)

        elif self.regularization == "lasso":
            # Coordinate Descent for Lasso optimization
            # Start by appending intercept to feature matrix
            X_b = np.c_[np.ones((m, 1)), X]
            self.theta = np.zeros((n + 1, 1))
            
            for _ in range(self.max_iters):
                theta_old = self.theta.copy()
                
                # Update each coordinate (parameter) sequentially
                for j in range(n + 1):
                    # Calculate predicted values without feature j
                    X_without_j = np.delete(X_b, j, axis=1)
                    theta_without_j = np.delete(self.theta, j, axis=0)
                    predictions_without_j = X_without_j.dot(theta_without_j)
                    
                    # Compute residual correlation
                    r_j = y - predictions_without_j
                    rho_j = X_b[:, j].dot(r_j)
                    
                    # Update parameter using Soft Thresholding Operator
                    if j == 0:
                        # Do not regularize the intercept term
                        self.theta[j] = rho_j / np.sum(X_b[:, j]**2)
                    else:
                        norm_xj = np.sum(X_b[:, j]**2)
                        # Soft thresholding logic
                        if rho_j < -self.lmbda:
                            self.theta[j] = (rho_j + self.lmbda) / norm_xj
                        elif rho_j > self.lmbda:
                            self.theta[j] = (rho_j - self.lmbda) / norm_xj
                        else:
                            self.theta[j] = 0.0
                            
                # Check for convergence
                if np.linalg.norm(self.theta - theta_old) < self.tol:
                    break
        else:
            raise ValueError("Supported regularizations: 'ridge' or 'lasso'.")
            
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        if self.theta is None:
            raise ValueError("Model has not been fitted yet.")
        m = X.shape[0]
        X_b = np.c_[np.ones((m, 1)), X]
        return X_b.dot(self.theta)

if __name__ == "__main__":
    # Generate synthetic multicollinear dataset with noise
    np.random.seed(42)
    X_train = np.random.randn(150, 5)
    # Feature 4 is highly collinear with Feature 0
    X_train[:, 4] = X_train[:, 0] * 0.99 + np.random.randn(150) * 0.01
    
    # True relationship relies only on features 0 and 1; features 2,3,4 are redundant
    true_theta = np.array([[3.0], [2.5], [1.8], [0.0], [0.0], [0.0]]) # [bias, f0, f1, f2, f3, f4]
    X_b_train = np.c_[np.ones((150, 1)), X_train]
    y_train = X_b_train.dot(true_theta) + np.random.randn(150, 1) * 0.2

    # Fit Ridge
    ridge = RegularizedLinearRegression(regularization="ridge", lmbda=5.0)
    ridge.fit(X_train, y_train)

    # Fit Lasso
    lasso = RegularizedLinearRegression(regularization="lasso", lmbda=5.0)
    lasso.fit(X_train, y_train)

    print("--- Regularization Results Comparison ---")
    print(f"True Weights (including bias):\n{true_theta.ravel()}")
    print(f"Ridge Coefficients:\n{ridge.theta.ravel()}")
    print(f"Lasso Coefficients (Note zeroed indices):\n{lasso.theta.ravel()}")
```

## System Constraints and Optimizations
Regularized systems require careful hyperparameter configuration:

1. **Hyperparameter Tuning ($\lambda$)**: The penalty coefficient $\lambda$ controls the model capacity. If $\lambda \to \infty$, the model underfits (coefficients shrink to zero). If $\lambda \to 0$, the model reverts to OLS regression, making it vulnerable to overfitting. Cross-validation (e.g., K-fold grid search) is required to determine the optimal $\lambda$.
2. **Computational overhead of Coordinate Descent**: Lasso's Coordinate Descent optimization updates parameters one feature at a time, resulting in $O(m \cdot n)$ complexity per epoch. This is slower than Ridge's single analytical matrix inversion step on datasets with moderate feature counts.

**Production Recommendation**: Always standardize features (z-score scale) before fitting regularized linear models, as features with larger scales will be penalized less. If the goal is pure feature selection and sparsity, choose **Lasso**. If features are highly correlated and maintaining all information is important, choose **Ridge**.
