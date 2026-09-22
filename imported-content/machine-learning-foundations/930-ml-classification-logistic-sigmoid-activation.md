# ML Foundations: Logistic Regression and the Sigmoid Activation Function

## The Problem
In enterprise applications, binary classification is an essential capability—enabling use cases like real-time transaction fraud detection, email spam filtering, and server failure prediction. A naive approach is to apply Ordinary Least Squares (OLS) linear regression and threshold the predictions. However, linear regression is highly sensitive to outliers, and its predicted values $h_\theta(x) = \theta^T x$ map to $(-\infty, \infty)$ rather than a probability range $[0, 1]$. This makes the outputs uncalibrated and mathematically invalid as probability estimates. 

Furthermore, applying OLS regression to binary labels violates assumptions of homoscedasticity, producing non-normal error distributions. We need a robust model that maps input features to calibrated probabilities, optimization objectives derived from likelihood estimation, and a stable decision mechanism.

## Technical Architecture

Logistic Regression solves this problem by applying a non-linear activation function—the **Sigmoid** (or Logistic) function—to a linear combination of input features. This projects the continuous output of a linear model directly into a probability space.

### The Sigmoid Activation Function
The sigmoid activation function $\sigma(z)$ is defined mathematically as:

$$ \sigma(z) = \frac{1}{1 + e^{-z}} $$

Its derivative is highly efficient to compute, which is a major advantage during backpropagation:

$$ \frac{d\sigma(z)}{dz} = \sigma(z)(1 - \sigma(z)) $$

```text
       1.0 +                      ******************
           |                 *****
           |               **
Prob y=1   |             **
           |            *
       0.5 +-----------*----------- (Decision Boundary: z=0)
           |          *
           |        **
           |      **
           |   ***
       0.0 +***--------------------+
          -6          0            6
                       z = theta^T * x
```

### The Logistic Hypothesis
Our model hypothesis $h_\theta(x)$ is the probability that the output is 1 given input $x$, parameterized by $\theta$:

$$ h_\theta(x) = P(y=1 | x; \theta) = \sigma(\theta^T x) = \frac{1}{1 + e^{-\theta^T x}} $$

### Loss Function: Cross-Entropy (Log Loss)
Instead of Mean Squared Error, which is non-convex when combined with the sigmoid activation, we define the **Cross-Entropy Loss** (derived via Maximum Likelihood Estimation):

$$ J(\theta) = -\frac{1}{m} \sum_{i=1}^{m} \left[ y^{(i)} \log\left(h_\theta(x^{(i)})\right) + (1 - y^{(i)}) \log\left(1 - h_\theta(x^{(i)})\right) \right] $$

In vectorized matrix form:

$$ J(\theta) = -\frac{1}{m} \left( y^T \log(H) + (1 - y)^T \log(1 - H) \right) $$

where $H = \sigma(X\theta) \in \mathbb{R}^m$.

### Gradient descent update
To minimize $J(\theta)$, we iteratively update parameters using the gradient of $J(\theta)$ with respect to $\theta$:

$$ \nabla_\theta J(\theta) = \frac{1}{m} X^T \left( \sigma(X\theta) - y \right) $$

The parameters are updated as: $\theta \leftarrow \theta - \alpha \nabla_\theta J(\theta)$, where $\alpha$ is the learning rate.

```text
  Inputs (X)        Weights (theta)        Linear Logits (z)     Sigmoid Activation     Output P(y=1|X)
+------------+     +---------------+     +--------------------+   +-------------------+   +---------------+
| x0 = 1     | --> | theta_0       | --> |                    |   |                   |   |               |
| x1         | --> | theta_1       | --> | z = Sum(theta_i*xi)| ->|  1 / (1 + e^-z)   | ->| h_theta(X)    |
| ...        |     | ...           | --> |                    |   |                   |   |               |
| xn         | --> | theta_n       | --> |                    |   |                   |   |               |
+------------+     +---------------+     +--------------------+   +-------------------+   +---------------+
                                                                                                  |
                                                                                    Threshold > 0.5?
                                                                                                  |
                                                                                                  v
                                                                                           Class Prediction
                                                                                            {0, 1}
```

## Implementation

The production-ready Python class below implements vectorized Logistic Regression with Gradient Descent optimization. It includes numerical stabilization (clipping) to prevent $\log(0)$ calculation failures during cost evaluation.

```python
import numpy as np
from typing import Tuple

class LogisticRegressionSigmoid:
    def __init__(self, learning_rate: float = 0.1, n_iterations: int = 1000) -> None:
        self.learning_rate: float = learning_rate
        self.n_iterations: int = n_iterations
        self.theta: np.ndarray = None

    def _sigmoid(self, z: np.ndarray) -> np.ndarray:
        """
        Computes sigmoid function in a numerically stable manner.
        """
        # Clip z to avoid overflow in exp
        z_clipped = np.clip(z, -500, 500)
        return 1.0 / (1.0 + np.exp(-z_clipped))

    def fit(self, X: np.ndarray, y: np.ndarray) -> 'LogisticRegressionSigmoid':
        """
        Fits the logistic regression parameters using gradient descent.
        """
        if y.ndim == 1:
            y = y.reshape(-1, 1)

        m, n = X.shape
        # Add intercept column
        X_b = np.c_[np.ones((m, 1)), X]
        
        # Initialize weights with small random values
        self.theta = np.zeros((n + 1, 1))

        for _ in range(self.n_iterations):
            # Forward pass: calculate logits and predictions
            logits = X_b.dot(self.theta)
            predictions = self._sigmoid(logits)
            
            # Backward pass: compute gradient
            error = predictions - y
            gradient = (1.0 / m) * X_b.T.dot(error)
            
            # Parameter update
            self.theta -= self.learning_rate * gradient
            
        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """
        Predicts class probabilities P(y=1 | X).
        """
        if self.theta is None:
            raise ValueError("Model has not been fitted yet.")
        m = X.shape[0]
        X_b = np.c_[np.ones((m, 1)), X]
        return self._sigmoid(X_b.dot(self.theta))

    def predict(self, X: np.ndarray, threshold: float = 0.5) -> np.ndarray:
        """
        Predicts class labels {0, 1} based on a decision threshold.
        """
        probs = self.predict_proba(X)
        return (probs >= threshold).astype(int)

    def compute_cost(self, X: np.ndarray, y: np.ndarray) -> float:
        """
        Computes the binary cross-entropy (log-loss) cost.
        """
        if y.ndim == 1:
            y = y.reshape(-1, 1)
        m = X.shape[0]
        probs = self.predict_proba(X)
        
        # Clip probabilities to avoid log(0) numeric instabilities
        probs_clipped = np.clip(probs, 1e-15, 1 - 1e-15)
        
        cost = - (1.0 / m) * np.sum(y * np.log(probs_clipped) + (1.0 - y) * np.log(1.0 - probs_clipped))
        return float(cost)

if __name__ == "__main__":
    # Generate mock classification dataset (linearly separable with some noise)
    np.random.seed(42)
    X_train = np.random.randn(200, 2)
    # True boundary: x1 + 2*x2 - 0.5 > 0
    y_train = ( (X_train[:, 0] + 2 * X_train[:, 1] - 0.5) > 0 ).astype(int).reshape(-1, 1)

    model = LogisticRegressionSigmoid(learning_rate=0.2, n_iterations=1500)
    model.fit(X_train, y_train)

    print("--- Logistic Regression Fit Results ---")
    print(f"Learned Weights (Intercept first):\n{model.theta}")
    print(f"Log Loss Cost on Training Set: {model.compute_cost(X_train, y_train):.6f}")

    # Out of sample inference
    X_test = np.array([[1.0, 1.0], [-1.0, -1.0]])
    print(f"Test Class Probabilities:\n{model.predict_proba(X_test)}")
    print(f"Test Predictions:\n{model.predict(X_test)}")
```

## System Constraints and Optimizations
Despite its widespread adoption, Logistic Regression possesses structural limitations:

1. **Linear Decision Boundary**: By default, the decision boundary is linear ($\theta^T x = 0$). For complex distributions (e.g., concentric circles), logistic regression fails unless manual non-linear polynomial features or kernel representations are added.
2. **Feature Scaling Sensitivity**: Gradient Descent convergence rates depend strongly on feature scaling. Features with wildly differing magnitudes generate skewed error contours, causing the optimization path to oscillate.
3. **Sigmoid Saturation (Vanishing Gradients)**: If logits $z = \theta^T x$ have very high or low values, the sigmoid derivative values shrink toward zero. This causes vanishing gradients, halting learning progress.

**Production Recommendation**: Standardize input features using z-score scaling before fitting to guarantee rapid optimization. Utilize L2 (Ridge) or L1 (Lasso) regularization to combat parameter inflation in high-dimensional settings.
