# Fine-Tuning LLMs: Parameter-Efficient LoRA and QLoRA NF4 Quantization

**The Problem:** Fine-tuning large language models (LLMs) via full-parameter updates requires updating billions of weights. This demands massive VRAM for the optimizer states (e.g., Adam uses 2 additional parameters per model parameter) and gradients. Fine-tuning a 70B parameter model in FP16 would require over 1.5 TB of VRAM. Parameter-Efficient Fine-Tuning (PEFT) methods are required to democratize AI.

## LoRA: Low-Rank Adaptation

LoRA freezes the pre-trained model weights and injects trainable rank decomposition matrices into each layer of the Transformer architecture.

### The Math
Instead of updating a weight matrix $W$ with a full-rank update $\Delta W$, LoRA approximates $\Delta W$ as the product of two low-rank matrices $A$ and $B$.

$$ W_{new} = W_0 + \Delta W = W_0 + B A $$

- $W_0 \in \mathbb{R}^{d \times d}$: Frozen pre-trained weights.
- $B \in \mathbb{R}^{d \times r}$: Initialized to zero.
- $A \in \mathbb{R}^{r \times d}$: Initialized with random Gaussian noise.
- $r$: The rank (e.g., 8, 16, 64), where $r \ll d$.

### Architecture

```text
       Input (x)
       /       \
      /         \
 [Frozen W_0]  [Down-proj A (r x d)]
      |               |
      |         [Up-proj B (d x r)]
      \         /
       \       /
        Sum (+) -> Output (y)
```

At inference, $BA$ can be pre-computed and added to $W_0$, resulting in zero inference latency overhead. LoRA reduces trainable parameters by 10,000x and VRAM requirements by 3x.

## QLoRA: Quantized LoRA

While LoRA reduces optimizer memory, the frozen base model $W_0$ still occupies massive VRAM (e.g., 140GB for a 70B model in FP16). QLoRA solves this by quantizing the base model to 4-bit precision, enabling the fine-tuning of a 65B model on a single 48GB GPU.

### QLoRA Innovations

QLoRA introduces three crucial optimizations: 4-bit NormalFloat (NF4) Quantization, Double Quantization, and Paged Optimizers.

### 1. 4-bit NormalFloat (NF4)
Standard linear quantization fails for LLM weights because they follow a zero-centered normal distribution. NF4 is an information-theoretically optimal data type for normally distributed data.

Instead of spacing quantization bins evenly, NF4 spaces them based on the quantiles of the standard normal distribution. This ensures that every quantization bin has an equal number of weights assigned to it, minimizing quantization error.

```python
import torch

def create_nf4_tensors(weights):
    # Conceptual mapping to NF4 quantiles
    # Real implementation relies on bitsandbytes custom CUDA kernels
    quantiles = [-1.0, -0.69, -0.5, -0.3, -0.15, 0.0, 0.15, 0.3, 0.5, 0.69, 1.0]
    # Quantize to closest quantile...
```

### 2. Double Quantization
Quantization requires a "block constant" (scaling factor) for every block of weights (e.g., 64 weights). In FP32, these constants consume 0.5 bits per parameter.
Double Quantization quantizes the quantization constants themselves from FP32 to 8-bit FP, saving ~0.37 bits per parameter.

### 3. Paged Optimizers
During training, optimizer states (Adam momentum) can cause out-of-memory spikes. QLoRA utilizes NVIDIA Unified Memory to seamlessly page optimizer states to CPU RAM when GPU memory is full, paging them back when needed.

## The Forward Pass in QLoRA

During the forward pass, the 4-bit weights are **dequantized** back to BF16 in cache. The matrix multiplication occurs in BF16, while the gradients only flow through the FP32 LoRA adapters.

```text
Forward Pass:
1. Dequantize W_0 (NF4) -> W_0 (BF16)
2. Compute y = x @ W_0(BF16) + x @ A(FP32) @ B(FP32)
3. Free W_0 (BF16) from VRAM

Backward Pass:
1. Compute gradients for A and B.
2. W_0 remains frozen in NF4.
```

By combining NF4 quantization with LoRA adapters, QLoRA achieves parity with 16-bit full fine-tuning performance while slashing hardware requirements by an order of magnitude.
