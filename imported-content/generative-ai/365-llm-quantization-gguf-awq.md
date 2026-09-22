# LLM Quantization: Running 70B Models on Consumer GPUs (GGUF/AWQ)

## The Problem: The VRAM Barrier of Modern LLMs

A Large Language Model with $70\text{B}$ parameters is highly capable, but storing its weights in native half-precision format (FP16 or BF16) requires an immense amount of VRAM:

$$\text{Memory} = 70 \times 10^9 \text{ parameters} \times 2 \text{ bytes/parameter} \approx 140 \text{ Gigabytes}$$

To run this model, a developer needs multiple enterprise-grade GPUs (such as two NVIDIA A100s). For local workstations or consumer systems (which typically have $8\text{GB}$ to $24\text{GB}$ of VRAM), running a $70\text{B}$ model is impossible without model compression. 

**Model Quantization** breaks through this barrier, compressing weight matrices from 16-bit floats to 8-bit, 4-bit, or even 2-bit integers, reducing memory requirements by up to $75\%$ with minimal degradation in text-generation quality.

---

## Technical Architectures: GGUF vs AWQ

Quantization maps a high-precision range to a discrete low-precision set. The general formula for symmetric quantization mapping a float $w$ to an integer $q$ is:

$$q = \text{clip}\left(\text{round}\left(\frac{w}{S}\right), q_{\text{min}}, q_{\text{max}}\right)$$

$$\text{Dequantized: } \tilde{w} = q \times S$$

*Where $S$ is the scaling factor: $S = \frac{\max(|w|)}{q_{\text{max}}}$.*

```
       FP16 Floating-Point Space
       [-3.42,  -1.20,  0.05,  1.12,  2.89] (High Precision, High VRAM)
                    |
                    v Symmetric Quantization (Scale S = max/127)
       INT8 Quantized Space
       [-127,   -44,    2,     41,    107]  (Discrete Integers, 1 Byte each)
                    |
                    v Dequantization (Multiplication by Scale S)
       Reconstructed Space
       [-3.42,  -1.18,  0.05,  1.10,  2.89] (Low VRAM, Minor Quantization Noise)
```

To optimize this mapping without losing semantic performance, the community has developed two primary formats: **GGUF** and **AWQ**.

### 1. GGUF (GPT-Generated Unified Format)
GGUF is designed for local inference on commodity hardware, particularly utilizing the CPU/GPU split-loading capabilities of `llama.cpp`.
* **Layer Offloading**: GGUF allows developers to split model layers between GPU VRAM and system CPU RAM. If a model requires 24GB and the GPU only has 16GB, GGUF offloads the remaining layers to CPU.
* **K-Quants (Mixed Precision)**: Rather than quantizing all weights uniformly, GGUF uses "K-Quants." This utilizes higher bit-precision (e.g., 5-bit or 6-bit) for highly sensitive layers, like attention projections and input embeddings, and aggressive compression (e.g., 3-bit or 4-bit) for Feed-Forward Networks (FFN), minimizing perceptual loss.

### 2. AWQ (Activation-aware Weight Quantization)
AWQ (Lin et al., 2023) is optimized for high-throughput GPU inference. It operates on the observation that **not all weights are created equal**.
* **Activation Awareness**: During inference, only a tiny fraction (less than 1%) of activations have massive spikes in magnitude. The weights corresponding to these highly active features are "salient" weights.
* **Selective Protection**: Quantizing these salient weights aggressively leads to severe perplexity degradation. AWQ protects them. Instead of keeping them in 16-bit (which complicates GPU kernels), AWQ mathematically scales up the salient weights based on activation magnitudes before quantizing them. This reduces the relative quantization error for these critical elements, keeping the entire tensor in 4-bit precision for maximum GPU speed.

---

## PyTorch Implementation of Uniform Symmetric Quantization

Below is a robust PyTorch implementation of a symmetric per-tensor weight quantization module, illustrating scaling factor calculation, clipping, clamping, and reconstruction (dequantization).

```python
import torch
import torch.nn as nn

class SymmetricQuantizer:
    @staticmethod
    def quantize(tensor: torch.Tensor, bits: int = 4) -> tuple[torch.Tensor, float]:
        """Quantize a float tensor to an integer tensor of targeted bit-width."""
        # Calculate dynamic range boundary
        q_max = (2 ** (bits - 1)) - 1
        q_min = -(2 ** (bits - 1))
        
        max_val = torch.max(torch.abs(tensor))
        # Prevent division by zero
        scale = float(max_val.item() / q_max) if max_val > 0 else 1.0
        
        # Quantize: Round(X / Scale) and clamp to target integer bounds
        q_tensor = torch.round(tensor / scale)
        q_tensor = torch.clamp(q_tensor, q_min, q_max)
        
        return q_tensor.to(torch.int8), scale

    @staticmethod
    def dequantize(q_tensor: torch.Tensor, scale: float) -> torch.Tensor:
        """Reconstruct float representation from quantized integer tensor."""
        return q_tensor.to(torch.float32) * scale

if __name__ == "__main__":
    # Smoke test for quantization noise reconstruction
    torch.manual_seed(42)
    
    # Generate mock weights representing a Linear Layer
    original_weights = torch.randn(1000, 1000) * 0.5
    
    # Quantize to 4-bit
    q_weights, scale = SymmetricQuantizer.quantize(original_weights, bits=4)
    
    # Dequantize back to float
    reconstructed_weights = SymmetricQuantizer.dequantize(q_weights, scale)
    
    # Calculate Mean Squared Error (Quantization Noise)
    mse = torch.mean((original_weights - reconstructed_weights) ** 2).item()
    
    print("Original Weights Max/Min: ", original_weights.min().item(), original_weights.max().item())
    print("Quantized Int8 Max/Min:   ", q_weights.min().item(), q_weights.max().item())
    print("Quantization Scale:       ", scale)
    print(f"Mean Squared Error (4-bit): {mse:.6f}")
    
    assert q_weights.max() <= 7 and q_weights.min() >= -8, "Quantization boundary overflow!"
    print("Quantization boundaries verified successfully.")
```

---

## Architectural Comparison Matrix

| Property | GGUF (llama.cpp) | AWQ |
| :--- | :--- | :--- |
| **Primary Target Hardware**| CPU + GPU Hybrid (Mac Studio, local PC) | Dedicated GPUs (NVIDIA RTX, cloud instances) |
| **Quantization Method** | Mixed K-Quants (Block-wise) | Activation-aware group-wise |
| **Inference Engine** | `llama.cpp`, `Ollama` | `vLLM`, `TensorRT-LLM` |
| **Bit-width Options** | 2, 3, 4, 5, 6, 8-bit | 4-bit uniform (highly optimized) |
| **Dynamic Range** | High versatility across architectures | Extremely fast GPU execution speed |
| **70B Model VRAM Req.** | ~38 GB (4-bit split loading) | ~40 GB (4-bit GPU loaded) |
