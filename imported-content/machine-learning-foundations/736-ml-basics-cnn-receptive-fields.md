# Computer Vision: Convolutional Neural Networks (CNNs) and Receptive Fields

## The Problem
Processing high-resolution images using standard Feedforward Neural Networks (MLPs) is mathematically intractable. A standard 1080p RGB image flattened into a 1D vector contains over 6 million inputs. A single hidden layer with 1,000 neurons would require a weight matrix of 6 billion parameters ($W \in \mathbb{R}^{1000 \times 6220800}$), leading to immediate out-of-memory errors and massive overfitting. Furthermore, MLPs destroy spatial hierarchies (the 2D relationship between adjacent pixels) by flattening the image. The engineering requirement is an architecture that extracts spatial features with parameter efficiency and translation invariance.

## Technical Architecture

Convolutional Neural Networks (CNNs) solve this using discrete cross-correlation (colloquially called convolution) and parameter sharing. 

### The Convolution Operation
Instead of connecting every input pixel to every neuron, a CNN slides a small filter (or kernel, e.g., $3 \times 3$) across the input tensor. 

Let $I$ be a 2D image and $K$ be a 2D kernel. The convolution at position $(i, j)$ is:
$$ (I * K)(i, j) = \sum_m \sum_n I(i-m, j-n) K(m, n) $$

- **Parameter Sharing:** The same kernel weights are applied across the entire image. A $3 \times 3$ kernel has only 9 parameters, regardless of whether the image is $28 \times 28$ or $4K$.
- **Local Connectivity:** Each output activation is connected to only a small local region of the input.

### The Receptive Field
The Receptive Field (RF) defines the region in the original input image that affects a specific neuron in the network. As you go deeper into a CNN via repeated Convolutions and Pooling (subsampling) layers, the receptive field grows.
- **Layer 1:** A neuron looking at a $3 \times 3$ patch has an RF of $3 \times 3$.
- **Layer 2:** If it applies a $3 \times 3$ kernel on Layer 1's output, it effectively "sees" a $5 \times 5$ patch of the original input.

By the final layers, a single neuron's receptive field spans the entire image, allowing it to aggregate low-level features (edges, corners) into high-level semantics (faces, cars).

```text
+---------------+      +---------------+      +---------------+      +-------------+
|               |      | Conv Layer 1  |      | Max Pooling   |      | Dense Layer |
| Input Image   | ---> | 3x3 Kernels   | ---> | 2x2 Stride 2  | ---> | Classifier  |
| H x W x 3     |      | Extracts Edges|      | Downsamples   |      | Outputs 1D  |
+---------------+      +---------------+      +---------------+      +-------------+
                         (Local RF)             (Expands RF)           (Global RF)
```

## Implementation

Modern CNN engineering utilizes deep learning frameworks (PyTorch, TensorFlow) because implementing highly optimized, parallelized convolutions (using algorithms like Winograd or im2col) from scratch in Python is inefficient. Below is a structural PyTorch implementation of a classic VGG-style CNN block demonstrating receptive field expansion.

```python
import torch
import torch.nn as nn

class SimpleCNN(nn.Module):
    def __init__(self, num_classes: int = 10):
        super(SimpleCNN, self).__init__()
        
        # Block 1: Input (B, 3, 32, 32) -> Output (B, 16, 16, 16)
        # Receptive Field expands.
        self.block1 = nn.Sequential(
            nn.Conv2d(in_channels=3, out_classes=16, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2)
        )
        
        # Block 2: Input (B, 16, 16, 16) -> Output (B, 32, 8, 8)
        self.block2 = nn.Sequential(
            nn.Conv2d(in_channels=16, out_channels=32, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2)
        )
        
        # Block 3: Input (B, 32, 8, 8) -> Output (B, 64, 4, 4)
        self.block3 = nn.Sequential(
            nn.Conv2d(in_channels=32, out_channels=64, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(kernel_size=2, stride=2)
        )
        
        # Classifier Head
        # Flattened size: 64 channels * 4 height * 4 width = 1024
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(1024, 128),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(128, num_classes)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.block1(x)
        x = self.block2(x)
        x = self.block3(x)
        x = self.classifier(x)
        return x

# Example Usage
if __name__ == "__main__":
    # Simulate a batch of 8 RGB images, 32x32 pixels (e.g., CIFAR-10)
    B, C, H, W = 8, 3, 32, 32
    dummy_input = torch.randn(B, C, H, W)
    
    model = SimpleCNN(num_classes=10)
    
    # Forward pass
    logits = model(dummy_input)
    print(f"Input shape: {dummy_input.shape}")
    print(f"Output logits shape: {logits.shape} (Batch Size, Num Classes)")
```

## System Constraints and Optimizations
CNNs are robust against minor spatial translations, but they are NOT natively scale or rotation invariant (an upside-down cat might fail classification). Engineering solutions involve heavy Data Augmentation (random crops, flips, scales) during training. 

In production environments, fully connected layers at the tail of the CNN dictate a fixed input size (e.g., $224 \times 224$). To support variable-resolution images dynamically, architecture paradigms replace the final `Flatten` + `Linear` layers with Global Average Pooling (GAP). GAP averages the spatial dimensions ($H \times W$) into a single value per channel, completely decoupling the network from rigid input resolution constraints.
