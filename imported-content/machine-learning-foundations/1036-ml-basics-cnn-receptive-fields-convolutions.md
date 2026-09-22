# Computer Vision: Convolutional Neural Networks (CNNs) and Receptive Fields

## The Problem
Standard fully connected feedforward networks (MLPs) perform poorly on spatial grid datasets like high-resolution images. Flattening a modest image of size $512 \times 512 \times 3$ channels produces $786,432$ input nodes. Connecting this input directly to a hidden layer of $1,000$ units creates a parameter matrix containing $786$ million weights. This leads to immediate out-of-memory crashes and severe overfitting.

Furthermore, fully connected layers are not translation invariant. If a target object (e.g., a defect on a silicon wafer) shifts by a few pixels, its flattened numerical vector changes completely, forcing the network to relearn the object's representation at every possible image coordinates. The architectural challenge is to develop a spatially aware neural network that preserves parameter efficiency, enforces weight sharing, and models translation invariance.

## Technical Architecture

Convolutional Neural Networks (CNNs) solve image scaling limitations by using two fundamental design principles: local connectivity and parameter sharing.

```text
2D Convolution Step (Filter/Kernel size = 3x3, Stride = 1, Padding = 0)

Input Image (5x5)                 Filter (3x3)              Output Activation Map (3x3)
+---+---+---+---+---+                                       +-----+---+-----+
| 1 | 0 | 1 | 0 | 0 |             +---+---+---+             |  3  | 1 |  2  |
| 0 | 1 | 1 | 1 | 0 |   * (dot)   | 1 | 0 | 1 |    =====>     +-----+---+-----+
| 1 | 0 | 0 | 0 | 1 |             | 0 | 1 | 0 |             |     |   |     |
| 0 | 0 | 1 | 1 | 0 |             | 1 | 0 | 1 |             +-----+---+-----+
| 1 | 1 | 0 | 0 | 1 |             +---+---+---+             |     |   |     |
+---+---+---+---+---+                                       +-----+---+-----+
  \       /
   \     /  <-- Local Receptive Field of Layer 1 (Size = 3x3)
    v   v
  +-------+
  | Layer |  -- (Filter 3x3, Stride = 2) --> [ Layer 2 ] (Receptive Field grows to 7x7)
  +-------+
```

### 1. The 2D Convolution Operation
Instead of connecting every output pixel to every input pixel, a small weight matrix called a **Filter (or Kernel)** $K \in \mathbb{R}^{F \times F}$ slides across the input image $I \in \mathbb{R}^{W \times H}$. The 2D cross-correlation (commonly referred to as convolution) is formulated as:

$$ S(i, j) = (I * K)(i, j) = \sum_{m=0}^{F-1} \sum_{n=0}^{F-1} I(i + m, j + n) K(m, n) $$

### 2. Spatial Dimension Transitions
The spatial dimensions (width $W_{out}$ and height $H_{out}$) of an output activation map are governed by the input dimensions ($W_{in}$, $H_{in}$), the filter size $F$, the padding size $P$ (columns added to the borders), and the stride $S$ (step size of the sliding window):

$$ W_{out} = \left\lfloor \frac{W_{in} - F + 2P}{S} \right\rfloor + 1 $$
$$ H_{out} = \left\lfloor \frac{H_{in} - F + 2P}{S} \right\rfloor + 1 $$

### 3. Receptive Field Expansion
The **Receptive Field (RF)** of a specific neuron in layer $l$ is the localized spatial area in the original input image $I$ that directly influences that neuron's activation. As we stack convolutional layers, the receptive field grows. The receptive field at layer $l$ ($RF_l$) is calculated recursively:

$$ RF_l = RF_{l-1} + (F_l - 1) \cdot j_{l-1} $$

Where $j_{l-1}$ is the cumulative stride up to the previous layer, calculated as:

$$ j_l = j_{l-1} \cdot S_l \quad \text{with} \quad j_0 = 1 $$

This growth allows deeper layers to capture wider spatial context (e.g., high-level objects like faces or cars) while earlier layers capture granular features (e.g., edges or gradients).

## Implementation

The following is a Python class implementing a 2D single-channel convolution forward pass from scratch using NumPy, showing exactly how padding, stride, and kernel operations are handled.

```python
import numpy as np
from typing import Tuple

class Conv2DScratch:
    """
    Spatially-aware 2D Convolutional Layer built from scratch using NumPy.
    """
    def __init__(self, kernel: np.ndarray, stride: int = 1, padding: int = 0) -> None:
        self.kernel: np.ndarray = kernel # Shape (F, F)
        self.stride: int = stride
        self.padding: int = padding
        self.F: int = kernel.shape[0]

    def forward(self, I: np.ndarray) -> np.ndarray:
        """
        Executes a 2D convolution forward pass.
        
        Args:
            I: Input feature map / image of shape (H_in, W_in).
        """
        H_in, W_in = I.shape
        
        # Apply padding (constant zero padding)
        if self.padding > 0:
            I_padded = np.pad(I, pad_width=self.padding, mode='constant', constant_values=0)
        else:
            I_padded = I
            
        H_pad, W_padded = I_padded.shape
        
        # Calculate output activation dimensions
        H_out = int((H_pad - self.F) / self.stride) + 1
        W_out = int((W_padded - self.F) / self.stride) + 1
        
        output = np.zeros((H_out, W_out))
        
        # Sliding window convolution
        for i in range(H_out):
            for j in range(W_out):
                # Define sliding coordinate boundaries
                r_start = i * self.stride
                r_end = r_start + self.F
                c_start = j * self.stride
                c_end = c_start + self.F
                
                # Extract image patch
                image_patch = I_padded[r_start:r_end, c_start:c_end]
                
                # Perform element-wise multiplication and summation
                output[i, j] = np.sum(image_patch * self.kernel)
                
        return output

if __name__ == "__main__":
    # Define a 6x6 synthetic image (single channel)
    image = np.array([
        [1, 1, 1, 0, 0, 0],
        [0, 1, 1, 1, 0, 0],
        [0, 0, 1, 1, 1, 0],
        [0, 0, 0, 1, 1, 1],
        [0, 1, 1, 0, 0, 0],
        [0, 0, 1, 1, 0, 0]
    ], dtype=float)

    # Define a 3x3 Edge-Detection Filter (vertical Sobel-like filter)
    filter_kernel = np.array([
        [-1, 0, 1],
        [-2, 0, 2],
        [-1, 0, 1]
    ], dtype=float)

    # Initialize Convolutional Block (Stride=1, Padding=1)
    conv_block = Conv2DScratch(kernel=filter_kernel, stride=1, padding=1)
    output_map = conv_block.forward(image)
    
    # Calculate output receptive field after 2 consecutive layers
    # Layer 1: F=3, S=1. RF1 = 1 + (3 - 1) * 1 = 3. Cumulative Stride j1 = 1 * 1 = 1
    # Layer 2: F=3, S=2. RF2 = 3 + (3 - 1) * 1 = 5. Cumulative Stride j2 = 1 * 2 = 2
    rf_layer_1 = 3
    rf_layer_2 = rf_layer_1 + (3 - 1) * 1 # = 5
    
    print("--- 2D Convolution Layer Diagnostics ---")
    print("Input Image Shape:", image.shape)
    print("Filter Shape:", filter_kernel.shape)
    print("Activation Map Output Shape (with Padding=1):", output_map.shape)
    print(f"Layer 1 Receptive Field: {rf_layer_1}x{rf_layer_1}")
    print(f"Layer 2 Receptive Field: {rf_layer_2}x{rf_layer_2}")
    print("Output Activation Map:\n", output_map)
```

## System Constraints and Optimizations

Implementing convolutional layers at scale reveals critical hardware and compiler constraints:

1. **Sliding Window Loop Overhead**: Implementing nested loops (`for i` and `for j`) in Python or raw C is highly inefficient and fails to leverage hardware parallelism.
2. **The im2col Transformation**: High-performance deep learning libraries (like cuDNN or PyTorch) bypass sliding loops entirely. They use the **im2col (image-to-column)** algorithm to copy overlapping image patches into columns of a massive matrix, transforming the convolution operation into a single General Matrix Multiply (GEMM) optimized for GPU Tensor Cores.
3. **Pooling Compression Tradeoffs**: Max-pooling layers reduce feature map dimensionality and provide additional translation invariance. However, aggressive pooling destroys spatial resolution and coordinate details, which is highly problematic for tasks like semantic segmentation or object detection.

**Production Recommendation**: For edge computer vision deployments, replace heavy standard convolutions with **Depthwise Separable Convolutions** (used in MobileNet architectures). This splits standard convolution into a spatial channel filter and a $1 \times 1$ pointwise filter, reducing parameter counts and computational cost by up to 90%.
