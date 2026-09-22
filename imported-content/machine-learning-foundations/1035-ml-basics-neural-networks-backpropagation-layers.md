# Deep Learning 101: Feedforward Neural Networks and Backpropagation

## The Problem
While traditional machine learning models (e.g., linear models, decision tree ensembles) excel on structured tabular data, they struggle to model unstructured data like raw audio signals, images, or raw text embeddings. These domains require hierarchical feature representation, where lower-level features (e.g., edges, frequencies) are progressively composed into high-level abstractions (e.g., shapes, phonemes).

Feedforward Neural Networks (Multi-Layer Perceptrons or MLPs) solve this by stacking layers of parameter-weighted linear transformations interleaved with non-linear activation functions. However, training these architectures requires a highly scalable, numerically stable method to compute gradients for millions of parameters. Backpropagation is the mathematical engine of deep learning, and implementing it correctly requires careful attention to the chain rule, numerical limits, and gradient flows.

## Technical Architecture

A Feedforward Neural Network comprises an input layer, one or more hidden layers, and an output layer.

```text
Forward Propagation (Feature Abstraction):
[Input x] ---> (Layer 1: z1 = W1*a0 + b1) ---> [a1 = ReLU(z1)] ---> (Layer 2: z2 = W2*a1 + b2) ---> [a2 = Sigmoid(z2)] ---> Loss (J)
                                                                                                                          |
Backward Propagation (Error Derivation via Chain Rule):                                                                  |
[dW1, db1] <--- (dJ/dz1 = W2^T*dz2 * ReLU') <--- [dW2, db2] <--- (dz2 = a2 - y) <------------------------------------------+
```

### 1. Mathematical Formulation: Forward Pass
For any layer $l$ in the network, given the activation output of the previous layer $a^{[l-1]}$ (with input $a^{[0]} = x$):

$$ z^{[l]} = W^{[l]} a^{[l-1]} + b^{[l]} $$
$$ a^{[l]} = g^{[l]}\left(z^{[l]}\right) $$

Where $W^{[l]}$ is the weight matrix, $b^{[l]}$ is the bias vector, and $g^{[l]}$ is a non-linear activation function (such as ReLU or Sigmoid).

### 2. Gradient Calculation: Backward Pass (Chain Rule)
Let $J$ be the cost function. Backpropagation calculates the sensitivity of $J$ to changes in weights $W^{[l]}$ and biases $b^{[l]}$.

Assuming a final binary classification output layer $L$ using Sigmoid activation and Binary Cross-Entropy (BCE) loss:

* **Output Layer Error ($dz^{[L]}$)**:
  $$ dz^{[L]} = \frac{\partial J}{\partial z^{[L]}} = a^{[L]} - y $$

* **Hidden Layer Error ($dz^{[l]}$)**: Using the chain rule, we backpropagate the error from layer $l+1$ to layer $l$:
  $$ dz^{[l]} = \left( (W^{[l+1]})^T dz^{[l+1]} \right) \odot g^{[l]\prime}\left(z^{[l]}\right) $$
  Where $\odot$ represents the element-wise Hadamard product, and $g^{[l]\prime}$ is the derivative of the activation function at layer $l$.

* **Parameter Gradients**:
  $$ dW^{[l]} = \frac{\partial J}{\partial W^{[l]}} = \frac{1}{m} dz^{[l]} \left(a^{[l-1]}\right)^T $$
  $$ db^{[l]} = \frac{\partial J}{\partial b^{[l]}} = \frac{1}{m} \sum_{i=1}^{m} dz^{[l](i)} $$

## Implementation

The following Python class implements a 3-layer neural network (Input, Hidden, Output) from scratch using NumPy, utilizing He initialization, ReLU hidden activation, and Sigmoid output activation with vectorized backpropagation.

```python
import numpy as np
from typing import Dict, Union

class SimpleMLPScratch:
    """
    A 3-layer Feedforward Neural Network (Input, 1 Hidden Layer, Output) 
    trained via vectorized Backpropagation.
    """
    def __init__(self, input_dim: int, hidden_dim: int, output_dim: int = 1, 
                 learning_rate: float = 0.01) -> None:
        self.learning_rate: float = learning_rate
        
        # He (Kaiming) Initialization for weights, zeros for biases
        np.random.seed(42)
        self.W1 = np.random.randn(hidden_dim, input_dim) * np.sqrt(2.0 / input_dim)
        self.b1 = np.zeros((hidden_dim, 1))
        
        # Xavier/Glorot Initialization for Output Layer weights
        self.W2 = np.random.randn(output_dim, hidden_dim) * np.sqrt(1.0 / hidden_dim)
        self.b2 = np.zeros((output_dim, 1))

    def _relu(self, z: np.ndarray) -> np.ndarray:
        return np.maximum(0, z)

    def _relu_derivative(self, z: np.ndarray) -> np.ndarray:
        return (z > 0).astype(float)

    def _sigmoid(self, z: np.ndarray) -> np.ndarray:
        z = np.clip(z, -500, 500)
        return 1.0 / (1.0 + np.exp(-z))

    def forward(self, X: np.ndarray) -> Dict[str, np.ndarray]:
        """
        Executes forward propagation through the network layers.
        X shape: (input_dim, m)
        """
        z1 = np.dot(self.W1, X) + self.b1
        a1 = self._relu(z1)
        
        z2 = np.dot(self.W2, a1) + self.b2
        a2 = self._sigmoid(z2)
        
        return {"z1": z1, "a1": a1, "z2": z2, "a2": a2}

    def backward(self, X: np.ndarray, y: np.ndarray, cache: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        """
        Computes gradients using analytical chain-rule backpropagation.
        """
        m = X.shape[1]
        a1, a2 = cache["a1"], cache["a2"]
        z1 = cache["z1"]
        
        # Step 1: Output layer gradient
        dz2 = a2 - y # Shape: (output_dim, m)
        dW2 = (1.0 / m) * np.dot(dz2, a1.T)
        db2 = (1.0 / m) * np.sum(dz2, axis=1, keepdims=True)
        
        # Step 2: Hidden layer gradient backpropagated
        dz1 = np.dot(self.W2.T, dz2) * self._relu_derivative(z1) # Shape: (hidden_dim, m)
        dW1 = (1.0 / m) * np.dot(dz1, X.T)
        db1 = (1.0 / m) * np.sum(dz1, axis=1, keepdims=True)
        
        return {"dW1": dW1, "db1": db1, "dW2": dW2, "db2": db2}

    def update_parameters(self, grads: Dict[str, np.ndarray]) -> None:
        """
        Applies standard Stochastic Gradient Descent parameter updates.
        """
        self.W1 -= self.learning_rate * grads["dW1"]
        self.b1 -= self.learning_rate * grads["db1"]
        self.W2 -= self.learning_rate * grads["dW2"]
        self.b2 -= self.learning_rate * grads["db2"]

    def fit(self, X: np.ndarray, y: np.ndarray, epochs: int = 1000) -> 'SimpleMLPScratch':
        """
        Trains the network using batch gradient descent.
        """
        # Data representation: Features aligned column-wise (input_dim, m)
        if y.ndim == 1:
            y = y.reshape(1, -1)
        elif y.shape[0] != 1:
            y = y.T
            
        X_t = X.T

        for epoch in range(epochs):
            # Forward Pass
            cache = self.forward(X_t)
            # Backward Pass
            grads = self.backward(X_t, y, cache)
            # Update weights
            self.update_parameters(grads)
            
        return self

    def predict(self, X: np.ndarray, threshold: float = 0.5) -> np.ndarray:
        """
        Generates discrete class labels (0 or 1) for inputs.
        """
        X_t = X.T
        cache = self.forward(X_t)
        return (cache["a2"] >= threshold).astype(int).flatten()

if __name__ == "__main__":
    # Generate binary classification problem
    from sklearn.datasets import make_moons
    X_data, y_data = make_moons(n_samples=250, noise=0.2, random_state=42)
    
    # Train MLP
    mlp = SimpleMLPScratch(input_dim=2, hidden_dim=8, output_dim=1, learning_rate=0.2)
    mlp.fit(X_data, y_data, epochs=1500)
    
    # Evaluate Accuracy
    y_pred = mlp.predict(X_data)
    accuracy = np.mean(y_pred == y_data)
    
    print("--- 3-Layer MLP Diagnostics ---")
    print(f"Input features dimension: {mlp.W1.shape[1]}")
    print(f"Hidden layer nodes count: {mlp.W1.shape[0]}")
    print(f"Derived output layer weights:\n", mlp.W2.flatten())
    print(f"Final Batch Training Accuracy: {accuracy * 100:.2f}%")
```

## System Constraints and Optimizations

Deploying neural architectures in high-throughput systems raises critical design challenges:

1. **Vanishing and Exploding Gradients**: As networks grow deeper, repeated multiplications in the backward pass chain rule cause gradients to shrink exponentially (vanishing, typical of Tanh/Sigmoid) or grow exponentially (exploding). To prevent this, engineers use **He (Kaiming) Initialization** for ReLU layers and **Xavier Initialization** for symmetric activations, alongside gradient clipping limits.
2. **Memory Alignment & Parallelism**: Vector operations are highly dependent on CPU cache lines and GPU registers. To maximize memory throughput, training uses **Mini-Batch Gradient Descent** rather than single-sample or full-batch updates, aligning dimensions to powers of 2 (e.g., 32, 64, 128) to leverage SIMD vectorization.
3. **Activation Underflow**: ReLUs can permanently de-activate (the "Dying ReLU" problem) if a massive gradient shifts parameter weights such that the node output is always negative. Implementing **Leaky ReLU** (which allows a minor slope for negative values) or **GELU** resolves this failure mode.

**Production Recommendation**: For robust neural network deployments, do not use vanilla SGD. Transition to adaptive learning-rate optimizers like **Adam** or **RMSprop** which scale gradients individually for each parameter based on historical updates.
