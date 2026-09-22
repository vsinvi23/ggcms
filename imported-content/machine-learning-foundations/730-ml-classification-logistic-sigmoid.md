# ML Foundations: Logistic Regression and the Sigmoid Activation Function

## The Problem
Linear Regression models map inputs to a continuous unbounded domain. However, in binary classification problems (e.g., spam detection, fraud flagging), the target variable is discrete: $y \in \{0, 1\}$. Applying linear regression to classification produces predictions $>1$ or $<0$, which breaks probabilistic interpretation. We need a mathematical mechanism to squash linear transformations into a strictly bounded probability distribution between 0 and 1, enabling the model to express confidence in class membership.

## Technical Architecture

Logistic Regression addresses this by passing the linear hypothesis $z = \theta^T x$ through a non-linear activation function called the Sigmoid (or Logistic) function. 

### The Sigmoid Function
The Sigmoid function mathematically maps any real number into the $(0, 1)$ range:

$$ g(z) = \frac{1}{1 + e^{-z}} $$

The modified hypothesis becomes:

$$ h_\theta(x) = g(\theta^T x) = \frac{1}{1 + e^{-\theta^T x}} $$

This output represents the estimated probability that $y = 1$ on input $x$:
$$ P(y=1 | x; \theta) = h_\theta(x) $$

### Log Loss (Cross-Entropy)
Because the Sigmoid function introduces non-linearity, the Mean Squared Error cost function becomes non-convex (full of local minima). Instead, Logistic Regression uses Binary Cross-Entropy (Log Loss), derived from Maximum Likelihood Estimation (MLE):

$$ Cost(h_\theta(x), y) = \begin{cases} 
-\log(h_\theta(x)) & \text{if } y = 1 \\
-\log(1 - h_\theta(x)) & \text{if } y = 0 
\end{cases} $$

Combined over $m$ training examples:

$$ J(\theta) = -\frac{1}{m} \sum_{i=1}^{m} [y^{(i)} \log(h_\theta(x^{(i)})) + (1 - y^{(i)}) \log(1 - h_\theta(x^{(i)}))] $$

```text
+----------+      +----------------+      +---------------+      +-------------+
|          |      |                |      |               |      |             |
| Input X  | ---> | Linear Z=W*X+b | ---> | Sigmoid A=g(Z)| ---> | Log Loss J  |
|          |      |                |      |               |      |             |
+----------+      +----------------+      +---------------+      +-------------+
                         ^                                              |
                         |                                              |
                         +----------------------------------------------+
                                      Gradient Descent Updates
```

## Implementation

We implement Logistic Regression using batch Gradient Descent. The gradient of the Log Loss cost function w.r.t $\theta$ is elegantly identical in form to Linear Regression, although the hypothesis $h_\theta(x)$ is now non-linear.

```python
import numpy as np

class LogisticRegression:
    def __init__(self, learning_rate: float = 0.01, num_iterations: int = 1000):
        self.lr = learning_rate
        self.num_iterations = num_iterations
        self.theta = None
        self.bias = None

    def _sigmoid(self, z: np.ndarray) -> np.ndarray:
        # np.clip prevents overflow in exp
        z = np.clip(z, -250, 250)
        return 1.0 / (1.0 + np.exp(-z))

    def fit(self, X: np.ndarray, y: np.ndarray) -> None:
        """
        Fits the logistic regression model using Gradient Descent.
        X: shape (m, n)
        y: shape (m,)
        """
        m, n = X.shape
        self.theta = np.zeros(n)
        self.bias = 0.0

        for _ in range(self.num_iterations):
            # Forward pass
            linear_model = np.dot(X, self.theta) + self.bias
            y_predicted = self._sigmoid(linear_model)

            # Compute gradients
            dz = y_predicted - y
            dw = (1 / m) * np.dot(X.T, dz)
            db = (1 / m) * np.sum(dz)

            # Update parameters
            self.theta -= self.lr * dw
            self.bias -= self.lr * db

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        linear_model = np.dot(X, self.theta) + self.bias
        return self._sigmoid(linear_model)

    def predict(self, X: np.ndarray, threshold: float = 0.5) -> np.ndarray:
        probabilities = self.predict_proba(X)
        return (probabilities >= threshold).astype(int)

# Example Usage
if __name__ == "__main__":
    # Synthetic binary classification data
    from sklearn.datasets import make_classification
    X, y = make_classification(n_samples=200, n_features=2, n_redundant=0, random_state=42)

    model = LogisticRegression(learning_rate=0.1, num_iterations=2000)
    model.fit(X, y)
    
    preds = model.predict(X)
    accuracy = np.mean(preds == y)
    print(f"Training Accuracy: {accuracy * 100:.2f}%")
```

## System Constraints and Optimizations
Logistic regression requires linearly separable data. For highly non-linear decision boundaries, feature engineering (polynomial features) is mandatory. When implementing at scale, robust numerical stability is critical—the `log(0)` scenario in cross-entropy must be handled by clipping probabilities (e.g., `eps = 1e-15`, clip between `eps` and `1 - eps`). Regularization ($L1$/$L2$) should be natively integrated into the loss function to prevent parameter explosion when features are perfectly correlated.
