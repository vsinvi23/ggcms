# LLM Inference Optimization: The KV Cache and FlashAttention On-Chip Tiling

**The Problem:** Transformer inference is heavily memory-bound, not compute-bound. Generating text token-by-token (autoregressive decoding) requires recomputing attention over all previous tokens at each step. This leads to quadratic time complexity $O(N^2)$ and massive redundant memory reads. Without optimization, LLM deployment is prohibitively expensive and suffers from high latency (Time to First Token & Time per Output Token).

## The KV Cache Architecture

During self-attention, the model computes Queries (Q), Keys (K), and Values (V). In autoregressive generation, at step $T$, the Q vector for the new token must attend to the K and V vectors of *all* tokens from step $0$ to $T$.

Recomputing K and V for past tokens is redundant. The **KV Cache** stores the K and V tensors for all previous tokens in GPU memory.

```text
Step T:
[Token T] --> Q_T, K_T, V_T

Memory (KV Cache):
K_past = [K_0, K_1, ..., K_T-1]
V_past = [V_0, V_1, ..., V_T-1]

Compute:
K_total = Concat(K_past, K_T)
V_total = Concat(V_past, V_T)
Attention(Q_T, K_total, V_total) = Softmax(Q_T * K_total^T / sqrt(d)) * V_total
```

### Memory Bottleneck of KV Cache

While KV caching saves FLOPs, it consumes massive VRAM.
`Memory per token = 2 * (num_layers) * (num_heads) * (head_dim) * (precision_bytes)`
For a 70B model with context length 8k, the KV cache alone can exceed 10GB per batch. This limits batch sizes and deployment scalability. Techniques like PagedAttention (vLLM) solve KV cache fragmentation, but the memory bandwidth wall remains.

## FlashAttention: Beating the Memory Wall

Standard attention computation materialized the full $N \times N$ attention matrix (Scores) in HBM (High Bandwidth Memory - the main GPU RAM). Reading and writing this matrix to HBM is the true bottleneck.

FlashAttention (v1/v2/v3) completely avoids materializing the $N \times N$ matrix in HBM. It uses **Tiling** and **Recomputation** to compute attention directly in SRAM (the fast, tiny memory on the streaming multiprocessors).

### On-Chip Tiling

SRAM is fast (19 TB/s) but small (e.g., 20MB on A100). FlashAttention splits the Q, K, and V matrices into blocks (tiles) that fit into SRAM.

```text
HBM (Slow, Large)                      SRAM (Fast, Small)
+----------------+                     +------------------+
| Q, K, V Blocks | --- Load Tile ----> | Q_block, K_block |
+----------------+                     | Compute Softmax  |
                                       | V_block          |
                                       | Accumulate O_i   |
                                       +------------------+
```

### The Safe-Softmax Problem

Softmax requires the maximum value in a row to prevent numerical overflow:
`Softmax(x_i) = exp(x_i - max(x)) / sum(exp(x_j - max(x)))`

Normally, this requires a full pass over the row (materializing $N$ items). FlashAttention uses an **online softmax** algorithm. It computes local maxes and local sums for each tile, and dynamically rescales the previous blocks' outputs as new blocks are loaded.

```python
# Simplified Online Softmax conceptually
def online_softmax_block(q_block, k_block, v_block, prev_max, prev_sum, prev_out):
    # Compute dot product for the block
    s_block = q_block @ k_block.T
    
    # Local max
    block_max = max(s_block)
    new_max = max(prev_max, block_max)
    
    # Rescale factors
    scale_prev = exp(prev_max - new_max)
    scale_block = exp(s_block - new_max)
    
    # Update sum
    new_sum = prev_sum * scale_prev + sum(scale_block)
    
    # Update output
    new_out = (prev_out * prev_sum * scale_prev + (scale_block @ v_block)) / new_sum
    
    return new_max, new_sum, new_out
```

### FlashAttention 2 and 3 Improvements

- **FlashAttention-2:** Optimized thread block parallelization. Instead of parallelizing over batch and heads, it also parallelizes over the sequence length, vastly improving occupancy for long sequences.
- **FlashAttention-3:** Utilizes Hopper (H100) asynchronous memory copies (TMA) and FP8 Tensor Cores, hiding memory latency behind matrix multiplications.

By combining KV Cache (reducing FLOPs) and FlashAttention (reducing HBM I/O), modern LLM inference engines can achieve near-optimal hardware utilization.
