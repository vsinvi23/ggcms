# Computer Vision: Convolutional Neural Networks (CNNs) and Receptive Fields

## The Problem
While traditional Multi-Layer Perceptrons (MLPs) can theoretically approximate non-linear functions, they scale incredibly poorly to image data. For instance, a modest $1000 \times 1000$ pixel RGB image flattened yields 3 million input features. Connecting this input to a single hidden layer of 1000 neurons results in 3 billion parameters. This massive size causes immediate out-of-memory errors and catastrophic overfitting. 

Furthermore, MLPs are spatially blind. They treat pixels that are geometrically adjacent the same as pixels that are far apart, failing to leverage spatial correlation. An MLP also lacks translation invariance; if an object shifts by just a few pixels, the flattened vector pattern changes entirely, forcing the network to relearn the object from scratch at the new position. We need a spatially aware architecture that uses localized feature extraction, shares weights to bound parameter complexity, and builds translation-invariant representations.

## Technical Architecture

Convolutional Neural Networks (CNNs) solve this problem by introducing two core concepts: **spatial local connectivity** and **parameter (weight) sharing**.

### 1. The Convolution Operation
Rather than connecting every input pixel to every neuron, a CNN slides a small parameter matrix called a **kernel (or filter)** across the input image. Mathematically, the 2D discrete convolution of an input image $I$ with a kernel $K \in \mathbb{R}^{f \times f}$ is defined as:

$$ S(i, j) = (I * K)(i, j) = \sum_{m=0}^{f-1} \sum_{n=0}^{f-1} I(i + m, j + n) \cdot K(m, n) $$

```text
  Input Image (I)                 Kernel (K)              Output Feature Map (S)
+---+---+---+---+---+                                    +----+---+---+
| 1 | 0 | 1 | 2 | 0 |                                    |  7 | 6 | 8 |
+---+---+---+---+---+             +---+---+              +----+---+---+
| 0 | 3 | 2 | 1 | 1 |   * (conv)  | 2 | 1 |   =======>   |  9 | 8 | 5 |
+---+---+---+---+---+             +---+---+              +----+---+---+
| 1 | 1 | 0 | 0 | 2 |             | 0 | 1 |              |  5 | 2 | 4 |
+---+---+---+---+---+             +---+---+              +----+---+---+
| 2 | 0 | 1 | 1 | 0 |                                    (Size computed by formula)
+---+---+---+---+---+
```

### 2. Output Dimension Formula
The spatial width ($W_{\text{out}}$) and height ($H_{\text{out}}$) of the output feature map depend on the input dimension ($W$), kernel size ($F$), padding ($P$), and stride ($S$):

$$ W_{\text{out}} = \left\lfloor \frac{W - F + 2P}{S} \right\rfloor + 1 $$

* **Padding ($P$)**: Padding borders with zeros. *Same* padding ($P = \frac{F-1}{2}$) keeps input and output dimensions identical when $S=1$. *Valid* padding ($P=0$) performs no padding.
* **Stride ($S$)**: The step size of the sliding window. Higher strides downsample the output.

### 3. Receptive Fields
The **Receptive Field** is the local region of the input image that a particular unit in a deep CNN layer is sensitive to. 
* A single unit in Layer 1 with a $3 \times 3$ kernel has a receptive field of $3 \times 3$ on the input image.
* If Layer 2 also uses a $3 \times 3$ kernel over Layer 1's output, a unit in Layer 2 sees a $3 \times 3$ region of Layer 1, which corresponds to a $5 \times 5$ region of the original input.

As depth increases, the receptive field grows exponentially. This allows early layers to focus on fine details (edges, textures) while deep layers capture high-level semantic structures (faces, objects).

## Implementation

The following code is a vectorized NumPy implementation of a 2D Convolutional Layer forward pass. It supports custom padding and strides, and explicitly calculates the spatial output maps.

```python
import numpy as np
from typing import Tuple

class Convolution2DLayer:
    def __init__(self, kernel: np.ndarray, stride: int = 1, padding: int = 0) -> None:
        """
        Args:
            kernel: 2D numpy array representing filter weights.
            stride: Stride of the sliding window.
            padding: Padding applied to the borders of the input image.
        """
        self.kernel: np.ndarray = kernel
        self.stride: int = stride
        self.padding: int = padding
        self.F: int = kernel.shape[0]  # Assuming square filter (F, F)

    def _apply_padding(self, X: np.ndarray) -> np.ndarray:
        if self.padding == 0:
            return X
        return np.pad(X, pad_width=self.padding, mode='constant', constant_values=0)

    def forward(self, X: np.ndarray) -> np.ndarray:
        """
        Executes the 2D spatial convolution forward pass.
        Args:
            X: 2D grayscale input image of shape (H, W).
        Returns:
            Output feature map of shape (H_out, W_out).
        """
        H, W = X.shape
        X_padded = self._apply_padding(X)
        Hp, Wp = X_padded.shape

        # Calculate output dimensions
        H_out = int((Hp - self.F) / self.stride) + 1
        W_out = int((Wp - self.F) / self.stride) + 1

        output_map = np.zeros((H_out, W_out))

        # Perform the sliding window cross-correlation/convolution
        for i in range(H_out):
            for j in range(W_out):
                # Calculate sliding window coordinates
                h_start = i * self.stride
                h_end = h_start + self.F
                w_start = j * self.stride
                w_end = w_start + self.F

                # Extract local receptive region and multiply element-wise with kernel
                receptive_region = X_padded[h_start:h_end, w_start:w_end]
                output_map[i, j] = np.sum(receptive_region * self.kernel)

        return output_map

if __name__ == "__main__":
    # Generate mock 7x7 grayscale image
    np.random.seed(42)
    image = np.array([
        [1, 2, 3, 0, 0, 1, 1],
        [0, 1, 2, 4, 1, 0, 0],
        [1, 0, 1, 1, 2, 1, 1],
        [2, 2, 0, 0, 1, 2, 2],
        [0, 1, 3, 1, 0, 0, 1],
        [1, 1, 1, 0, 0, 2, 2],
        [2, 0, 0, 1, 1, 1, 1]
    ], dtype=float)

    # Edge detection Sobel Filter (horizontal gradient)
    sobel_filter = np.array([
        [-1, -2, -1],
        [ 0,  0,  0],
        [ 1,  2,  1]
    ], dtype=float)

    # Instantiate layer with Sobel filter, Stride 1, Same padding (P=1)
    conv_layer = Convolution2DLayer(kernel=sobel_filter, stride=1, padding=1)
    feature_map = conv_layer.forward(image)

    print("--- Convolution Forward Pass Results ---")
    print(f"Input Shape: {image.shape}")
    print(f"Output Feature Map Shape (Stride=1, Padding=1): {feature_map.shape}")
    print(f"Calculated Feature Map:\n{np.round(feature_map, 2)}")
    
    # Try different configuration: Stride 2, No padding (P=0)
    conv_downsample = Convolution2DLayer(kernel=sobel_filter, stride=2, padding=0)
    downsampled_map = conv_downsample.forward(image)
    print(f"\nDownsampled Map Shape (Stride=2, Padding=0): {downsampled_map.shape}")
    print(f"Downsampled Map:\n{np.round(downsampled_map, 2)}")
```

## System Constraints and Optimizations
Convolutional operations run on nested spatial loops, which are highly inefficient:

1. **Sliding Window Performance Bottleneck**: Executing nested Python loops to slide windows over massive images scales poorly on standard CPUs. Production deep learning frameworks (like PyTorch and TensorFlow) bypass standard loops by flattening the local image windows into a single matrix, a process known as **`im2col`**. This translates the convolution operation into a single massive, highly parallelized General Matrix Multiplication (GEMM) executed directly on CUDA-enabled GPUs.
2. **Spatial Resolution Loss**: Repeated convolution operations (especially with striding or pooling) cause spatial resolution to decay rapidly in deeper layers. This poses a major issue for pixel-precise segmentation models (such as medical imaging segmentations). 

**Production Recommendation**: To maintain spatial coordinates while expanding receptive fields, leverage **skip connections** (as in U-Net or ResNet architectures) to route high-resolution features from early layers directly to deeper decoder layers.
