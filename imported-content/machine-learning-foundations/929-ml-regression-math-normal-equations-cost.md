# ML Foundations: Linear Regression, Cost Functions, and Normal Equations

## The Problem
Predicting continuous target variables is a cornerstone of operational machine learning systems, appearing in workloads such as dynamic price optimization, power grid load forecasting, and network latency prediction. While high-capacity neural networks can map arbitrary non-linear topologies, deploying deep models for approximately linear tasks introduces unnecessary system complexity, high inference latency, and a significant risk of overfitting. 

Moreover, iterative optimization techniques like Gradient Descent require tuning hyper-parameters such as the learning rate ($\alpha$), choosing a batch size, and managing convergence criteria. For small to medium scale tabular datasets, these iterative steps are computationally inefficient and introduce operational overhead. The core challenge is: how do we derive and implement a mathematically rigorous, analytically exact, and non-iterative linear mapping between a feature space $X$ and a continuous target vector $y$?

## Technical Architecture

Linear regression models the target variable $y$ as a linear combination of input features $x$. The vectorized hypothesis function is defined as:

$$ h_\theta(x) = \theta_0 + \theta_1 x_1 + \theta_2 x_2 + \dots + \theta_n x_n = \theta^T x $$

Where $\theta \in \mathbb{R}^{n+1}$ is the parameter weight vector, including the bias/intercept term $\theta_0$, and $x_0 = 1$ is appended as a dummy feature to the feature vector.

### The Cost Function: Mean Squared Error (MSE)
To evaluate the parameter vector $\theta$, we define the Mean Squared Error (MSE) cost function $J(\theta)$, which measures the average squared distance between predictions and actual labels:

$$ J(\theta) = \frac{1}{2m} \sum_{i=1}^{m} \left( h_\theta(x^{(i)}) - y^{(i)} \right)^2 $$

In vectorized matrix notation, where $X \in \mathbb{R}^{m \times (n+1)}$ represents the design matrix and $y \in \mathbb{R}^m$ is the target vector:

$$ J(\theta) = \frac{1}{2m} (X\theta - y)^T (X\theta - y) $$

### Analytical Derivation of the Normal Equation
To minimize $J(\theta)$, we find the point where the gradient vector with respect to $\theta$ is zero. Using matrix calculus identities ($\frac{\partial (u^T v)}{\partial \theta} = \frac{\partial u^T}{\partial \theta} v + \frac{\partial v^T}{\partial \theta} u$ and $\frac{\partial (A\theta)^T}{\partial \theta} = A^T$):

$$ J(\theta) = \frac{1}{2m} \left( (X\theta)^T (X\theta) - (X\theta)^T y - y^T (X\theta) + y^T y \right) $$
$$ J(\theta) = \frac{1}{2m} \left( \theta^T X^T X \theta - 2\theta^T X^T y + y^T y \right) $$

Taking the derivative with respect to $\theta$:

$$ \nabla_\theta J(\theta) = \frac{1}{2m} \left( 2 X^T X \theta - 2 X^T y \right) = 0 $$
$$ X^T X \theta - X^T y = 0 \implies X^T X \theta = X^T y $$

If $X^T X$ is invertible, the closed-form analytical solution is:

$$ \theta = (X^T X)^{-1} X^T y $$

```text
+-------------------------+
|  Feature Matrix X (m,n) |
+-------------------------+
             |
             | Prepend Bias Column (x0=1)
             v
+-------------------------+
|  Design Matrix X_b      |  (m, n+1)
+-------------------------+
       |           |
       | Transpose | Matrix Mult
       |           v
       |     +------------+
       |     |  X_b^T     |
       v     +------------+
+-------------------------+
|     X_b^T * X_b         |  (n+1, n+1)
+-------------------------+
             |
             | Matrix Inversion / Pseudo-Inverse (O(n^3))
             v
+-------------------------+
|   (X_b^T * X_b)^-1      |  (n+1, n+1)
+-------------------------+
             |
             | Matrix Multiplication with (X_b^T * y)
             v
+-------------------------+
|    Optimal Parameter    |  theta = (X_b^T * X_b)^-1 * X_b^T * y
+-------------------------+
```

## Implementation

The following implementation uses the Moore-Penrose pseudo-inverse (`np.linalg.pinv`) based on Singular Value Decomposition (SVD). This guarantees numerical stability even when the matrix $X^T X$ is singular (non-invertible due to multicollinearity).

```python
import numpy as np
from typing import Tuple

class NormalEquationLinearRegression:
    def __init__(self) -> None:
        self.theta: np.ndarray = None

    def fit(self, X: np.ndarray, y: np.ndarray) -> 'NormalEquationLinearRegression':
        """
        Fits the linear regression model using the closed-form Normal Equation.
        
        Args:
            X: Input feature matrix of shape (m, n).
            y: Target vector of shape (m, 1) or (m,).
        """
        if y.ndim == 1:
            y = y.reshape(-1, 1)
        
        m: int = X.shape[0]
        # Prepend column of ones for the intercept term (bias)
        X_b: np.ndarray = np.c_[np.ones((m, 1)), X]
        
        # Computing the pseudo-inverse via SVD: O(n^3) complexity
        # self.theta = (X_b^T * X_b)^+ * X_b^T * y
        X_b_T: np.ndarray = X_b.T
        self.theta = np.linalg.pinv(X_b_T.dot(X_b)).dot(X_b_T).dot(y)
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Generates predictions for the given input.
        """
        if self.theta is None:
            raise ValueError("Model has not been fitted yet.")
        m: int = X.shape[0]
        X_b: np.ndarray = np.c_[np.ones((m, 1)), X]
        return X_b.dot(self.theta)

    def compute_cost(self, X: np.ndarray, y: np.ndarray) -> float:
        """
        Computes the Mean Squared Error (MSE) cost function.
        """
        if y.ndim == 1:
            y = y.reshape(-1, 1)
        m: int = X.shape[0]
        predictions = self.predict(X)
        errors = predictions - y
        return (1.0 / (2.0 * m)) * np.sum(errors ** 2)

if __name__ == "__main__":
    # Generate synthetic noisy linear data
    np.random.seed(42)
    X_train = 3 * np.random.rand(150, 3) # 150 samples, 3 features
    true_theta = np.array([[5.5], [2.1], [-1.2], [4.3]]) # [intercept, coef1, coef2, coef3]
    
    # y = X_b * true_theta + noise
    X_b_train = np.c_[np.ones((150, 1)), X_train]
    y_train = X_b_train.dot(true_theta) + np.random.randn(150, 1) * 0.1
    
    # Fit the model
    model = NormalEquationLinearRegression()
    model.fit(X_train, y_train)
    
    print("Derived weights:\n", model.theta)
    print("True weights:\n", true_theta)
    print(f"Final Train Cost (MSE): {model.compute_cost(X_train, y_train):.6f}")
```

## System Constraints and Optimizations
While the Normal Equation is mathematically elegant and requires zero hyperparameter tuning, it introduces distinct engineering tradeoffs:

1. **Inversion Complexity**: Computing $(X^T X)^{-1}$ has a computational complexity of $O(n^3)$ (or $O(n^{2.807})$ using Strassen's algorithm). If the feature dimension $n$ exceeds 15,000, standard CPU execution becomes extremely slow and can run out of memory.
2. **Out-of-Core Limits**: Standard execution loads the entire design matrix $X$ into RAM. When data size exceeds physical memory, standard analytical calculation fails.
3. **Sparse Datasets**: In cases with massive sparse feature spaces (e.g., text processing with TF-IDF), matrix inversion ruins the sparsity, converting the matrix to a dense structure and drastically inflating memory consumption.

**Production Recommendation**: Use the Normal Equation for dense datasets with fewer than 10,000 features. For larger feature spaces or out-of-core streaming pipelines, opt for Batch/Mini-batch Gradient Descent or coordinate descent algorithms.
