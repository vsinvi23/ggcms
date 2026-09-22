# ML Foundations: Linear Regression, Cost Functions, and Normal Equations

## The Problem
Predicting continuous numerical outcomes—such as pricing models, temperature forecasts, or risk assessments—requires a fundamental mapping between input features and target variables. While modern Deep Learning handles complex non-linearities, deploying a neural network for a linearly separable problem introduces unnecessary computational overhead and loss of interpretability. The foundational challenge is constructing a highly interpretable, analytically verifiable model that maps continuous inputs to a continuous output while strictly minimizing the sum of prediction errors.

## Technical Architecture

Linear Regression models the relationship between dependent variable $y$ and one or more independent variables $X$ using a linear mapping function. The hypothesis function is defined as:

$$ h_\theta(x) = \theta_0 + \theta_1 x_1 + \theta_2 x_2 + \dots + \theta_n x_n = \theta^T x $$

Where $\theta$ represents the parameter weights (including the bias term $\theta_0$).

### Cost Function (Mean Squared Error)
To measure how well the hypothesis fits the data, we utilize the Mean Squared Error (MSE) cost function:

$$ J(\theta) = \frac{1}{2m} \sum_{i=1}^{m} (h_\theta(x^{(i)}) - y^{(i)})^2 $$

The objective is to find $\theta$ that minimizes $J(\theta)$. 

### The Normal Equation
While Gradient Descent iteratively updates parameters to find the minimum of the cost function, the Normal Equation provides an analytical solution to find the optimal $\theta$ in a single step by setting the partial derivatives of $J(\theta)$ to zero.

$$ \theta = (X^T X)^{-1} X^T y $$

```text
+----------------+       +-------------------+       +-----------------------+
|                |       |                   |       |                       |
| Feature Matrix |       | Transpose & Mult. |       | Matrix Inversion      |
| X (m x n)      | ----> | X^T * X           | ----> | (X^T * X)^-1          |
|                |       |                   |       |                       |
+----------------+       +-------------------+       +-----------------------+
                                                               |
                                                               v
+----------------+       +-------------------+       +-----------------------+
|                |       |                   |       |                       |
| Target Vector  | ----> | X^T * y           | ----> | Dot Product           |
| y (m x 1)      |       |                   |       | Optimal Theta         |
|                |       +-------------------+       +-----------------------+
+----------------+
```

## Implementation

The analytical solution avoids hyperparameters like learning rate but requires computing the inverse of $X^T X$, which has a time complexity of $O(n^3)$. This makes it optimal for datasets where $n$ (features) is relatively small (typically $n < 10,000$).

```python
import numpy as np

class NormalEquationLinearRegression:
    def __init__(self):
        self.theta = None

    def fit(self, X: np.ndarray, y: np.ndarray) -> None:
        """
        Fits the linear regression model using the Normal Equation.
        X: shape (m, n)
        y: shape (m, 1)
        """
        # Add intercept term (column of 1s) to X
        m = X.shape[0]
        X_b = np.c_[np.ones((m, 1)), X]
        
        # Calculate optimal theta: (X^T * X)^-1 * X^T * y
        # Using np.linalg.pinv (pseudo-inverse) for numerical stability
        # in cases where X^T X is non-invertible (singular)
        self.theta = np.linalg.pinv(X_b.T.dot(X_b)).dot(X_b.T).dot(y)

    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Predicts target values.
        """
        m = X.shape[0]
        X_b = np.c_[np.ones((m, 1)), X]
        return X_b.dot(self.theta)

# Example Usage
if __name__ == "__main__":
    # Generate synthetic linear data
    np.random.seed(42)
    X = 2 * np.random.rand(100, 1)
    y = 4 + 3 * X + np.random.randn(100, 1)

    model = NormalEquationLinearRegression()
    model.fit(X, y)
    
    print(f"Intercept (theta_0): {model.theta[0][0]:.4f} (Expected: ~4)")
    print(f"Slope (theta_1): {model.theta[1][0]:.4f} (Expected: ~3)")
    
    # Prediction
    X_new = np.array([[0], [2]])
    y_predict = model.predict(X_new)
    print("Predictions for x=0 and x=2:\n", y_predict)
```

## System Constraints and Optimizations
When scaling this approach, the limiting factor is memory and matrix inversion time. If $X$ is massive, computing $X^T X$ and its inverse leads to out-of-memory exceptions. In production systems handling wide datasets, switch to vectorized Gradient Descent (e.g., using Stochastic or Mini-batch approaches) or leverage distributed computing frameworks like Spark MLlib that approximate the analytical solution via iterative linear solvers (e.g., Conjugate Gradient).
