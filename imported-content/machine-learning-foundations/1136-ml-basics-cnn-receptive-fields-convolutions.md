# Computer Vision: Convolutional Neural Networks (CNNs) and Receptive Fields

## The Problem
Using standard Feedforward Neural Networks (MLPs) for images is catastrophically inefficient. Flattening a 256x256 RGB image creates 196,608 input nodes. A single dense hidden layer of 1,000 neurons would require nearly 200 million weights, guaranteeing extreme overfitting and memory exhaustion. Furthermore, MLPs discard 2D spatial context; a face in the top-left corner is treated entirely differently than a face in the bottom-right.

## Architectural Approach
**Convolutional Neural Networks (CNNs)** solve this by enforcing two architectural priors:
1. **Local Connectivity (Receptive Fields)**: Neurons only connect to a small, localized region of the input image (e.g., a 3x3 pixel window).
2. **Parameter Sharing**: The exact same weight matrix (the "filter" or "kernel") is slid (convolved) across the entire image. This allows the network to learn translation-invariant features—an edge detector learned in the top-left works in the bottom-right.

**Pooling Layers** subsequently downsample the spatial dimensions, increasing the field of view of deeper neurons and reducing computational load.

```text
    +-----------------+      +-----------------+      +-----------------+
    | Image (MxNx3)   | ---> | Conv Layer 1    | ---> | Max Pooling     |
    +-----------------+      | 32 Filters (3x3)|      | Pool Size (2x2) |
                             +-----------------+      +-----------------+
                                      |
                                      v
    +-----------------+      +-----------------+      +-----------------+
    | Fully Connected | <--- | Flatten Layer   | <--- | Conv Layer 2    |
    | (Dense) Output  |      |                 |      | 64 Filters (3x3)|
    +-----------------+      +-----------------+      +-----------------+
```

## Implementation

The following PyTorch/Torchvision code demonstrates a modern, robust definition of a CNN block, highlighting convolutions, pooling, and spatial dimension calculations.

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class BasicCNN(nn.Module):
    def __init__(self, num_classes=10):
        super(BasicCNN, self).__init__()
        
        # Block 1: Input (B, 3, 32, 32) -> Output (B, 16, 16, 16)
        # Conv2d: in_channels, out_channels, kernel_size, padding
        self.conv1 = nn.Conv2d(3, 16, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm2d(16)
        self.pool1 = nn.MaxPool2d(kernel_size=2, stride=2)
        
        # Block 2: Input (B, 16, 16, 16) -> Output (B, 32, 8, 8)
        self.conv2 = nn.Conv2d(16, 32, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm2d(32)
        self.pool2 = nn.MaxPool2d(kernel_size=2, stride=2)
        
        # Fully Connected (Dense) Layers
        # Spatial size is 8x8, with 32 channels: 32 * 8 * 8 = 2048
        self.fc1 = nn.Linear(32 * 8 * 8, 128)
        self.dropout = nn.Dropout(0.5)
        self.fc2 = nn.Linear(128, num_classes)

    def forward(self, x):
        # Feature Extraction
        x = self.pool1(F.relu(self.bn1(self.conv1(x))))
        x = self.pool2(F.relu(self.bn2(self.conv2(x))))
        
        # Flatten for Dense Layers
        x = torch.flatten(x, 1)
        
        # Classification
        x = F.relu(self.fc1(x))
        x = self.dropout(x)
        logits = self.fc2(x)
        
        return logits

# -------------------------
# Usage Example
# -------------------------
if __name__ == "__main__":
    # Create a dummy batch of 4 RGB images, size 32x32 (e.g., CIFAR-10 size)
    dummy_input = torch.randn(4, 3, 32, 32)
    model = BasicCNN(num_classes=10)
    
    # Forward pass
    output = model(dummy_input)
    print(f"Output Tensor Shape: {output.shape}") # Should be [4, 10]
```

## Trade-offs and Considerations
1. **Receptive Field Expansion**: Early layers detect simple edges. Because pooling shrinks the image, a 3x3 filter in a deep layer actually covers a massive chunk of the original image (detecting faces or wheels).
2. **Translation vs. Rotation**: Standard CNNs are translation-invariant (they find the cat regardless of where it is in the frame), but they are *not* naturally rotation or scale-invariant. Data augmentation is required to achieve robustness against rotation.
3. **Vanishing Details**: Max pooling aggressively discards spatial detail. For tasks requiring pixel-perfect accuracy (like Semantic Segmentation), architectures replace pooling with transposed convolutions (e.g., U-Net).
