# Computer Vision: Convolutional Neural Networks (CNNs) and Receptive Fields

## The Problem
Applying fully connected feedforward networks (MLPs) to image processing tasks introduces two fatal flaws:
1. **Dimensional Explosion**: A standard RGB image of size $1000 \times 1000$ pixels contains $3,000,000$ input values. A single fully connected hidden neuron would require 3 million weights. Scaling this to hundreds of neurons across multiple layers leads to billions of parameters, causing immediate Out-of-Memory (OOM) failures and extreme overfitting.
2. **Loss of Spatial Topology**: Flattening a 2D or 3D image array into a 1D vector completely discards spatial correlation. An MLP treats adjacent pixels the same way it treats pixels on opposite sides of the image. Consequently, if a target object shifts by a single pixel, the flattened representation changes entirely, destroying translation invariance.

We need a spatially-aware neural network architecture that maintains local relationships, enforces weight sharing to limit parameter scaling, and constructs translation-invariant visual representations.

## Technical Architecture

Convolutional Neural Networks (CNNs) resolve these issues by replacing global matrix multiplication with local mathematical **convolutions**.

### 1. The 2D Convolution Operation
Instead of connecting every pixel to every neuron, a convolutional layer slides a small, learnable weight matrix—called a **kernel** or **filter** ($K$)—across the input image ($I$). The output feature map ($S$) is computed by taking the element-wise product and summing the results:

$$ S(i,j) = (I * K)(i, j) = \sum_{m} \sum_{n} I(i + m, j + n) K(m, n) $$

```text
  Input Image (5x5)             Kernel (3x3)           Output Feature Map (3x3)
+---+---+---+---+---+                                        +---+---+---+
| 1 | 1 | 1 | 0 | 0 |                                        | 4 | 3 | 4 |
+---+---+---+---+---+           +---+---+---+                +---+---+---+
| 0 | 1 | 1 | 1 | 0 |   *       | 1 | 0 | 1 |       ===>     | 2 | 4 | 3 |
+---+---+---+---+---+           +---+---+---+                +---+---+---+
| 0 | 0 | 1 | 1 | 1 |           | 0 | 1 | 0 |                | 2 | 3 | 4 |
+---+---+---+---+---+           +---+---+---+                +---+---+---+
| 0 | 0 | 1 | 1 | 0 |           | 1 | 0 | 1 |
+---+---+---+---+---+           +---+---+---+
| 0 | 1 | 1 | 0 | 0 |
+---+---+---+---+---+
Sliding the 3x3 kernel over the top-left 3x3 input slice:
(1*1) + (1*0) + (1*1) + (0*0) + (1*1) + (1*0) + (0*1) + (0*0) + (1*1) = 4
```

### 2. Spatial Output Dimensions
The spatial dimensions of the output feature map (Width $O_w$ and Height $O_h$) are determined by the input size ($W$), filter size ($F$), padding size ($P$), and stride step ($S$):

$$ O = \lfloor \frac{W - F + 2P}{S} \rfloor + 1 $$

### 3. Receptive Fields
The **Receptive Field (RF)** of a specific feature in a given layer is the spatial area of the *original input image* that can influence its value. As we go deeper into a network, the receptive field increases. This allows shallow layers to extract low-level edges, while deep layers synthesize complex semantic objects (e.g., faces, cars).

The receptive field of layer $l$ ($RF_l$) is calculated recursively:

$$ RF_l = RF_{l-1} + (F_l - 1) \cdot j_{l-1} $$

Where the jump/stride accumulator $j_l$ is defined as:

$$ j_l = j_{l-1} \cdot S_l \quad (\text{with } j_0 = 1, RF_0 = 1) $$

## Implementation

Below is a pure NumPy execution of a forward 2D convolutional layer, implementing sliding windows and multi-channel summation.

```python
import numpy as np
from typing import Tuple

class CustomConv2D:
    def __init__(self, in_channels: int, out_channels: int, kernel_size: int, stride: int = 1, padding: int = 0) -> None:
        self.in_channels: int = in_channels
        self.out_channels: int = out_channels
        self.kernel_size: int = kernel_size
        self.stride: int = stride
        self.padding: int = padding
        
        # Initialize filters: shape (out_channels, in_channels, kernel_size, kernel_size)
        self.weights = np.random.randn(out_channels, in_channels, kernel_size, kernel_size) * np.sqrt(2.0 / (kernel_size * kernel_size * in_channels))
        self.bias = np.zeros((out_channels, 1))

    def _pad_image(self, X: np.ndarray) -> np.ndarray:
        """
        Applies zero-padding to the spatial borders of the input image.
        X shape: (batch_size, in_channels, height, width)
        """
        if self.padding == 0:
            return X
        return np.pad(
            X, 
            ((0, 0), (0, 0), (self.padding, self.padding), (self.padding, self.padding)), 
            mode='constant', 
            constant_values=0
        )

    def forward(self, X: np.ndarray) -> np.ndarray:
        """
        Computes forward convolution.
        Input X shape: (batch_size, in_channels, height, width)
        """
        batch_size, in_channels, h_in, w_in = X.shape
        X_padded = self._pad_image(X)
        
        # Calculate output spatial dimensions
        h_out = int((h_in - self.kernel_size + 2 * self.padding) / self.stride) + 1
        w_out = int((w_in - self.kernel_size + 2 * self.padding) / self.stride) + 1
        
        # Initialize output tensor: (batch_size, out_channels, h_out, w_out)
        out = np.zeros((batch_size, self.out_channels, h_out, w_out))
        
        # Execute the 2D sliding convolution
        for b in range(batch_size):
            for oc in range(self.out_channels):
                for i in range(h_out):
                    for j in range(w_out):
                        # Extract the slice of the input
                        h_start = i * self.stride
                        h_end = h_start + self.kernel_size
                        w_start = j * self.stride
                        w_end = w_start + self.kernel_size
                        
                        slice_x = X_padded[b, :, h_start:h_end, w_start:w_end]
                        
                        # Sum over all input channels + add bias
                        out[b, oc, i, j] = np.sum(slice_x * self.weights[oc]) + self.bias[oc]
                        
        return out

if __name__ == "__main__":
    # Generate dummy input: 1 image, 3 channels (RGB), size 5x5
    np.random.seed(42)
    input_image = np.random.randn(1, 3, 5, 5)
    
    # 3 input channels, 2 output filters, kernel size 3, stride 1, padding 1
    conv_layer = CustomConv2D(in_channels=3, out_channels=2, kernel_size=3, stride=1, padding=1)
    
    output_feature_map = conv_layer.forward(input_image)
    
    print("--- Custom 2D Convolution Output ---")
    print(f"Input Shape: {input_image.shape}")
    print(f"Output Feature Map Shape: {output_feature_map.shape} (Expected: 1, 2, 5, 5 due to padding=1)")
    print(f"Sample Output Pixels (Channel 0):\n{output_feature_map[0, 0]}")
```

## System Constraints and Optimizations
While the sliding loop implementation is highly pedagogical, executing nested loops in high-level languages like Python introduces extreme performance bottlenecks.

**Production GPU Acceleration (im2col + GEMM)**:
To perform high-throughput convolutions on GPUs, libraries like cuDNN bypass sliding loops entirely using the **im2col** operation:
1. Every sliding receptive field region in the multi-channel input is flattened into a single column.
2. The entire input image is restructured into a large 2D matrix.
3. The convolution is converted into a single, massive **General Matrix Multiplication (GEMM)**:
   $$ \text{Output} = \text{Weights} \times \text{im2col}(X) $$
This leverages heavily optimized parallel hardware execution paths on Nvidia CUDA cores.

```text
               GPU Acceleration Pipeline via im2col
  [ 3D Input Tensor ] ----> [ im2col Transform ] ----> [ 2D Matrix (GEMM-ready) ]
                                                            |
  [ 4D Weight Tensor ] ---> [ Flatten Filter Weights ] ---> | Multiplied on GPU
                                                            v
  [ 3D Output Tensor ] <--- [ col2im Transform ] <---- [ 2D Matrix Output ]
```
