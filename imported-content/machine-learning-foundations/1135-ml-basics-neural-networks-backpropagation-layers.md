# Deep Learning 101: Feedforward Neural Networks and Backpropagation

## The Problem
Linear models and shallow trees struggle to learn highly abstract, hierarchical features from raw data (like pixels or audio waves). To solve complex non-linear problems, a system must algorithmically composite simple features into complex representations. The challenge is constructing a multi-layered architecture and defining a mathematical process to update thousands (or millions) of parameters simultaneously based on a single scalar error value.

## Architectural Approach
**Feedforward Neural Networks (MLPs)** organize neurons into layers: an input layer, hidden layers, and an output layer. Each connection has a weight ($w$), and each neuron has a bias ($b$) and a non-linear activation function (e.g., ReLU).

**Backpropagation** is the engine of Deep Learning. It applies the mathematical **Chain Rule** of calculus to compute the gradient of the loss function with respect to every single weight in the network, working backwards from the output layer to the input layer.

```text
    [Forward Pass: Inference]
    Input X ---> [W1, b1] ---> ReLU ---> [W2, b2] ---> Sigmoid ---> Output Y^
                                                                        |
                                                                        v
                                                                   Compute Loss L
                                                                        |
    [Backward Pass: Gradients]                                          |
    Update W1 <--- dL/dW1 <--- dL/dA1 <--- dL/dW2 <---------------------+
```

## Implementation

This Python snippet demonstrates a minimal 2-layer neural network from scratch using NumPy, focusing explicitly on the matrix multiplication of the forward pass and the derivative chain rule of the backward pass.

```python
import numpy as np

class MinimalNeuralNet:
    def __init__(self, input_size, hidden_size, output_size):
        # Initialize weights with small random values to break symmetry
        self.W1 = np.random.randn(input_size, hidden_size) * 0.01
        self.b1 = np.zeros((1, hidden_size))
        
        self.W2 = np.random.randn(hidden_size, output_size) * 0.01
        self.b2 = np.zeros((1, output_size))

    def relu(self, Z):
        return np.maximum(0, Z)

    def relu_derivative(self, Z):
        return (Z > 0).astype(float)

    def sigmoid(self, Z):
        return 1 / (1 + np.exp(-Z))

    def forward(self, X):
        # Layer 1
        self.Z1 = np.dot(X, self.W1) + self.b1
        self.A1 = self.relu(self.Z1)
        
        # Layer 2 (Output)
        self.Z2 = np.dot(self.A1, self.W2) + self.b2
        self.A2 = self.sigmoid(self.Z2)
        
        return self.A2

    def backward(self, X, y, learning_rate=0.1):
        m = X.shape[0]
        
        # Derivative of Binary Cross Entropy Loss w.r.t Z2
        dZ2 = self.A2 - y
        
        # Gradients for Layer 2
        dW2 = (1 / m) * np.dot(self.A1.T, dZ2)
        db2 = (1 / m) * np.sum(dZ2, axis=0, keepdims=True)
        
        # Chain rule back to Layer 1
        dA1 = np.dot(dZ2, self.W2.T)
        dZ1 = dA1 * self.relu_derivative(self.Z1)
        
        # Gradients for Layer 1
        dW1 = (1 / m) * np.dot(X.T, dZ1)
        db1 = (1 / m) * np.sum(dZ1, axis=0, keepdims=True)
        
        # Update Weights (Gradient Descent)
        self.W1 -= learning_rate * dW1
        self.b1 -= learning_rate * db1
        self.W2 -= learning_rate * dW2
        self.b2 -= learning_rate * db2

# -------------------------
# Usage Example
# -------------------------
if __name__ == "__main__":
    # XOR Problem (Non-linear)
    X = np.array([[0,0], [0,1], [1,0], [1,1]])
    y = np.array([[0], [1], [1], [0]])

    nn = MinimalNeuralNet(input_size=2, hidden_size=4, output_size=1)
    
    for epoch in range(10000):
        preds = nn.forward(X)
        nn.backward(X, y, learning_rate=0.5)

    print("Predictions after training:")
    print(np.round(nn.forward(X), 3))
```

## Trade-offs and Considerations
1. **Vanishing Gradients**: As networks get deeper, multiplying many small derivatives during backpropagation can cause gradients to shrink to zero, stopping early layers from learning. ReLU activation helps mitigate this compared to Sigmoid.
2. **Computational Cost**: Unlike algorithms with closed-form solutions (like linear regression), neural networks require thousands of iterative forward and backward passes. This necessitates hardware acceleration via GPUs and Matrix Multiplication Units (Tensor Cores).
3. **Overfitting Capability**: Neural networks have immense capacity. Without regularization (Dropout, L2 weight decay) and large amounts of data, they will perfectly memorize the training set and fail to generalize.
