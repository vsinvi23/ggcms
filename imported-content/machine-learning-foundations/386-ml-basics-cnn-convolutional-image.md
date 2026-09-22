# Computer Vision: Convolutional Neural Networks (CNNs) and Feature Extraction

When processing grid-structured data like images, classical fully connected neural networks suffer from severe structural design flaws. Flattening a $256 \times 256 \times 3$ color image into a single vector yields $196,608$ input nodes. Stacking just one hidden layer with $1,024$ neurons creates over $200\text{ million}$ weights. This design ignores the 2D spatial relationships of pixels and causes immediate, massive overfitting. Convolutional Neural Networks (CNNs) solve this problem by leveraging **local receptive fields**, **parameter sharing**, and **spatial downsampling (pooling)** to extract translation-invariant features.

---

## The Problem: Spatial Destruction and Parameter Explosion

Fully connected networks treat pixel indices $(0, 1)$ and $(0, 255)$ with the exact same mathematical priority as adjacent pixels $(0, 1)$ and $(0, 2)$. In reality, image features are highly localized—pixels close to each other are highly correlated, forming edges, textures, and shapes. 

To preserve spatial topology and prevent parameter counts from exploding, we need a mathematical operator that slides across the image grid, searching for localized patterns regardless of where they appear in the frame (translation invariance). This operator is the **Convolution**.

---

## Technical Architecture of a Convolutional Layer

A CNN processes grid data by stacking convolution, non-linear activation (ReLU), and pooling layers in a hierarchical sequence.

```
     Input Image [H x W x C] ---> [ Convolution (Kernel K x K) ] ---> Feature Map [H' x W' x F]
                                                |
                                                v
                                         [ ReLU Activation ]
                                                |
                                                v
                                      [ Max Pooling (2x2) ] ---> Subsampled Map [H'' x W'' x F]
                                                |
                                                v
                                          [ Flatten / FC ] ---> Output Classes
```

### 1. The 2D Convolution Operation
The convolution of an image $I$ with a 2D kernel (filter) $K$ of size $m \times n$ is defined mathematically at pixel coordinate $(i, j)$ as:

$$S(i, j) = (I * K)(i, j) = \sum_{u=-a}^{a} \sum_{v=-b}^{b} I(i-u, j-v) K(u, v)$$

During this operation, the kernel slides across the input image. At each step, it performs element-wise multiplication with the local image patch and sums the results, projecting them into a single pixel of the output feature map.

### 2. Output Dimension Formula
The size of the output feature map is controlled by four parameters: input size ($W$), kernel size ($K$), padding ($P$), and stride ($S$). The output dimension ($O$) is calculated as:

$$O = \left\lfloor \frac{W - K + 2P}{S} \right\rfloor + 1$$

* **Padding ($P$):** Adding columns/rows of zeros around the boundary of the input image to prevent spatial size shrinkage and keep edge pixels from being under-represented.
* **Stride ($S$):** The step size (in pixels) with which the kernel slides across the grid.

### 3. Pooling (Downsampling)
Pooling layers reduce the spatial size of feature maps, decreasing the computational cost and parameter count in subsequent layers. The most common form is **Max Pooling**, which extracts the maximum value from a sliding patch (e.g., $2 \times 2$ with a stride of 2), enforcing local translation invariance.

---

## Vectorized Implementation of 2D Convolution in NumPy

The following Python code implements a 2D convolution forward pass from scratch, complete with custom padding and stride.

```python
import numpy as np

def convolve2d_forward(image: np.ndarray, kernel: np.ndarray, padding: int = 0, stride: int = 1) -> np.ndarray:
    """
    Performs a 2D convolution forward pass over a single-channel image.
    image: 2D array of shape (H, W)
    kernel: 2D array of shape (Kh, Kw)
    padding: number of zero rows/cols to add around boundary
    stride: step size
    """
    H, W = image.shape
    Kh, Kw = kernel.shape

    # 1. Apply Zero Padding
    if padding > 0:
        image_padded = np.pad(image, pad_width=padding, mode='constant', constant_values=0)
    else:
        image_padded = image.copy()

    Hp, Wp = image_padded.shape

    # 2. Compute Output Dimensions
    out_h = int((Hp - Kh) / stride) + 1
    out_w = int((Wp - Kw) / stride) + 1
    
    output = np.zeros((out_h, out_w))

    # 3. Perform Sliding Window Convolution
    for i in range(out_h):
        for j in range(out_w):
            h_start = i * stride
            h_end = h_start + Kh
            w_start = j * stride
            w_end = w_start + Kw
            
            # Extract local receptive field patch
            image_patch = image_padded[h_start:h_end, w_start:w_end]
            
            # Element-wise product and sum
            output[i, j] = np.sum(image_patch * kernel)

    return output
```

---

## Developer Takeaways

* **Parameter Sharing:** Instead of having a unique weight for every pixel connection, a single filter uses the exact same weight matrix across the entire image. This design choice dramatically reduces the model's parameters and forces it to learn features that are position-independent.
* **Spatial Hierarchies:** Early layers in a CNN learn low-level primitive features (lines, edges, corners). Middle layers group those primitives to learn textures and parts (eyes, wheels). Deep layers aggregate these parts to learn high-level semantic representations (faces, cars).
* **Max vs. Average Pooling:** Max pooling is generally preferred for feature extraction because it acts as an "activation detector"—retaining the strongest presence of a feature. Average pooling acts as a smoothing filter, which is sometimes used at the very end of modern networks (Global Average Pooling) to replace dense layers.
