# Deep Learning 101: Feedforward Neural Networks and Backpropagation

## The Problem
Linear models, logistic classifiers, and decision trees excel at processing structured tabular features where the relationship is relatively flat. However, they struggle with unstructured data (e.g., raw audio streams, high-resolution pixel matrices, or natural text), where the target relies on a hierarchical understanding of features (e.g., combining individual pixels into edges, edges into shapes, and shapes into objects). Manual extraction of these features is brittle, labor-intensive, and fails to generalize. 

We need an architecture that acts as a universal function approximator—capable of automatically discovering non-linear feature abstractions and learning hierarchical representations directly from raw inputs.

## Technical Architecture

A Multi-Layer Perceptron (MLP) or Feedforward Neural Network (FNN) consists of an input layer, one or more hidden layers, and an output layer. Each layer contains a set of nodes (neurons) that perform a weighted sum of inputs followed by a non-linear activation.

```text
  Input Layer (a^[0]=X)            Hidden Layer (a^[1])              Output Layer (a^[2]=y_hat)
      +--------+                     +---------------+                     +--------+
      |  x1    | ------W^[1]-------> |               | ------W^[2]-------> |        |
      +--------+                     | z^[1]=W*a+b   |                     |        |
      +--------+                     | a^[1]=g(z)    |                     | y_hat  |
      |  x2    | ------W^[1]-------> |               | ------W^[2]-------> |        |
      +--------+                     +---------------+                     +--------+
          |                                  |                                 |
          |                                  |                                 |
          +=========== Forward Pass =========+=================================+>
          <=========== Backward Pass (Gradients dW, db via Chain Rule) ========+
```

### 1. Vectorized Forward Propagation
For any layer $l \in [1, L]$, the forward equations compute linear activations (logits) $z^{[l]}$ and activated outputs $a^{[l]}$:

$$ z^{[l]} = W^{[l]} a^{[l-1]} + b^{[l]} $$

$$ a^{[l]} = g(z^{[l]}) $$

Where:
* $a^{[0]} = X^T \in \mathbb{R}^{n \times m}$ is the input feature matrix (transposed to column vectors).
* $W^{[l]} \in \mathbb{R}^{n^{[l]} \times n^{[l-1]}}$ is the weight matrix of layer $l$.
* $b^{[l]} \in \mathbb{R}^{n^{[l]} \times 1}$ is the bias vector of layer $l$.
* $g(\cdot)$ is a non-linear activation function (e.g., ReLU, Sigmoid).

For binary classification, the final output layer $L$ uses the Sigmoid activation: $a^{[L]} = \sigma(z^{[L]}) \in \mathbb{R}^{1 \times m}$.

### 2. Vectorized Backpropagation (The Chain Rule)
To update the weights, we compute the gradient of the loss function $J$ with respect to every parameter in the network. For a dataset of $m$ samples, utilizing Cross-Entropy loss, the backpropagation equations are calculated from the output layer backwards:

At the final output layer $L$:

$$ dz^{[L]} = a^{[L]} - Y $$

$$ dW^{[L]} = \frac{1}{m} dz^{[L]} (a^{[L-1]})^T $$

$$ db^{[L]} = \frac{1}{m} \sum_{i=1}^{m} dz^{[L](i)} \quad \text{(row-wise sum)} $$

For any hidden layer $l \in [1, L-1]$:

$$ dz^{[l]} = \left( (W^{[l+1]})^T dz^{[l+1]} \right) \odot g'(z^{[l]}) $$

$$ dW^{[l]} = \frac{1}{m} dz^{[l]} (a^{[l-1]})^T $$

$$ db^{[l]} = \frac{1}{m} \sum_{i=1}^{m} dz^{[l](i)} $$

Where $\odot$ represents the element-wise (Hadamard) product, and $g'(\cdot)$ is the derivative of the activation function of layer $l$.

### 3. Gradient Update Rule
With computed gradients, parameters are updated using gradient descent with learning rate $\alpha$:

$$ W^{[l]} \leftarrow W^{[l]} - \alpha dW^{[l]} $$

$$ b^{[l]} \leftarrow b^{[l]} - \alpha db^{[l]} $$

## Implementation

The following is a vectorized, pure-NumPy implementation of a 2-layer feedforward neural network (one hidden layer, one output layer) optimized for binary classification.

```python
import numpy as np
from typing import Dict, Union

class FeedforwardNeuralNetwork:
    def __init__(self, input_dim: int, hidden_dim: int, learning_rate: float = 0.05) -> None:
        self.learning_rate: float = learning_rate
        
        # He (Kaiming) initialization for weights, zero initialization for biases
        np.random.seed(42)
        self.W1: np.ndarray = np.random.randn(hidden_dim, input_dim) * np.sqrt(2.0 / input_dim)
        self.b1: np.ndarray = np.zeros((hidden_dim, 1))
        self.W2: np.ndarray = np.random.randn(1, hidden_dim) * np.sqrt(2.0 / hidden_dim)
        self.b2: np.ndarray = np.zeros((1, 1))

    def _relu(self, z: np.ndarray) -> np.ndarray:
        return np.maximum(0, z)

    def _relu_derivative(self, z: np.ndarray) -> np.ndarray:
        return (z > 0).astype(float)

    def _sigmoid(self, z: np.ndarray) -> np.ndarray:
        return 1.0 / (1.0 + np.exp(-np.clip(z, -500, 500)))

    def forward(self, X: np.ndarray) -> Dict[str, np.ndarray]:
        """
        Runs the forward pass.
        Args:
            X: Input of shape (m, input_dim)
        """
        # Transpose input to shape (input_dim, m) for mathematical alignment
        a0 = X.T 
        z1 = self.W1.dot(a0) + self.b1
        a1 = self._relu(z1)
        z2 = self.W2.dot(a1) + self.b2
        a2 = self._sigmoid(z2)
        
        return {"a0": a0, "z1": z1, "a1": a1, "z2": z2, "a2": a2}

    def train_step(self, X: np.ndarray, y: np.ndarray) -> float:
        """
        Executes a single forward, backward, and optimization update cycle.
        """
        m = X.shape[0]
        y_reshaped = y.reshape(1, -1)  # (1, m)
        
        # 1. Forward Pass
        cache = self.forward(X)
        a0, z1, a1, z2, a2 = cache["a0"], cache["z1"], cache["a1"], cache["z2"], cache["a2"]
        
        # 2. Compute Cross-Entropy Loss
        loss = - (1.0 / m) * np.sum(y_reshaped * np.log(np.clip(a2, 1e-15, 1 - 1e-15)) + 
                                    (1.0 - y_reshaped) * np.log(np.clip(1 - a2, 1e-15, 1 - 1e-15)))

        # 3. Backpropagation
        dz2 = a2 - y_reshaped  # (1, m)
        dW2 = (1.0 / m) * dz2.dot(a1.T)
        db2 = (1.0 / m) * np.sum(dz2, axis=1, keepdims=True)
        
        dz1 = self.W2.T.dot(dz2) * self._relu_derivative(z1)  # (hidden_dim, m)
        dW1 = (1.0 / m) * dz1.dot(a0.T)
        db1 = (1.0 / m) * np.sum(dz1, axis=1, keepdims=True)
        
        # 4. Parameter Updates
        self.W1 -= self.learning_rate * dW1
        self.b1 -= self.learning_rate * db1
        self.W2 -= self.learning_rate * dW2
        self.b2 -= self.learning_rate * db2
        
        return float(loss)

    def predict(self, X: np.ndarray) -> np.ndarray:
        cache = self.forward(X)
        predictions = cache["a2"].ravel()
        return (predictions >= 0.5).astype(int)

if __name__ == "__main__":
    # Generate non-linear binary classification data (XOR-like problem)
    np.random.seed(42)
    X_train = np.random.randn(400, 2)
    y_train = ( (X_train[:, 0] * X_train[:, 1]) > 0 ).astype(int)

    # Initialize neural network: 2 inputs, 4 hidden neurons, 1 output
    nn = FeedforwardNeuralNetwork(input_dim=2, hidden_dim=4, learning_rate=0.1)

    # Train for 2000 epochs
    for epoch in range(2001):
        loss = nn.train_step(X_train, y_train)
        if epoch % 500 == 0:
            predictions = nn.predict(X_train)
            acc = np.mean(predictions == y_train) * 100
            print(f"Epoch {epoch:4d} | Loss: {loss:.5f} | Accuracy: {acc:.2f}%")
```

## System Constraints and Optimizations
Deep Feedforward Neural Networks are subject to several training limitations:

1. **Vanishing and Exploding Gradients**: During backpropagation, gradients are multiplied sequentially layer-by-layer. If weights are large or activation derivatives are small (like the sigmoid function outside the center), the gradient can blow up or vanish to zero before reaching early layers. Using ReLU activations and proper Kaiming weight initialization is required to solve this.
2. **Computational Overhead**: Standard matrix multiplication scales as $O(n^3)$. As layers grow deeper and wider, CPUs fail to process calculations efficiently. To scale, operations must be ported to GPUs/TPUs that perform parallel tensor multiplications.
3. **Overfitting Sensitivity**: Deep networks possess millions of parameters, allowing them to easily memorize noisy patterns.

**Production Recommendation**: Always apply **He Initialization** for ReLU layers and **Xavier (Glorot) Initialization** for sigmoid/tanh layers. Implement **Dropout** (randomly zeroing neuron activations during training) and **Batch Normalization** to stabilize training dynamics and improve model generalization.
