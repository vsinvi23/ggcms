# LLM Inference Optimization: The KV Cache and FlashAttention On-Chip Tiling

**The Problem:** LLM inference (autoregressive decoding) is memory-bandwidth bound. Standard self-attention has a quadratic time and memory complexity $O(N^2)$. Furthermore, predicting the $N+1$ token requires recomputing attention over all previous $N$ tokens, which wastes immense compute.

## The KV Cache
Autoregressive generation predicts one token at a time. The attention mechanism requires queries (Q), keys (K), and values (V). For token $t$, Q needs to dot-product with all previous K's, and multiply with all previous V's.

Instead of recomputing K and V for tokens $0$ to $t-1$ at step $t$, we cache them.

```text
Without KV Cache:                  With KV Cache:
Compute K, V for [0..t]            Load K, V for [0..t-1] from GPU VRAM
Attention(Q_t, K_0..t, V_0..t)     Compute K_t, V_t
                                   Append K_t, V_t to Cache
                                   Attention(Q_t, Cache_K, Cache_V)
```

**Memory Bottleneck:** While the KV cache saves compute (FLOPs), it consumes massive GPU memory. For a 7B model with 32 layers, 4096 hidden dimension, a batch size of 1, and 2048 sequence length, the cache requires gigabytes of VRAM. This limits batch size, reducing throughput.

## FlashAttention: Hardware-Aware Exact Attention
FlashAttention addresses the $O(N^2)$ memory bottleneck of self-attention during the prefill phase by making the algorithm hardware-aware, specifically optimizing for GPU SRAM.

Standard attention writes the large $N \times N$ attention matrix to High Bandwidth Memory (HBM), applies softmax, and reads it back. HBM access is slow.

FlashAttention utilizes **tiling** to compute the exact attention without materializing the full $N \times N$ matrix in HBM.

### Tiling and SRAM
GPUs have massive HBM (e.g., 80GB on A100) but it is slow (~2TB/s). They also have a tiny amount of SRAM (e.g., 20MB) per Streaming Multiprocessor (SM), which is incredibly fast (~19TB/s).

FlashAttention loads blocks (tiles) of Q, K, and V from HBM into SRAM, computes a localized attention block, updates the running softmax statistics, and writes the output back to HBM.

```text
GPU Architecture & FlashAttention Tiling
+---------------------------------------------------+
| HBM (High Capacity, Low Bandwidth)                |
|  [ Q ] [ K ] [ V ] [ Output ]                     |
|    |     |     |      ^                           |
|    v     v     v      |                           |
| +-----------------------------------------------+ |
| | SRAM (Low Capacity, High Bandwidth)           | |
| |  [Tile Q] [Tile K] [Tile V]                   | |
| |       \      |      /                         | |
| |        \     |     /                          | |
| |       Attention Block                         | |
| |       (Compute + Local Softmax)               | |
| +-----------------------------------------------+ |
+---------------------------------------------------+
```

### The Online Softmax Trick
The challenge of tiling is the softmax operation, which normally requires the maximum value of the entire row. FlashAttention uses a stable online softmax. It keeps track of the local maximum and the normalization denominator for each block, iteratively scaling previous block outputs when a new global maximum is found in a subsequent tile.

### Code Abstraction
```python
# Conceptual Flash Attention Tiling
def flash_attention(Q, K, V, block_size):
    O = zeros_like(Q)
    l = zeros(Q.shape[0]) # running sum
    m = fill(Q.shape[0], -inf) # running max
    
    for j in range(0, seq_len, block_size):
        K_j, V_j = load_sram(K[j:j+block_size], V[j:j+block_size])
        for i in range(0, seq_len, block_size):
            Q_i = load_sram(Q[i:i+block_size])
            # Local attention
            S_ij = Q_i @ K_j.T
            # Online softmax updates
            m_new = max(m[i], row_max(S_ij))
            l_new = exp(m[i] - m_new) * l[i] + row_sum(exp(S_ij - m_new))
            
            O[i] = (O[i] * l[i] * exp(m[i] - m_new) + exp(S_ij - m_new) @ V_j) / l_new
            m[i] = m_new
            l[i] = l_new
    return O
```
By minimizing HBM reads/writes, FlashAttention accelerates training and inference prefill by 2-4x and enables massive sequence lengths (e.g., 100k+ tokens).