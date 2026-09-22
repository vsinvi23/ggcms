# ML Foundations: Logistic Regression and the Sigmoid Activation Function

## The Problem
Linear regression is designed to predict continuous unbounded outputs, making it unsuitable for binary classification problems where the output strictly represents a categorical probability $P(y=1|x) \in [0, 1]$. Using linear models for classification introduces edge cases where predicted probabilities drop below zero or exceed one, severely violating probability axioms and skewing the decision boundary. 

## Architectural Approach
Logistic regression maps the unbounded output of a linear equation $z = \theta^T X$ into a strict probability range $[0, 1]$ using the **Sigmoid (Logistic) Activation Function**. 

### The Sigmoid Function
$$ \sigma(z) = \frac{1}{1 + e^{-z}} $$

### Log Loss (Binary Cross-Entropy)
To optimize the weights, Mean Squared Error is replaced with **Binary Cross-Entropy**, ensuring a strictly convex cost function for gradient descent:
$$ J(\theta) = -\frac{1}{m} \sum_{i=1}^{m} [y^{(i)} \log(h_\theta(x^{(i)})) + (1 - y^{(i)}) \log(1 - h_\theta(x^{(i)}))] $$

```text
    +-----------+     +-------------------+     +------------------+
    | Input (X) | --> | Linear Z = θ^T X  | --> | Sigmoid σ(Z)     | --+
    +-----------+     +-------------------+     +------------------+   |
                                                                       v
    +-----------+                               +------------------+   |
    | Target (y)| ----------------------------> | Cost Function J  | <-+
    +-----------+                               +------------------+
                                                        |
                                                        v
                                                +------------------+
                                                | Gradient Descent | --> (Update θ)
                                                +------------------+
```

## Implementation

The following Python implementation builds a Logistic Regression classifier from scratch, demonstrating the forward pass via the sigmoid function and the backward pass using gradient descent.

```python
import numpy as np

class LogisticRegression:
    def __init__(self, learning_rate=0.01, iterations=1000):
        self.lr = learning_rate
        self.iterations = iterations
        self.weights = None
        self.bias = None
        self.costs = []

    def _sigmoid(self, z):
        """Map values to probabilities between 0 and 1."""
        # np.clip prevents overflow in exp
        z = np.clip(z, -250, 250) 
        return 1 / (1 + np.exp(-z))

    def fit(self, X, y):
        m, n = X.shape
        self.weights = np.zeros(n)
        self.bias = 0

        for _ in range(self.iterations):
            # Forward pass
            linear_model = np.dot(X, self.weights) + self.bias
            y_predicted = self._sigmoid(linear_model)

            # Compute cost (Binary Cross Entropy)
            epsilon = 1e-15 # Prevent log(0)
            cost = - (1/m) * np.sum(y * np.log(y_predicted + epsilon) + (1-y) * np.log(1 - y_predicted + epsilon))
            self.costs.append(cost)

            # Compute gradients
            dw = (1 / m) * np.dot(X.T, (y_predicted - y))
            db = (1 / m) * np.sum(y_predicted - y)

            # Gradient Descent step
            self.weights -= self.lr * dw
            self.bias -= self.lr * db

    def predict_proba(self, X):
        linear_model = np.dot(X, self.weights) + self.bias
        return self._sigmoid(linear_model)

    def predict(self, X, threshold=0.5):
        probabilities = self.predict_proba(X)
        return [1 if p >= threshold else 0 for p in probabilities]

# -------------------------
# Usage Example
# -------------------------
if __name__ == "__main__":
    from sklearn.datasets import make_classification
    from sklearn.metrics import accuracy_score

    # Generate binary classification data
    X, y = make_classification(n_samples=1000, n_features=4, random_state=42)

    # Train model
    clf = LogisticRegression(learning_rate=0.1, iterations=2000)
    clf.fit(X, y)

    # Evaluate
    preds = clf.predict(X)
    print(f"Training Accuracy: {accuracy_score(y, preds):.4f}")
    print(f"Final Cost: {clf.costs[-1]:.4f}")
```

## Trade-offs and Considerations
1. **Decision Boundary**: Logistic regression models a strictly linear decision boundary. Without feature engineering (e.g., polynomial features), it cannot solve non-linear problems like XOR.
2. **Sensitivity to Outliers**: While better than linear regression for classification, logistic regression can still be affected by extreme outliers pushing the sigmoid function into its saturated regions, causing vanishing gradients.
3. **Probabilistic Output**: A major advantage over hard-margin classifiers (like SVMs) is that logistic regression outputs a calibrated probability distribution, making it invaluable in risk-assessment tasks (e.g., credit scoring, medical diagnosis).
