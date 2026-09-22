# ML Foundations: Logistic Regression and the Sigmoid Activation Function

## The Problem
In binary classification scenarios—such as spam detection, user churn prediction, or financial fraud detection—the objective is to map input variables to a discrete, binary output ($y \in \{0, 1\}$). Trying to use standard linear regression for classification introduces severe failures:
1. **Unbounded Outputs**: Linear regression produces predictions in $(-\infty, \infty)$, which cannot be interpreted as probabilities.
2. **Extreme Sensitivity to Outliers**: Adding an outlier far from the decision threshold forces the linear regression line to tilt, dramatically shifting the decision boundary and misclassifying previously correct instances.
3. **Miscalibrated Probabilities**: Standard linear regression does not satisfy probability axioms, generating negative values or values exceeding 1.

The foundational challenge is to develop a robust probabilistic model that outputs well-calibrated confidence scores bounded strictly within $[0, 1]$ while defining a stable decision boundary.

## Technical Architecture

Logistic Regression addresses this problem by passing the linear combination of inputs (known as the *logit* or pre-activation $z$) through a non-linear squashing function: the Sigmoid (or logistic) activation function.

### The Sigmoid Function
The Sigmoid function $\sigma(z)$ is defined mathematically as:

$$ \sigma(z) = \frac{1}{1 + e^{-z}} $$

Where $z = \theta^T x$. The Sigmoid squashes any real-valued input $z$ into the range $(0, 1)$, allowing the output to be modeled directly as the conditional probability $P(y=1|x; \theta)$:

$$ h_\theta(x) = \sigma(\theta^T x) = \frac{1}{1 + e^{-\theta^T x}} $$

```text
       Sigmoid Curve: Squashing Logits to Probabilities
  1.0 +----------------------------------------------#---
      |                                        ####
      |                                     ###
      |                                  ###
  0.5 |------------------------------###-----------------  (Decision Threshold: z=0)
      |                          ###
      |                       ###
      |                    ###
  0.0 +---################------------------------------
     -inf                   z = theta^T * x              +inf
```

### The Cost Function: Binary Cross-Entropy (BCE)
We cannot use the Mean Squared Error (MSE) cost function here, because passing the Sigmoid function through MSE creates a non-convex cost surface with numerous local minima, making Gradient Descent highly unstable. Instead, we use the convex Binary Cross-Entropy (BCE) or Log Loss cost function:

$$ J(\theta) = -\frac{1}{m} \sum_{i=1}^{m} \left[ y^{(i)} \log\left(h_\theta(x^{(i)})\right) + (1 - y^{(i)}) \log\left(1 - h_\theta(x^{(i)})\right) \right] $$

### Gradient Descent Optimization
Because there is no closed-form analytical solution for Logistic Regression, we must iteratively update parameters using Gradient Descent. The gradient of $J(\theta)$ with respect to $\theta_j$ is given by:

$$ \frac{\partial J(\theta)}{\partial \theta_j} = \frac{1}{m} \sum_{i=1}^{m} \left( \sigma(\theta^T x^{(i)}) - y^{(i)} \right) x_j^{(i)} $$

In vectorized notation:

$$ \nabla_\theta J(\theta) = \frac{1}{m} X^T \left( \sigma(X\theta) - y \right) $$

```text
+-------------------+       +-----------------------+       +-------------------+
|  Feature Matrix X | ----> | Logits: z = X * theta | ----> | Sigmoid:          |
|   Size: (m x n)   |       | Size: (m x 1)         |       | p = 1 / (1+e^-z)  |
+-------------------+       +-----------------------+       +-------------------+
                                                                      |
                                                                      v
+-------------------+       +-----------------------+       +-------------------+
|  Weights Updated  | <---- | Gradient calculation: | <---- | Error: (p - y)    |
| theta = theta-a*G |       | G = (1/m)*X^T*(p - y) |       | Size: (m x 1)     |
+-------------------+       +-----------------------+       +-------------------+
```

## Implementation

A critical challenge when writing your own logistic regression model is avoiding *numerical overflow/underflow* inside the exponential function ($e^{-z}$) and the logarithm functions ($\log(p)$). Below is a numerically stable production-grade class.

```python
import numpy as np
from typing import Tuple, List

class NumericallyStableLogisticRegression:
    def __init__(self, learning_rate: float = 0.1, max_iter: int = 1000) -> None:
        self.learning_rate: float = learning_rate
        self.max_iter: int = max_iter
        self.theta: np.ndarray = None
        self.cost_history: List[float] = []

    def _sigmoid(self, z: np.ndarray) -> np.ndarray:
        """
        Computes sigmoid function with robust numerical limits.
        Avoids overflow by handling positive and negative inputs differently.
        """
        return np.where(
            z >= 0,
            1.0 / (1.0 + np.exp(-z)),
            np.exp(z) / (1.0 + np.exp(z))
        )

    def fit(self, X: np.ndarray, y: np.ndarray) -> 'NumericallyStableLogisticRegression':
        """
        Fits model using Vectorized Gradient Descent.
        """
        if y.ndim == 1:
            y = y.reshape(-1, 1)
        m, n = X.shape
        # Prepend bias column
        X_b = np.c_[np.ones((m, 1)), X]
        self.theta = np.zeros((n + 1, 1))

        for epoch in range(self.max_iter):
            z = X_b.dot(self.theta)
            predictions = self._sigmoid(z)
            
            # Numeric clipping to avoid log(0)
            predictions = np.clip(predictions, 1e-15, 1.0 - 1e-15)
            
            # Compute cross entropy cost
            cost = -np.mean(y * np.log(predictions) + (1.0 - y) * np.log(1.0 - predictions))
            self.cost_history.append(cost)
            
            # Compute gradient: (1/m) * X^T * (predictions - y)
            gradient = (1.0 / m) * X_b.T.dot(predictions - y)
            
            # Update parameters
            self.theta -= self.learning_rate * gradient

        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """
        Predicts conditional probability P(y=1|X).
        """
        if self.theta is None:
            raise ValueError("Model must be fitted first.")
        m = X.shape[0]
        X_b = np.c_[np.ones((m, 1)), X]
        return self._sigmoid(X_b.dot(self.theta))

    def predict(self, X: np.ndarray, threshold: float = 0.5) -> np.ndarray:
        """
        Predicts discrete binary classes based on a probability threshold.
        """
        probabilities = self.predict_proba(X)
        return (probabilities >= threshold).astype(int)

if __name__ == "__main__":
    # Generate simple synthetic binary dataset
    np.random.seed(0)
    X_train = np.random.randn(200, 2)
    # Decision boundary: x1 + x2 > 0
    y_train = (X_train[:, 0] + X_train[:, 1] > 0).astype(int).reshape(-1, 1)

    # Initialize and train
    clf = NumericallyStableLogisticRegression(learning_rate=0.5, max_iter=500)
    clf.fit(X_train, y_train)

    print("--- Logistic Regression GD Fit Results ---")
    print(f"Optimal Parameters (weights + intercept):\n{clf.theta}")
    print(f"Initial Cost: {clf.cost_history[0]:.6f}")
    print(f"Final Cost: {clf.cost_history[-1]:.6f}")

    # Predict on test sample
    X_test = np.array([[-1.0, -1.0], [1.5, 1.5]])
    probs = clf.predict_proba(X_test)
    classes = clf.predict(X_test)
    print("\nOut-of-sample Test predictions:")
    for i, x in enumerate(X_test):
        print(f"Input: {x} -> Prob: {probs[i][0]:.4f} -> Class: {classes[i][0]}")
```

## System Constraints and Optimizations
When scaling logistic regression classifiers to enterprise scale, developers must evaluate the following optimizations:

1. **Vanishing Gradients**: For extreme inputs (large $|z|$), the Sigmoid derivative $\sigma'(z) = \sigma(z)(1 - \sigma(z))$ approaches zero. The parameter update halts. Normalizing/Standardizing features to a consistent scale before feeding them into the model is crucial to prevent early saturation.
2. **Perfect Separation**: If the classes are perfectly linearly separable, weights will grow indefinitely in an attempt to drive predictions to absolute $1$ and $0$, causing numerical overflow. Apply L1 (Lasso) or L2 (Ridge) regularization to penalize large parameters.
3. **Multi-Class Expansion**: Standard logistic regression is binary. For multi-class tasks, expand the architecture using **One-vs-Rest (OvR)** or transition to a multi-class **Softmax Regression** (multinomial logistic regression) framework.
