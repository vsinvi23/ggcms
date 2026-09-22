# Deep Learning 101: Feedforward Neural Networks and Backpropagation

While linear models and decision tree ensembles excel at analyzing structured, tabular data, they struggle to model unstructured, high-dimensional inputs like raw images, speech, or text. Stacking linear predictors with non-linear activation functions forms a Multi-Layer Perceptron (MLP), or a Feedforward Neural Network. These networks can act as universal function approximators, learning nested, hierarchical representations. The core algorithm that enables deep models to learn from data is **Backpropagation**, an elegant, vectorized application of the mathematical **Chain Rule**.

---

## The Problem: Credit Assignment in Hierarchical Networks

In a single-layer model, the relationship between a parameter change and the final prediction error is direct. In a multi-layer network, however, we face the **credit assignment problem**: when the final output is wrong, how do we determine which specific weights in the hidden layers contributed to the error, and by how much?

To solve this, we must pass the input forward through the network to calculate the error (the **Forward Pass**), and then propagate that error *backward* through the layers using the derivative Chain Rule to compute the gradient of the loss with respect to every single parameter (the **Backward Pass**).

---

## Technical Architecture of a 2-Layer Neural Network

A standard feedforward network consists of an input layer, one or more hidden layers, and an output layer.

```
     Input x          Hidden Layer (a^[1])      Output Layer (a^[2] or pred)
     +----+           +----------------+           +----------------+
     | x1 | --------> |  z1 = W1*x+b1  | --------> |  z2 = W2*a1+b2 |
     |    |   W1, b1  |  a1 = ReLU(z1) |   W2, b2  |  a2 = Sig(z2)  | ---> Loss L(y, a2)
     | x2 | --------> |                | --------> |                |
     +----+           +----------------+           +----------------+
        |                                                   |
        |<=================== BACKPROP =====================|
                     (Error gradients dW2, db2, dW1, db1)
```

The mathematical computation for a 2-layer network (1 hidden layer, 1 output layer) is formulated as:

### 1. The Forward Pass
$$\text{Hidden Layer logit: } Z^{[1]} = X W^{[1]} + b^{[1]}$$

$$\text{Hidden Layer activation: } a^{[1]} = \text{ReLU}(Z^{[1]}) = \max(0, Z^{[1]})$$

$$\text{Output Layer logit: } Z^{[2]} = a^{[1]} W^{[2]} + b^{[2]}$$

$$\text{Output Layer prediction: } a^{[2]} = \sigma(Z^{[2]}) = \frac{1}{1 + e^{-Z^{[2]}}}$$

### 2. Loss Function (Binary Cross Entropy)
$$\mathcal{L} = -\frac{1}{m} \sum \left( Y \log(a^{[2]}) + (1-Y)\log(1-a^{[2]}) \right)$$

### 3. The Backward Pass (Applying the Chain Rule)
To update our weights, we calculate the partial derivatives of the loss ($\mathcal{L}$) with respect to each parameter weight matrix $W$ and bias vector $b$.

For the output layer:
$$dZ^{[2]} = a^{[2]} - Y$$

$$dW^{[2]} = \frac{1}{m} (a^{[1]})^T dZ^{[2]}, \quad db^{[2]} = \frac{1}{m} \sum dZ^{[2]}$$

For the hidden layer (propagating the gradient backward):
$$dZ^{[1]} = \left( dZ^{[2]} (W^{[2]})^T \right) \odot g'^{[1]}(Z^{[1]})$$

where $\odot$ represents the element-wise Hadamard product, and $g'^{[1]}(Z^{[1]})$ is the derivative of the ReLU activation function (which is $1$ for $z > 0$ and $0$ otherwise).

$$dW^{[1]} = \frac{1}{m} X^T dZ^{[1]}, \quad db^{[1]} = \frac{1}{m} \sum dZ^{[1]}$$

---

## Complete Vectorized Implementation in NumPy

Below is a complete, vectorized, object-oriented implementation of a 2-layer Neural Network trained using Gradient Descent.

```python
import numpy as np

class TwoLayerNeuralNetwork:
    def __init__(self, input_dim: int, hidden_dim: int, output_dim: int, learning_rate: float = 0.1):
        self.lr = learning_rate
        
        # He (Kaiming) Initialization for W1, Xavier Initialization for W2
        self.W1 = np.random.randn(input_dim, hidden_dim) * np.sqrt(2.0 / input_dim)
        self.b1 = np.zeros((1, hidden_dim))
        
        self.W2 = np.random.randn(hidden_dim, output_dim) * np.sqrt(1.0 / hidden_dim)
        self.b2 = np.zeros((1, output_dim))

    def _relu(self, z: np.ndarray) -> np.ndarray:
        return np.maximum(0, z)

    def _relu_derivative(self, z: np.ndarray) -> np.ndarray:
        return (z > 0).astype(float)

    def _sigmoid(self, z: np.ndarray) -> np.ndarray:
        return 1.0 / (1.0 + np.exp(-np.clip(z, -500, 500)))

    def forward(self, X: np.ndarray):
        """
        X: (m_samples, input_dim)
        """
        self.Z1 = np.dot(X, self.W1) + self.b1
        self.a1 = self._relu(self.Z1)
        
        self.Z2 = np.dot(self.a1, self.W2) + self.b2
        self.a2 = self._sigmoid(self.Z2)
        return self.a2

    def backward(self, X: np.ndarray, Y: np.ndarray):
        """
        Y: (m_samples, output_dim)
        """
        m = X.shape[0]

        # 1. Output Layer Gradients
        dZ2 = self.a2 - Y
        dW2 = (1.0 / m) * np.dot(self.a1.T, dZ2)
        db2 = (1.0 / m) * np.sum(dZ2, axis=0, keepdims=True)

        # 2. Hidden Layer Gradients (Backpropagating error)
        dZ1 = np.dot(dZ2, self.W2.T) * self._relu_derivative(self.Z1)
        dW1 = (1.0 / m) * np.dot(X.T, dZ1)
        db1 = (1.0 / m) * np.sum(dZ1, axis=0, keepdims=True)

        # 3. Parameter Updates (SGD Step)
        self.W2 -= self.lr * dW2
        self.b2 -= self.lr * db2
        self.W1 -= self.lr * dW1
        self.b1 -= self.lr * db1

    def fit(self, X: np.ndarray, Y: np.ndarray, epochs: int = 2000):
        for epoch in range(epochs):
            self.forward(X)
            self.backward(X, Y)
```

---

## Developer Takeaways

* **Avoid Zero Weight Initialization:** In linear models, initializing weights to zero is perfectly fine. In neural networks, initializing weights to zeros causes all neurons in a hidden layer to compute identical outputs and gradients, trapping them in symmetry. Always use randomized initialization like He or Xavier scaling.
* **The Vanishing Gradient Problem:** Deep networks with Tanh or Sigmoid activation functions suffer from vanishing gradients. Because the maximum derivative of the Sigmoid function is $0.25$, multiplying these tiny values across multiple layers during backpropagation causes gradients to shrink exponentially, stalling learning in the early layers. Using **ReLU** prevents this issue.
* **Batching is Mandatory:** For massive datasets, do not execute Batch Gradient Descent (calculating gradients over all samples). Instead, utilize **Mini-batch Gradient Descent**, which calculates gradients on small, randomized blocks (e.g., batch sizes of 32 or 64) to accelerate training and help escape local minima.
