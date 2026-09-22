# ML Foundations: Linear Regression and the Gradient Descent Algorithm

In data engineering and machine learning pipelines, predicting a continuous target metric (such as query execution latency, API request throughput, or server power consumption) is a ubiquitous task. The foundational approach for this is Linear Regression. While analytical solutions like the Normal Equation exist, they become computationally intractable ($O(D^3)$ matrix inversion complexity) as the number of features ($D$) grows. This is where Gradient Descent, a first-order iterative optimization algorithm, becomes essential for training models at scale.

---

## The Problem: Computational Scalability in Continuous Prediction

Suppose you need to predict API response latency based on multiple server performance metrics. The naive approach to finding the optimal parameters $\theta$ that minimize the Mean Squared Error (MSE) is the analytical Ordinary Least Squares (OLS) closed-form solution:

$$\theta = (X^T X)^{-1} X^T y$$

However, when dealing with real-time data streams or high-dimensional telemetry where the feature count $D > 10,000$, computing the inverse of $X^T X$ is incredibly slow and CPU-bound. Furthermore, if $X^T X$ is non-invertible (due to multi-collinearity), the analytical solution fails outright. To solve this, we must shift from analytical derivation to iterative approximation using Gradient Descent.

---

## Technical Architecture and Optimization Mechanics

Gradient Descent iteratively updates model parameters in the opposite direction of the gradient of the loss function. The step size is controlled by a hyperparameter called the learning rate ($\alpha$).

```
       Loss J(θ)
         |
    High |  \ * (Initial θ - high loss)
         |   \
         |    \  * (Gradient step: θ := θ - α * dJ/dθ)
         |     \
         |      \    *
         |       \_______*_______/  <- Global Minimum (dJ/dθ = 0)
         +--------------------------------- θ (Parameters)
```

The mathematical formulation for a model with $D$ features is:

### 1. Hypothesis Function
$$h_\theta(x) = \theta^T x = \theta_0 + \theta_1 x_1 + \theta_2 x_2 + \dots + \theta_d x_d$$

### 2. Loss Function (Mean Squared Error)
$$J(\theta) = \frac{1}{2m} \sum_{i=1}^m \left( h_\theta(x^{(i)}) - y^{(i)} \right)^2$$

### 3. Gradient Updates
For each weight $\theta_j$:
$$\theta_j := \theta_j - \alpha \frac{\partial J(\theta)}{\partial \theta_j}$$

Where the partial derivative is:
$$\frac{\partial J(\theta)}{\partial \theta_j} = \frac{1}{m} \sum_{i=1}^m \left( h_\theta(x^{(i)}) - y^{(i)} \right) x_j^{(i)}$$

Fully vectorized across the dataset, the gradient is:
$$\nabla_\theta J(\theta) = \frac{1}{m} X^T (X\theta - y)$$

---

## Robust Vectorized Implementation in Python

Below is a complete, production-ready implementation of Batch Gradient Descent for Linear Regression using NumPy. It avoids explicit nested loops over the data points to ensure peak vectorized performance.

```python
import numpy as np

class LinearRegressionGD:
    def __init__(self, learning_rate: float = 0.01, epochs: int = 1000):
        self.lr = learning_rate
        self.epochs = epochs
        self.weights = None
        self.bias = None
        self.loss_history = []

    def fit(self, X: np.ndarray, y: np.ndarray):
        """
        Fits the linear model using Batch Gradient Descent.
        X: Matrix of shape (n_samples, n_features)
        y: Target array of shape (n_samples,)
        """
        n_samples, n_features = X.shape
        # Initialize parameters to zeros
        self.weights = np.zeros(n_features)
        self.bias = 0.0
        self.loss_history = []

        for epoch in range(self.epochs):
            # 1. Forward Pass: Compute predictions
            y_pred = np.dot(X, self.weights) + self.bias
            
            # 2. Compute Loss (MSE with a 1/2 multiplier for clean derivation)
            loss = np.mean((y_pred - y) ** 2) / 2.0
            self.loss_history.append(loss)

            # 3. Compute Vectorized Gradients
            dw = (1.0 / n_samples) * np.dot(X.T, (y_pred - y))
            db = (1.0 / n_samples) * np.sum(y_pred - y)

            # 4. Parameter Updates
            self.weights -= self.lr * dw
            self.bias -= self.lr * db

    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Predicts continuous values for input features.
        """
        return np.dot(X, self.weights) + self.bias
```

---

## Developer Takeaways

* **Scale Features First:** Gradient descent is highly sensitive to feature scaling. If features have vastly different ranges, the loss contours will be highly elongated ellipses, causing gradient updates to oscillate wildly. Always apply standard scaling ($z$-score normalization) beforehand.
* **Tune the Learning Rate ($\alpha$):** A rate that is too high causes the model to overshoot the global minimum and diverge. A rate that is too low results in slow convergence, consuming excess compute.
* **Vectorization is Critical:** In data engineering, never use native Python loops for matrix math. Vectorized operations in NumPy utilize highly optimized, parallelized underlying C libraries (like BLAS/LAPACK) to run operations orders of magnitude faster.
