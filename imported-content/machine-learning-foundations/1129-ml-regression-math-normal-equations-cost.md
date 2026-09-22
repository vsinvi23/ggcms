# ML Foundations: Linear Regression, Cost Functions, and Normal Equations

## The Problem
Predicting continuous numerical values from input features relies on defining an optimal linear relationship. Iterative optimization (like Gradient Descent) works well but requires careful tuning of hyperparameters such as learning rate. For smaller datasets, iterative methods are computationally redundant when an exact, closed-form analytical solution exists. The challenge is calculating the exact weight parameters that minimize the prediction error without relying on iterative approximation.

## Architectural Approach
Linear regression models the target variable $y$ as a linear combination of input features $X$. The objective is to minimize the Mean Squared Error (MSE) cost function, $J(\theta)$.

### Cost Function (Mean Squared Error)
$$ J(\theta) = \frac{1}{2m} \sum_{i=1}^{m} (h_\theta(x^{(i)}) - y^{(i)})^2 $$
Where $h_\theta(x) = X\theta$.

To find the absolute minimum of this convex cost function, we set its partial derivatives with respect to the weights $\theta$ to zero. This yields the **Normal Equation**:
$$ \theta = (X^T X)^{-1} X^T y $$

```text
    +-----------+       +-----------+       +-------------------+
    | Input (X) | ----> | Transpose | ----> |   Multiply X^T X  |
    +-----------+       +-----------+       +---------+---------+
                                                      |
                                                      v
                                            +-------------------+
                                            | Inverse (X^T X)^-1|
                                            +---------+---------+
                                                      |
                                                      v
    +-----------+                           +-------------------+
    | Target (y)| ------------------------> | Multiply by X^T y |
    +-----------+                           +---------+---------+
                                                      |
                                                      v
                                            +-------------------+
                                            | Optimal Weights θ |
                                            +-------------------+
```

## Implementation

The following Python implementation demonstrates calculating linear regression weights using the exact analytical Normal Equation approach rather than gradient descent.

```python
import numpy as np

class NormalEquationLinearRegression:
    def __init__(self):
        self.theta = None

    def fit(self, X, y):
        """
        Calculates optimal weights using the Normal Equation: θ = (X^T * X)^(-1) * X^T * y
        """
        # Add a column of ones to X to account for the intercept term (bias)
        m = X.shape[0]
        X_b = np.c_[np.ones((m, 1)), X]
        
        # Calculate theta using the closed-form Normal Equation
        # np.linalg.inv computes the multiplicative inverse of a matrix
        self.theta = np.linalg.inv(X_b.T.dot(X_b)).dot(X_b.T).dot(y)
        
        return self

    def predict(self, X):
        """
        Predicts output using the computed optimal weights.
        """
        if self.theta is None:
            raise ValueError("Model must be fitted before calling predict.")
            
        m = X.shape[0]
        X_b = np.c_[np.ones((m, 1)), X]
        return X_b.dot(self.theta)

    def get_mse(self, X, y):
        """
        Calculates the Mean Squared Error cost function.
        """
        predictions = self.predict(X)
        mse = np.mean((predictions - y) ** 2)
        return mse

# -------------------------
# Usage Example
# -------------------------
if __name__ == "__main__":
    # Generate synthetic linear data: y = 4 + 3x + Gaussian Noise
    np.random.seed(42)
    X = 2 * np.random.rand(100, 1)
    y = 4 + 3 * X + np.random.randn(100, 1)

    model = NormalEquationLinearRegression()
    model.fit(X, y)

    print(f"Calculated Intercept (Bias): {model.theta[0][0]:.4f}")
    print(f"Calculated Coefficient: {model.theta[1][0]:.4f}")
    print(f"Cost (MSE): {model.get_mse(X, y):.4f}")
```

## Trade-offs and Considerations
1. **Computational Complexity**: The operation $(X^T X)^{-1}$ requires inverting a matrix of dimension $n \times n$ (where $n$ is the number of features). Matrix inversion has a complexity of roughly $O(n^3)$. This approach is extremely efficient for datasets with $n < 10,000$ but becomes computationally prohibitive for highly dimensional data.
2. **Non-invertibility**: If $X^T X$ is singular (non-invertible), the normal equation fails. This occurs when features are perfectly collinear (redundant) or when $m < n$ (more features than data points). In such cases, one must use the pseudoinverse (SVD) or apply regularization (Ridge regression).
3. **No Hyperparameters**: Unlike Gradient Descent, the Normal Equation requires no learning rate ($\alpha$) tuning and no iteration limits, ensuring an exact global minimum in a single calculation step.
