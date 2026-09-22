# ML Foundations: Logistic Regression and the Sigmoid Activation Function

In binary classification tasks (such as identifying fraudulent financial transactions, detecting spam emails, or predicting server node failure), we require a model that outputs a well-calibrated probability rather than a continuous, unbounded number. Trying to use Linear Regression for binary targets fails because its predictions can go below 0 or exceed 1, and its decision boundary is highly vulnerable to outliers. Logistic Regression solves this by mapping linear predictions into a closed interval of $(0, 1)$ using the Sigmoid activation function.

---

## The Problem: Why Linear Regression Fails for Classification

If we map binary class targets (0 and 1) onto a standard coordinate plane, a simple linear model tries to fit a straight line through the data. This approach presents severe challenges:
1. **Unbounded Output:** If the feature values are extremely high or low, the model predicts values like $1.5$ or $-0.4$, which have no coherent probabilistic meaning.
2. **Outlier Sensitivity:** A single outlier with a very high feature value shifts the entire linear regression line, incorrectly displacing the decision boundary even if the existing classes are perfectly separable.

To establish a robust classifier, we must keep our linear framework but pass its raw real-numbered output (called the *logit* or *pre-activation*) through a non-linear squeezing function that outputs a valid probability.

---

## Technical Architecture of Logistic Regression

The mathematical pipeline of Logistic Regression represents a combination of a linear logit function and a Sigmoid activation.

```
                     Linear Combo             Sigmoid Map
  Features (X) ---> [ z = w^T*X + b ] ---> [ p = 1/(1+e^-z) ] ---> Output Probability (0 to 1)
```

The probability curve maps inputs ($z$) to predictions ($p$):

```
         Probability p
            1.0 |          ********* (Class 1)
                |        *
                |       *   <- Sigmoid Curve
            0.5 |------*-------   <- Decision Boundary (z = 0)
                |    *
                |   *
            0.0 |***___________   (Class 0)
                +----------------- z (Logit Value)
```

### 1. The Sigmoid Activation Function
The Sigmoid function $\sigma(z)$ takes any real-valued number $z$ and maps it to the range $(0,1)$:

$$\sigma(z) = \frac{1}{1 + e^{-z}}$$

### 2. Hypothesis Definition
$$h_\theta(x) = \sigma(\theta^T x) = \frac{1}{1 + e^{-\theta^T x}}$$

### 3. Log Loss (Binary Cross-Entropy)
To train our weights, we cannot use Mean Squared Error because the Sigmoid activation makes the loss non-convex, leading to many local minima. Instead, we use Log Loss, which derives from Maximum Likelihood Estimation:

$$J(\theta) = -\frac{1}{m} \sum_{i=1}^m \left[ y^{(i)} \log(h_\theta(x^{(i)})) + (1-y^{(i)}) \log(1-h_\theta(x^{(i)})) \right]$$

### 4. Vectorized Gradient
The derivative of the loss with respect to the weights is identical in structure to Linear Regression, but the hypothesis $h_\theta(x)$ now contains the non-linear Sigmoid:

$$\nabla_\theta J(\theta) = \frac{1}{m} X^T (\sigma(X\theta) - y)$$

---

## Robust Vectorized Implementation in Python

When implementing Log Loss in code, we must ensure **numerical stability**. If the model predicts exactly $0.0$ or $1.0$, computing $\log(0)$ will throw an error or return $-\infty$. We must clip probabilities using a tiny epsilon.

```python
import numpy as np

class LogisticRegressionGD:
    def __init__(self, learning_rate: float = 0.05, epochs: int = 1000):
        self.lr = learning_rate
        self.epochs = epochs
        self.weights = None
        self.bias = None
        self.loss_history = []

    def _sigmoid(self, z: np.ndarray) -> np.ndarray:
        # Use np.clip to prevent overflow in exp(-z) for extreme z values
        z_clipped = np.clip(z, -500, 500)
        return 1.0 / (1.0 + np.exp(-z_clipped))

    def fit(self, X: np.ndarray, y: np.ndarray):
        n_samples, n_features = X.shape
        self.weights = np.zeros(n_features)
        self.bias = 0.0
        self.loss_history = []

        for epoch in range(self.epochs):
            # 1. Forward Pass
            logits = np.dot(X, self.weights) + self.bias
            y_pred = self._sigmoid(logits)

            # 2. Compute Stable Log Loss
            # Clip predictions to prevent log(0)
            eps = 1e-15
            y_pred_clipped = np.clip(y_pred, eps, 1.0 - eps)
            loss = -np.mean(y * np.log(y_pred_clipped) + (1.0 - y) * np.log(1.0 - y_pred_clipped))
            self.loss_history.append(loss)

            # 3. Compute Gradients
            dw = (1.0 / n_samples) * np.dot(X.T, (y_pred - y))
            db = (1.0 / n_samples) * np.sum(y_pred - y)

            # 4. Parameter Updates
            self.weights -= self.lr * dw
            self.bias -= self.lr * db

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """
        Returns probability estimates for the positive class (1).
        """
        logits = np.dot(X, self.weights) + self.bias
        return self._sigmoid(logits)

    def predict(self, X: np.ndarray, threshold: float = 0.5) -> np.ndarray:
        """
        Returns binary class predictions (0 or 1) based on a threshold.
        """
        return (self.predict_proba(X) >= threshold).astype(int)
```

---

## Developer Takeaways

* **Numerical Stability is Paramount:** When writing log-loss code, always clip predictions slightly inside the range $[10^{-15}, 1 - 10^{-15}]$. This keeps the calculations from executing `log(0)`.
* **Decision Boundary is Linear:** Even though Logistic Regression uses a non-linear activation (Sigmoid), the decision boundary ($\theta^T x + b = 0$) remains a linear hyperplane in the feature space.
* **Calibrate Your Threshold:** By default, class assignments happen at a threshold of $0.5$. However, in real-world scenarios like fraud detection, false negatives are much costlier than false positives. You should lower the threshold (e.g., to $0.2$) to maximize recall at the expense of precision.
