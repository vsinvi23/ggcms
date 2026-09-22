# ML Foundations: Linear Regression, Cost Functions, and Normal Equations

## The Problem
Predicting a continuous target variable from high-dimensional inputs is a ubiquitous task in production systems—ranging from dynamic pricing engines to resource utilization forecasting. While modern deep learning models can approximate arbitrary non-linear functions, they often act as "black boxes" requiring massive datasets, extensive hyperparameter tuning, and high computational budgets. For problems where the underlying relationship is approximately linear, deploying a neural network introduces severe risks of overfitting, loss of interpretability, and latency overhead. 

The core challenge is to construct a mathematically rigorous, analytically verifiable, and highly explainable linear mapping between a feature matrix $X$ and a target vector $y$ that minimizes prediction errors without relying on heuristic iterative tuning.

## Technical Architecture

Linear regression models the target variable $y$ as a linear combination of input features $x$. The hypothesis function $h_\theta(x)$ is defined as:

$$ h_\theta(x) = \theta_0 + \theta_1 x_1 + \theta_2 x_2 + \dots + \theta_n x_n = \theta^T x $$

Where $\theta \in \mathbb{R}^{n+1}$ represents the weight vector (including the bias/intercept term $\theta_0$), and $x_0 = 1$ is added as a dummy feature to every instance.

### The Cost Function: Mean Squared Error (MSE)
To evaluate the parameter vector $\theta$, we define the Mean Squared Error (MSE) cost function $J(\theta)$, which measures the average squared distance between predicted values and actual targets:

$$ J(\theta) = \frac{1}{2m} \sum_{i=1}^{m} \left( h_\theta(x^{(i)}) - y^{(i)} \right)^2 $$

In vectorized matrix notation, where $X \in \mathbb{R}^{m \times (n+1)}$ is the feature matrix and $y \in \mathbb{R}^m$ is the target vector:

$$ J(\theta) = \frac{1}{2m} (X\theta - y)^T (X\theta - y) $$

### The Analytical Solution: Normal Equation
To find the global minimum of the convex function $J(\theta)$ without iterating, we take the partial derivatives with respect to $\theta$ and set them to zero:

$$ \nabla_\theta J(\theta) = \frac{1}{m} X^T (X\theta - y) = 0 $$

$$ X^T X \theta - X^T y = 0 \implies X^T X \theta = X^T y $$

If the matrix $X^T X$ is invertible (non-singular), the closed-form analytical solution is:

$$ \theta = (X^T X)^{-1} X^T y $$

```text
+-----------------------+
|  Feature Matrix X     |
|     Size: (m x n)     |
+-----------------------+
            |
            | (Prepend Column of 1s for Bias)
            v
+-----------------------+
|  Design Matrix X_b    |
|   Size: (m x n+1)     |
+-----------------------+
       |         |
       | Transpose (X_b^T)
       |         v
       |   +-----------+
       |   |  X_b^T    |
       |   +-----------+
       |         |
       |         | Matrix Multiplication
       v         v
+-----------------------+       +-------------------+       +-----------------------+
|     X_b^T * X_b       | ----> |  Matrix Inversion | ----> |   (X_b^T * X_b)^-1    |
|   Size: (n+1 x n+1)   |       |   (O(n^3) cost)   |       |   Size: (n+1 x n+1)   |
+-----------------------+       +-------------------+       +-----------------------+
                                                                        |
                                                                        | Matrix Multiplication
                                                                        v
+-----------------------+       +-------------------+       +-----------------------+
|   Target Vector y     | ----> |    X_b^T * y      | ----> |     Optimal Theta     |
|     Size: (m x 1)     |       |   Size: (n+1 x 1) |       |  (X_b^T*X_b)^-1*X_b^T*y|
+-----------------------+       +-------------------+       +-----------------------+
```

## Implementation

The following production-ready implementation avoids relying on gradient hyperparameters. It uses the Moore-Penrose pseudo-inverse via Singular Value Decomposition (SVD) to guarantee stability even when $X^T X$ is singular (non-invertible).

```python
import numpy as np
from typing import Tuple

class NormalEquationLinearRegression:
    def __init__(self) -> None:
        self.theta: np.ndarray = None

    def fit(self, X: np.ndarray, y: np.ndarray) -> 'NormalEquationLinearRegression':
        """
        Fits the linear model using the closed-form Normal Equation.
        
        Args:
            X: np.ndarray of shape (m, n) representing the input features.
            y: np.ndarray of shape (m, 1) or (m,) representing targets.
            
        Returns:
            self: The fitted estimator.
        """
        if y.ndim == 1:
            y = y.reshape(-1, 1)
            
        m: int = X.shape[0]
        # Append intercept term (column of ones)
        X_b: np.ndarray = np.c_[np.ones((m, 1)), X]
        
        # Compute (X_b^T * X_b)^+ * X_b^T * y
        # We use pinv (pseudo-inverse) which leverages SVD: O(n^3)
        # This provides robust numerical stability over np.linalg.inv.
        X_b_transpose: np.ndarray = X_b.T
        self.theta = np.linalg.pinv(X_b_transpose.dot(X_b)).dot(X_b_transpose).dot(y)
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Predicts continuous values using the calculated optimal theta.
        
        Args:
            X: np.ndarray of shape (m, n)
            
        Returns:
            np.ndarray of shape (m, 1) with predictions.
        """
        if self.theta is None:
            raise ValueError("Model has not been fitted yet.")
            
        m: int = X.shape[0]
        X_b: np.ndarray = np.c_[np.ones((m, 1)), X]
        return X_b.dot(self.theta)

    def calculate_cost(self, X: np.ndarray, y: np.ndarray) -> float:
        """
        Computes the Mean Squared Error (MSE) cost.
        """
        if y.ndim == 1:
            y = y.reshape(-1, 1)
        m: int = X.shape[0]
        predictions: np.ndarray = self.predict(X)
        errors: np.ndarray = predictions - y
        cost: float = (1.0 / (2.0 * m)) * np.sum(errors ** 2)
        return cost

if __name__ == "__main__":
    # Generate noisy linear synthetic data
    np.random.seed(42)
    X_train = 2 * np.random.rand(100, 2)  # 2 features
    # True relationship: y = 4 + 3*x1 + 1.5*x2 + noise
    true_theta = np.array([[4.0], [3.0], [1.5]])
    noise = np.random.randn(100, 1) * 0.1
    y_train = np.c_[np.ones((100, 1)), X_train].dot(true_theta) + noise

    # Model instantiation and fitting
    model = NormalEquationLinearRegression()
    model.fit(X_train, y_train)

    print("--- Normal Equation Fit Results ---")
    print(f"Calculated Parameters:\n{model.theta}")
    print(f"True Parameters:\n{true_theta}")
    
    # Evaluate MSE Cost
    train_cost = model.calculate_cost(X_train, y_train)
    print(f"Mean Squared Error (MSE) Cost: {train_cost:.6f}")

    # Out-of-sample prediction
    X_test = np.array([[1.0, 2.0], [0.5, 0.5]])
    predictions = model.predict(X_test)
    print(f"Predictions for test points:\n{predictions}")
```

## System Constraints and Optimizations
While the Normal Equation provides an elegant global analytical minimum without the need to select a learning rate $\alpha$ or run multiple iterative training steps, it has severe scalability constraints:

1. **Computational Complexity**: Computing $(X^T X)^{-1}$ requires inverting an $(n+1) \times (n+1)$ matrix. This operation has a computational complexity between $O(n^{2.373})$ and $O(n^3)$ depending on the matrix inversion algorithm. If the number of features $n$ exceeds 10,000 to 50,000, calculating the analytical solution becomes incredibly slow and memory-intensive.
2. **Memory Constraints**: Standard matrix operations load the entire dataset into RAM. When dealing with out-of-core datasets (e.g., terabytes of logs), the Normal Equation cannot scale.
3. **Multicollinearity**: If some features are highly correlated (e.g., redundant columns), $X^T X$ becomes singular (not invertible). Utilizing the pseudo-inverse (`np.linalg.pinv`) mitigates the failure but does not solve the variance inflation problem in computed weights.

**Production Recommendation**: Use the Normal Equation for small-to-medium-sized datasets ($n < 10,000$) where model interpretability and mathematical exactness are critical. For large-scale data, implement Batch/Mini-batch Gradient Descent or coordinate descent optimization (e.g., elastic net).
