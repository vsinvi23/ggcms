# ML Foundations: Linear Regression, Cost Functions, and Normal Equations

## The Problem
In modern predictive analytics, forecasting continuous variables—such as server latency, dynamic cloud compute pricing, or real-time customer lifetime value—is critical. When handling small-to-medium scale tabular data, engineering teams often default to training heavy deep learning models or utilizing iterative optimization frameworks like Gradient Descent. However, iterative approaches require fine-tuning hyperparameters (e.g., learning rate $\alpha$, batch size, learning rate decay) and demand expensive computational loops to reach convergence.

When the relation between feature space $X$ and target $y$ is approximately linear, iterative parameter updates are mathematically inefficient. The core challenge lies in analytically deriving and implementing a non-iterative, exact closed-form solution that directly calculates the optimal model parameter weights while ensuring computational efficiency and numerical stability under potential multicollinearity.

## Technical Architecture

Linear regression models the target variable $y$ as a linear combination of input features $x$. For an input feature vector $x \in \mathbb{R}^n$, the vectorized hypothesis function is defined as:

$$ h_\theta(x) = \theta_0 + \theta_1 x_1 + \theta_2 x_2 + \dots + \theta_n x_n = \theta^T x $$

Here, $\theta \in \mathbb{R}^{n+1}$ represents the parameter weight vector, where $\theta_0$ is the bias (intercept) term, and we prepend a constant dummy feature $x_0 = 1$ to the input space.

### The Mean Squared Error (MSE) Cost Function
To optimize the parameter vector $\theta$, we minimize the Mean Squared Error (MSE) cost function $J(\theta)$, which measures the average squared variance between predictions and target labels:

$$ J(\theta) = \frac{1}{2m} \sum_{i=1}^{m} \left( h_\theta(x^{(i)}) - y^{(i)} \right)^2 $$

By stacking all $m$ training samples, we formulate the Design Matrix $X \in \mathbb{R}^{m \times (n+1)}$ and the target vector $y \in \mathbb{R}^m$. The vectorized form of the cost function is:

$$ J(\theta) = \frac{1}{2m} (X\theta - y)^T (X\theta - y) $$

### Analytical Derivation of the Normal Equation
To find the global minimum, we compute the gradient of $J(\theta)$ with respect to $\theta$ and equate it to zero:

$$ J(\theta) = \frac{1}{2m} \left( (X\theta)^T (X\theta) - (X\theta)^T y - y^T (X\theta) + y^T y \right) $$
$$ J(\theta) = \frac{1}{2m} \left( \theta^T X^T X \theta - 2\theta^T X^T y + y^T y \right) $$

Taking the partial derivative with respect to $\theta$:

$$ \nabla_\theta J(\theta) = \frac{1}{2m} \left( 2 X^T X \theta - 2 X^T y \right) = 0 $$
$$ X^T X \theta - X^T y = 0 \implies X^T X \theta = X^T y $$

Solving for $\theta$ yields the **Normal Equation**:

$$ \theta = (X^T X)^{-1} X^T y $$

```text
+------------------------------+
| Raw Input Feature Matrix (m,n)|
+------------------------------+
               |
               | Append x0 = 1 (Column of Ones)
               v
+------------------------------+
| Design Matrix X_b (m, n+1)   |
+------------------------------+
        |              |
        | Transpose    | Matrix Mult
        v              v
+---------------+  +------------+
|  X_b^T        |  |     y      |
+---------------+  +------------+
        \              /
         \            /  Matrix Mult (X_b^T * X_b)
          v          v
+------------------------------+
|     (X_b^T * X_b)            | (n+1, n+1)
+------------------------------+
               |
               | Moore-Penrose Pseudo-Inverse (pinv)
               v
+------------------------------+
|     (X_b^T * X_b)^+          | (n+1, n+1)
+------------------------------+
               |
               | Multiply with (X_b^T * y)
               v
+------------------------------+
|  Optimal Parameter Vector    | theta = (X_b^T * X_b)^+ * X_b^T * y
+------------------------------+
```

## Implementation

The following Python class implements linear regression using the Normal Equation. To prevent issues with singular (non-invertible) matrices resulting from perfect multicollinearity, the implementation leverages the Moore-Penrose pseudo-inverse (`np.linalg.pinv`), which utilizes Singular Value Decomposition (SVD).

```python
import numpy as np
from typing import Tuple

class NormalEquationRegression:
    """
    Linear Regression model solved analytically via the Normal Equation.
    """
    def __init__(self) -> None:
        self.theta: np.ndarray = None

    def fit(self, X: np.ndarray, y: np.ndarray) -> 'NormalEquationRegression':
        """
        Fits the model weights using the analytical solution: theta = (X^T * X)^+ * X^T * y
        
        Args:
            X: Independent variables, shape (m, n).
            y: Dependent continuous target, shape (m, 1) or (m,).
        """
        # Ensure y is a 2D column vector
        if y.ndim == 1:
            y = y.reshape(-1, 1)
            
        m, n = X.shape
        # Prepend a column of ones to represent x0 = 1 for bias
        X_b = np.c_[np.ones((m, 1)), X]
        
        # Calculate optimal theta using Moore-Penrose pseudo-inverse
        # This resolves the singularity issue (det(X^T * X) = 0)
        X_b_T = X_b.T
        self.theta = np.linalg.pinv(X_b_T.dot(X_b)).dot(X_b_T).dot(y)
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Predicts continuous targets using the derived weight vector.
        """
        if self.theta is None:
            raise ValueError("Model is not fitted yet. Call fit first.")
        m = X.shape[0]
        X_b = np.c_[np.ones((m, 1)), X]
        return X_b.dot(self.theta)

    def compute_cost(self, X: np.ndarray, y: np.ndarray) -> float:
        """
        Computes the Mean Squared Error (MSE) cost function.
        """
        if y.ndim == 1:
            y = y.reshape(-1, 1)
        m = X.shape[0]
        predictions = self.predict(X)
        squared_errors = (predictions - y) ** 2
        return (1.0 / (2.0 * m)) * np.sum(squared_errors)

if __name__ == "__main__":
    # Generate noisy linear datasets for validation
    np.random.seed(42)
    X_train = 2.5 * np.random.rand(100, 3) # 100 samples, 3 features
    true_weights = np.array([[4.2], [1.5], [-2.3], [0.8]]) # [bias, w1, w2, w3]
    
    # y = X_b * theta + gaussian_noise
    X_b_train = np.c_[np.ones((100, 1)), X_train]
    y_train = X_b_train.dot(true_weights) + np.random.randn(100, 1) * 0.15
    
    # Initialize and execute Normal Equation solver
    reg_model = NormalEquationRegression()
    reg_model.fit(X_train, y_train)
    
    print("--- Normal Equation Fit Results ---")
    print("Estimated Theta Vector:\n", reg_model.theta)
    print("True Theta Vector:\n", true_weights)
    print(f"Final Train MSE Cost: {reg_model.compute_cost(X_train, y_train):.6f}")
```

## System Constraints and Optimizations

While mathematically elegant, the Normal Equation introduces crucial production constraints that system architects must consider:

1. **Computational Complexity**: The core computational bottleneck is the matrix inversion of $(X^T X)$, which has an algorithmic complexity of approximately $O(n^3)$ (or $O(n^{2.807})$ with Strassen's algorithm). When the feature space $n$ exceeds 10,000 to 15,000, calculating the inverse becomes extremely slow.
2. **Memory Footprint**: Calculating $(X^T X)$ requires loading the entire $m \times n$ matrix into memory. This out-of-core memory limit makes it unsuitable for large-scale streaming data or datasets exceeding system RAM.
3. **Sparsity Destruction**: If the design matrix $X$ is sparse (such as text data encoded via TF-IDF or large-scale categoricals after one-hot encoding), computing $X^T X$ destroys this sparsity, producing a dense matrix of shape $(n \times n)$ and leading to out-of-memory crashes.

**Production Recommendation**: Use the Normal Equation for dense datasets where the number of features $n < 10,000$. For datasets where $n \geq 10,000$ or for out-of-core pipelines, bypass analytical inversion and use iterative Stochastic Gradient Descent (SGD) or coordinate descent.
