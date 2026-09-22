# Deep Learning 101: Feedforward Neural Networks and Backpropagation

## The Problem
Linear models and shallow learners fundamentally fail to approximate highly complex, non-linear functions (like XOR logic, image categorization, or language modeling). Feature engineering can force non-linearity via polynomial expansions, but this scales poorly. The engineering necessity is a flexible architecture capable of Universal Function Approximation—learning hierarchical, non-linear representations directly from raw data without manual feature extraction.

## Technical Architecture

The Feedforward Neural Network (Multilayer Perceptron or MLP) achieves this. It consists of an input layer, one or more hidden layers, and an output layer. Nodes (neurons) in sequential layers are fully connected via weight matrices.

### Forward Propagation
Data flows strictly forward. For layer $l$:
$$ Z^{[l]} = W^{[l]} A^{[l-1]} + b^{[l]} $$
$$ A^{[l]} = g(Z^{[l]}) $$
Where:
- $W^{[l]}$ is the weight matrix mapping layer $l-1$ to $l$.
- $b^{[l]}$ is the bias vector.
- $g(\cdot)$ is a non-linear activation function (e.g., ReLU, Sigmoid).
- $A^{[0]}$ is the input $X$.

### Backpropagation and the Chain Rule
To optimize the weights, we minimize a Loss function $L$. Backpropagation computes the gradient of $L$ with respect to every weight and bias by applying the Calculus Chain Rule backward from the output layer to the input layer.

For the output layer $L$:
$$ dZ^{[L]} = A^{[L]} - Y \quad \text{(Assuming Cross-Entropy Loss with Softmax/Sigmoid)} $$
$$ dW^{[L]} = \frac{1}{m} dZ^{[L]} (A^{[L-1]})^T $$

For intermediate hidden layers $l$:
$$ dZ^{[l]} = ((W^{[l+1]})^T dZ^{[l+1]}) * g'(Z^{[l]}) $$
$$ dW^{[l]} = \frac{1}{m} dZ^{[l]} (A^{[l-1]})^T $$
$$ db^{[l]} = \frac{1}{m} \sum dZ^{[l]} $$

```text
       Forward Pass: Computes Predictions and Loss
 X  --> [ W1, b1, g1 ] --> A1 --> [ W2, b2, g2 ] --> A2 --> Loss
               |                        |
               v                        v
 dW1 <-- [ Chain Rule ] <-- dZ1 <-- [ Chain Rule ] <-- dZ2 <-- dLoss
       Backward Pass: Computes Gradients (Backpropagation)
```

## Implementation

Below is a robust, minimal numpy-based implementation of a 2-layer Neural Network (one hidden layer, one output layer) tailored for binary classification to explicitly demonstrate forward and backward passes.

```python
import numpy as np

class TwoLayerNeuralNetwork:
    def __init__(self, input_dim: int, hidden_dim: int, output_dim: int, lr: float = 0.01):
        self.lr = lr
        
        # He initialization for ReLU
        self.W1 = np.random.randn(hidden_dim, input_dim) * np.sqrt(2. / input_dim)
        self.b1 = np.zeros((hidden_dim, 1))
        
        # Xavier/Standard initialization for Sigmoid output
        self.W2 = np.random.randn(output_dim, hidden_dim) * np.sqrt(1. / hidden_dim)
        self.b2 = np.zeros((output_dim, 1))

    def _relu(self, Z: np.ndarray) -> np.ndarray:
        return np.maximum(0, Z)

    def _relu_derivative(self, Z: np.ndarray) -> np.ndarray:
        return (Z > 0).astype(float)

    def _sigmoid(self, Z: np.ndarray) -> np.ndarray:
        Z = np.clip(Z, -250, 250)
        return 1. / (1. + np.exp(-Z))

    def fit(self, X: np.ndarray, Y: np.ndarray, epochs: int = 1000) -> None:
        """
        X: shape (input_dim, m)
        Y: shape (output_dim, m)
        """
        m = X.shape[1]

        for epoch in range(epochs):
            # --- Forward Pass ---
            Z1 = np.dot(self.W1, X) + self.b1
            A1 = self._relu(Z1)
            
            Z2 = np.dot(self.W2, A1) + self.b2
            A2 = self._sigmoid(Z2) # Output predictions

            # --- Backward Pass ---
            # Derivative of Binary Cross Entropy with Sigmoid simplifies to A - Y
            dZ2 = A2 - Y
            dW2 = (1 / m) * np.dot(dZ2, A1.T)
            db2 = (1 / m) * np.sum(dZ2, axis=1, keepdims=True)

            dA1 = np.dot(self.W2.T, dZ2)
            dZ1 = dA1 * self._relu_derivative(Z1)
            dW1 = (1 / m) * np.dot(dZ1, X.T)
            db1 = (1 / m) * np.sum(dZ1, axis=1, keepdims=True)

            # --- Gradient Descent Update ---
            self.W1 -= self.lr * dW1
            self.b1 -= self.lr * db1
            self.W2 -= self.lr * dW2
            self.b2 -= self.lr * db2

    def predict(self, X: np.ndarray) -> np.ndarray:
        Z1 = np.dot(self.W1, X) + self.b1
        A1 = self._relu(Z1)
        Z2 = np.dot(self.W2, A1) + self.b2
        A2 = self._sigmoid(Z2)
        return (A2 > 0.5).astype(int)

# Example Usage
if __name__ == "__main__":
    # Generate non-linear XOR-like data
    np.random.seed(42)
    X = np.random.randn(2, 400)
    # Y is 1 if inputs have same sign, 0 otherwise (XOR-ish)
    Y = np.logical_xor(X[0, :] > 0, X[1, :] > 0).astype(int).reshape(1, 400)

    nn = TwoLayerNeuralNetwork(input_dim=2, hidden_dim=16, output_dim=1, lr=0.1)
    nn.fit(X, Y, epochs=2000)
    
    preds = nn.predict(X)
    accuracy = np.mean(preds == Y)
    print(f"Training Accuracy on non-linear XOR data: {accuracy * 100:.2f}%")
```

## System Constraints and Optimizations
Training deep neural networks incurs severe gradient challenges. As networks stack deeper layers, backpropagated gradients tend to vanish (shrink to zero, halting learning in early layers) or explode (causing numerical overflow). Sigmoid activations heavily exacerbate the Vanishing Gradient problem due to derivative saturation at $\sim 0$; modern architectures mandate ReLU (or variants like GELU) for hidden layers. 

Furthermore, parameter initialization cannot be symmetric (all zeros), or all neurons compute the identical gradient. Production models demand Variance-Preserving initializations (He Initialization for ReLU, Xavier for Tanh/Sigmoid) and hardware accelerators (GPUs/TPUs) to batch-process the immense dense matrix multiplications via architectures like PyTorch or TensorFlow, which automate the autodiff computation graphs shown above.
