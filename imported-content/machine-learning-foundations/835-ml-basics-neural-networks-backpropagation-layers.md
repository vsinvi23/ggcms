# Deep Learning 101: Feedforward Neural Networks and Backpropagation

## The Problem
While traditional machine learning algorithms (such as linear regression, logistic regression, or decision trees) perform exceptionally well on structured tabular data, they suffer from a major structural limitation: they cannot autonomously discover hierarchical feature representations. 

For complex unstructured data—such as image pixels, audio waveforms, or natural language sequences—the relationships are highly non-linear and context-dependent. Traditional models require humans to manually engineer sophisticated, hand-crafted features (e.g., SIFT, Gabor filters, or n-grams), which is incredibly fragile, labor-intensive, and fails to generalize across domains.

The core challenge is to construct a modular, self-learning computational architecture that can ingest raw inputs and autonomously extract increasingly abstract levels of hierarchical features, using mathematical gradients to guide parameter optimization.

## Technical Architecture

A Feedforward Neural Network (also called a Multi-Layer Perceptron or MLP) resolves this challenge by connecting modular layers of processing units called **neurons**.

### The Forward Propagation Pass
In a feedforward network, data flows from the input layer, through one or more hidden layers, to the output layer. For any given layer $l$, the pre-activation logit vector $z^{[l]}$ and activation vector $a^{[l]}$ are calculated as:

$$ z^{[l]} = W^{[l]} a^{[l-1]} + b^{[l]} $$

$$ a^{[l]} = g^{[l]}\left(z^{[l]}\right) $$

Where:
- $W^{[l]}$ is the weight matrix for layer $l$.
- $b^{[l]}$ is the bias vector for layer $l$.
- $a^{[l-1]}$ is the activation vector from the previous layer (with $a^{[0]} = X$, the input).
- $g^{[l]}$ is a non-linear activation function (such as ReLU, Sigmoid, or Tanh). Non-linearity is mandatory; without it, any multi-layer network collapses into a single linear regression model.

```text
Forward Pass: Input ---> Hidden Layer 1 ---> Hidden Layer 2 ---> Output (Prediction)
Backward Pass: Gradients <--- dW^[2], db^{[2]} <--- dW^[1], db^{[1]} <--- Loss Calculation

      Layer 0 (Input)         Layer 1 (Hidden)        Layer 2 (Output)
         +-------+               +-------+               +-------+
  X1 --->|  x_1  |------W1------>|  a1   |------W2------>|  y1   |---> Prediction
         +-------+               +-------+               +-------+
                             g^{[1]}(z)              g^{[2]}(z)
```

### The Backpropagation Pass (The Chain Rule)
To train the network, we must calculate how the total loss $\mathcal{L}$ changes with respect to every single weight and bias in the network, so we can update them using Gradient Descent. We achieve this by calculating errors backward from the output layer using the **multi-variable Chain Rule**:

1. **Output Layer Error ($\delta^{[L]}$)**:
   $$ \delta^{[L]} = \frac{\partial \mathcal{L}}{\partial z^{[L]}} = \frac{\partial \mathcal{L}}{\partial a^{[L]}} \odot g^{[L]\prime}\left(z^{[L]}\right) $$
   Where $\odot$ represents the element-wise (Hadamard) product.

2. **Hidden Layer Error ($\delta^{[l]}$)**:
   $$ \delta^{[l]} = \frac{\partial \mathcal{L}}{\partial z^{[l]}} = \left( (W^{[l+1]})^T \delta^{[l+1]} \right) \odot g^{[l]\prime}\left(z^{[l]}\right) $$

3. **Parameter Gradients**:
   $$ \frac{\partial \mathcal{L}}{\partial W^{[l]}} = \delta^{[l]} (a^{[l-1]})^T $$
   $$ \frac{\partial \mathcal{L}}{\partial b^{[l]}} = \delta^{[l]} $$

Using these computed gradients, we update parameters: $W^{[l]} \leftarrow W^{[l]} - \alpha \frac{\partial \mathcal{L}}{\partial W^{[l]}}$.

## Implementation

The following pure Python/NumPy implementation constructs a 3-layer feedforward neural network (Input, Hidden, Output) with ReLU activation in the hidden layer and Sigmoid in the output layer.

```python
import numpy as np
from typing import Tuple, Dict

class CustomMLP:
    def __init__(self, input_dim: int, hidden_dim: int, output_dim: int, learning_rate: float = 0.1) -> None:
        self.learning_rate: float = learning_rate
        
        # Initialize weights using He (Kaiming) initialization for ReLU, 
        # and Xavier for Sigmoid to prevent vanishing/exploding gradients.
        self.W1 = np.random.randn(hidden_dim, input_dim) * np.sqrt(2.0 / input_dim)
        self.b1 = np.zeros((hidden_dim, 1))
        self.W2 = np.random.randn(output_dim, hidden_dim) * np.sqrt(1.0 / hidden_dim)
        self.b2 = np.zeros((output_dim, 1))

    def _relu(self, z: np.ndarray) -> np.ndarray:
        return np.maximum(0, z)

    def _relu_derivative(self, z: np.ndarray) -> np.ndarray:
        return (z > 0).astype(float)

    def _sigmoid(self, z: np.ndarray) -> np.ndarray:
        return 1.0 / (1.0 + np.exp(-np.clip(z, -500, 500)))

    def _sigmoid_derivative(self, a: np.ndarray) -> np.ndarray:
        # Sigmoid derivative written in terms of its activation: a * (1 - a)
        return a * (1.0 - a)

    def forward(self, X: np.ndarray) -> Tuple[np.ndarray, Dict[str, np.ndarray]]:
        """
        Runs the forward pass. X shape: (input_dim, m)
        """
        z1 = np.dot(self.W1, X) + self.b1
        a1 = self._relu(z1)
        z2 = np.dot(self.W2, a1) + self.b2
        a2 = self._sigmoid(z2)
        
        cache = {"z1": z1, "a1": a1, "z2": z2, "a2": a2}
        return a2, cache

    def backward(self, X: np.ndarray, y: np.ndarray, cache: Dict[str, np.ndarray]) -> None:
        """
        Runs the backward pass (gradients) and updates weights.
        y shape: (output_dim, m)
        """
        m = X.shape[1]
        a1 = cache["a1"]
        a2 = cache["a2"]
        z1 = cache["z1"]

        # 1. Output layer gradients (Binary Cross Entropy loss derivative)
        # dL/da2 = - (y/a2 - (1-y)/(1-a2))
        # dL/dz2 = a2 - y (Simplified derivative when combined with sigmoid activation)
        dz2 = a2 - y
        dW2 = (1.0 / m) * np.dot(dz2, a1.T)
        db2 = (1.0 / m) * np.sum(dz2, axis=1, keepdims=True)

        # 2. Hidden layer gradients
        # Backpropagate error: dL/dz1 = (W2^T * dz2) * relu_derivative(z1)
        dz1 = np.dot(self.W2.T, dz2) * self._relu_derivative(z1)
        dW1 = (1.0 / m) * np.dot(dz1, X.T)
        db1 = (1.0 / m) * np.sum(dz1, axis=1, keepdims=True)

        # 3. Update parameters
        self.W1 -= self.learning_rate * dW1
        self.b1 -= self.learning_rate * db1
        self.W2 -= self.learning_rate * dW2
        self.b2 -= self.learning_rate * db2

    def fit(self, X: np.ndarray, y: np.ndarray, epochs: int = 1000) -> 'CustomMLP':
        """
        Trains the neural network.
        X shape: (features, samples), y shape: (targets, samples)
        """
        for epoch in range(epochs):
            predictions, cache = self.forward(X)
            self.backward(X, y, cache)
        return self

if __name__ == "__main__":
    # Define an XOR classification problem (Requires multi-layer non-linear features)
    X_train = np.array([[0, 0, 1, 1], 
                        [0, 1, 0, 1]]) # (2, 4)
    y_train = np.array([[0, 1, 1, 0]]) # (1, 4)

    # Input: 2, Hidden: 4, Output: 1
    mlp = CustomMLP(input_dim=2, hidden_dim=4, output_dim=1, learning_rate=0.5)
    mlp.fit(X_train, y_train, epochs=2000)

    # Validate output
    predictions, _ = mlp.forward(X_train)
    print("--- XOR Neural Network Training Results ---")
    print(f"Inputs:\n{X_train.T}")
    print(f"Predictions:\n{predictions.T}")
    print(f"Target Labels:\n{y_train.T}")
```

## System Constraints and Optimizations
Deep Feedforward Neural Networks are highly expressive but introduce several production risks:

1. **Vanishing/Exploding Gradients**: As errors are multiplied backwards through many layers using the Chain Rule, gradients can shrink exponentially (vanishing) or grow exponentially (exploding). To prevent this, use **ReLU** or **Leaky ReLU** activations instead of Sigmoid/Tanh in hidden layers, and apply **Batch Normalization**.
2. **Local Minima & Saddle Points**: Standard Gradient Descent easily gets stuck in local minima or saddle points. Utilize modern adaptive optimizers like **Adam** or **RMSProp**, which track first and second moments of gradients to dynamically adjust learning rates per parameter.
3. **Overfitting (Co-adaptation)**: Deep networks have immense capacity and quickly memorize training noise. Mitigate this by adding **Dropout** (randomly disabling neurons during training steps) or L2 regularization (weight decay).
