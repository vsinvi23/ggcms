# ML Foundations: Logistic Regression and the Sigmoid Activation Function

## The Problem
Binary classification is a fundamental task in industrial machine learning, with critical use cases in transaction fraud detection, network intrusion classification, and email spam filtering. For these tasks, predicting a continuous numerical value is insufficient; instead, models must output well-calibrated probability scores constrained strictly within the range $[0, 1]$.

Attempting to apply ordinary least squares (OLS) linear regression to classification tasks is highly problematic. Because linear functions are unbounded, predictions can easily extend to $-\infty$ or $+\infty$. Additionally, OLS is highly sensitive to unbalanced classes and outliers, which severely distorts the decision boundary. The engineering goal is to construct a robust, mathematically sound classification framework that projects arbitrary multi-dimensional continuous features into a stable probability distribution.

## Technical Architecture

Logistic Regression achieves binary probability modeling by passing a linear combination of input features through the non-linear Sigmoid activation function.

Given the parameter vector $\theta \in \mathbb{R}^{n+1}$ and the input vector $x \in \mathbb{R}^{n+1}$ (with dummy feature $x_0 = 1$), the linear logit projection $z$ is:

$$ z = \theta^T x $$

The Sigmoid (logistic) activation function $g(z)$ maps the real-valued projection $z$ to a probability interval $[0, 1]$:

$$ \sigma(z) = \frac{1}{1 + e^{-z}} $$

The resulting logistic hypothesis function is:

$$ h_\theta(x) = \sigma(\theta^T x) = \frac{1}{1 + e^{-\theta^T x}} $$

```text
+-----------------------+
|  Input Features (x)   | ---> [ x0=1, x1, x2, ..., xn ]
+-----------------------+
            |
            | Weight Vector Dot Product: z = theta^T * x
            v
+-----------------------+
|  Linear Logit (z)     |
+-----------------------+
            |
            | Activation: g(z) = 1 / (1 + e^-z)
            v
+-----------------------+
| Probability (y_hat)   | ---> [0.0 <= y_hat <= 1.0]
+-----------------------+
            |
            | Threshold (e.g., 0.5)
            v
+-----------------------+
| Predicted Class (0/1) |
+-----------------------+
```

### The Cost Function: Binary Cross-Entropy (Log Loss)
We cannot use Mean Squared Error for logistic regression because the resulting cost function is non-convex, leading to numerous local minima during gradient optimization. Instead, we use the convex **Binary Cross-Entropy (Log Loss)** cost function:

$$ J(\theta) = -\frac{1}{m} \sum_{i=1}^{m} \left[ y^{(i)} \log(h_\theta(x^{(i)})) + (1 - y^{(i)}) \log(1 - h_\theta(x^{(i)})) \right] $$

In vectorized matrix form, where $X \in \mathbb{R}^{m \times (n+1)}$ and $y \in \mathbb{R}^m$:

$$ \hat{y} = \sigma(X\theta) $$
$$ J(\theta) = -\frac{1}{m} \left( y^T \log(\hat{y}) + (1 - y)^T \log(1 - \hat{y}) \right) $$

### Gradient Descent Optimization
To find the optimal parameter weights $\theta$, we compute the gradient of $J(\theta)$ with respect to $\theta$ and update iteratively:

$$ \frac{\partial J(\theta)}{\partial \theta_j} = \frac{1}{m} \sum_{i=1}^{m} \left( h_\theta(x^{(i)}) - y^{(i)} \right) x_j^{(i)} $$

In vectorized notation, the gradient $\nabla_\theta J(\theta)$ is:

$$ \nabla_\theta J(\theta) = \frac{1}{m} X^T (\sigma(X\theta) - y) $$

We iteratively update $\theta$ using learning rate $\alpha$:

$$ \theta \leftarrow \theta - \alpha \nabla_\theta J(\theta) $$

## Implementation

The following Python class implements Logistic Regression from scratch, incorporating numerical clipping to prevent overflow in the sigmoid computation and log-loss calculation.

```python
import numpy as np
from typing import Tuple

class LogisticRegressionScratch:
    """
    Binary Logistic Regression classifier optimized via Gradient Descent.
    """
    def __init__(self, learning_rate: float = 0.1, n_iterations: int = 1000) -> None:
        self.learning_rate: float = learning_rate
        self.n_iterations: int = n_iterations
        self.theta: np.ndarray = None

    def _sigmoid(self, z: np.ndarray) -> np.ndarray:
        """
        Computes the numerically stable sigmoid function.
        """
        # Clip z to avoid overflow in exp(-z)
        z = np.clip(z, -500, 500)
        return 1.0 / (1.0 + np.exp(-z))

    def fit(self, X: np.ndarray, y: np.ndarray) -> 'LogisticRegressionScratch':
        """
        Fits model parameters using vectorized Gradient Descent.
        """
        if y.ndim == 1:
            y = y.reshape(-1, 1)
            
        m, n = X.shape
        # Prepend column of ones for the bias/intercept term
        X_b = np.c_[np.ones((m, 1)), X]
        
        # Initialize theta weights to zeros
        self.theta = np.zeros((n + 1, 1))
        
        for _ in range(self.n_iterations):
            # Compute logits and probability predictions
            logits = X_b.dot(self.theta)
            predictions = self._sigmoid(logits)
            
            # Compute gradient: (1/m) * X^T * (predictions - y)
            gradient = (1.0 / m) * X_b.T.dot(predictions - y)
            
            # Apply Gradient Descent update step
            self.theta -= self.learning_rate * gradient
            
        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """
        Predicts calibrated probability of the positive class (class 1).
        """
        if self.theta is None:
            raise ValueError("Model is not fitted yet.")
        m = X.shape[0]
        X_b = np.c_[np.ones((m, 1)), X]
        return self._sigmoid(X_b.dot(self.theta))

    def predict(self, X: np.ndarray, threshold: float = 0.5) -> np.ndarray:
        """
        Predicts discrete binary class labels (0 or 1).
        """
        probabilities = self.predict_proba(X)
        return (probabilities >= threshold).astype(int)

    def compute_loss(self, X: np.ndarray, y: np.ndarray) -> float:
        """
        Computes the Binary Cross-Entropy (Log Loss) cost.
        """
        if y.ndim == 1:
            y = y.reshape(-1, 1)
        m = X.shape[0]
        predictions = self.predict_proba(X)
        
        # Clip predictions to prevent log(0) numerical instability
        predictions = np.clip(predictions, 1e-15, 1.0 - 1e-15)
        
        loss = -(1.0 / m) * np.sum(y * np.log(predictions) + (1.0 - y) * np.log(1.0 - predictions))
        return loss

if __name__ == "__main__":
    # Generate noisy classification dataset
    np.random.seed(42)
    X_data = np.random.randn(150, 2)
    # Binary labels based on a linear combination of features
    y_data = (X_data[:, 0] * 1.5 - X_data[:, 1] * 2.0 + np.random.randn(150) * 0.2 > 0).astype(int)
    
    # Train the model
    classifier = LogisticRegressionScratch(learning_rate=0.2, n_iterations=1500)
    classifier.fit(X_data, y_data)
    
    # Evaluate model predictions
    predictions = classifier.predict(X_data)
    accuracy = np.mean(predictions.flatten() == y_data)
    
    print("--- Logistic Regression Fit Results ---")
    print("Derived Weights (including bias):\n", classifier.theta.flatten())
    print(f"BCE Loss: {classifier.compute_loss(X_data, y_data):.6f}")
    print(f"Classification Accuracy: {accuracy * 100:.2f}%")
```

## System Constraints and Optimizations

Applying Logistic Regression in large-scale production architectures requires managing three main limitations:

1. **Numerical Underflow/Overflow**: The sigmoid function contains an exponential term ($e^{-z}$). For large negative or positive logit values, float precision bounds can cause underflow (rounding to 0) or overflow. Implementations must clip logits to a safe interval (e.g., $[-500, 500]$) and add an epsilon tolerance (e.g., $10^{-15}$) within logarithmic functions.
2. **Feature Scale Sensitivity**: Because we optimize Logistic Regression using Gradient Descent, the optimization surface will be highly elongated if features have wildly different scales. Standardizing features to zero mean and unit variance is essential for rapid, stable convergence.
3. **Linear Decision Boundary**: Logistic regression is inherently limited to modeling linear decision boundaries. If the underlying data distribution is highly non-linear, features must be manually mapped using kernel approximations or polynomial expansion.

**Production Recommendation**: Use Logistic Regression as a highly interpretable, lightweight baseline for binary classification. If feature distributions are highly non-linear or feature interactions dominate, transition to tree-based models or neural architectures.
