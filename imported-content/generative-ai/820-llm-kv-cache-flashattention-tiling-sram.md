# LLM Inference Optimization: The KV Cache and FlashAttention On-Chip Tiling

### The Problem: Autoregressive Bottlenecks
Large Language Models (LLMs) generate text autoregressively—one token at a time. During each generation step, the attention mechanism must recalculate attention scores across the entire sequence history. As the context window grows, the time and memory complexity of standard Self-Attention scale quadratically $O(N^2)$, causing severe latency and throughput degradation.

Two primary breakthroughs solve this bottleneck during inference and training: **The KV Cache** (for inference latency) and **FlashAttention** (for memory bandwidth overhead).

### The KV Cache: Eliminating Redundant Computations
In standard self-attention, for a sequence of length $N$, we compute Query ($Q$), Key ($K$), and Value ($V$) tensors for all $N$ tokens. In the autoregressive decoding phase, we only generate the $(N+1)$-th token. 

Recalculating $K$ and $V$ for the previous $N$ tokens is mathematically redundant because they depend only on the past tokens, which haven't changed.

**Solution:** The KV Cache stores the computed $K$ and $V$ vectors for all past tokens in GPU memory. When computing attention for the new token, the model only computes the $Q$, $K$, and $V$ for the *current* token, and appends the new $K$ and $V$ to the cache.

```text
+-------------------------------------------------------+
|  Autoregressive Generation with KV Cache              |
+-------------------------------------------------------+
| Step T:                                               |
| [ Past Tokens ] -> [ Cached K_1..T-1, V_1..T-1 ]      |
|                                                       |
| Step T+1 (New Token "X"):                             |
| 1. Compute Q_X, K_X, V_X                              |
| 2. Append K_X -> K_Cache; V_X -> V_Cache              |
| 3. Attention(Q_X, K_Cache, V_Cache)                   |
+-------------------------------------------------------+
```
While KV Cache makes time complexity linear for generation $O(N)$, it introduces a massive memory bottleneck. For a 70B parameter model with a 32k context window, the KV cache can consume dozens of gigabytes of VRAM per batch. This led to architectural variants like Grouped-Query Attention (GQA) to share KV heads.

### FlashAttention: Defeating the Memory Wall
Standard attention is memory-bandwidth bound. To compute `Attention = Softmax(Q * K^T) * V`, standard implementations materialize the intermediate $N \times N$ attention matrix $S$ (scores) and $P$ (softmax probabilities) in High Bandwidth Memory (HBM).

Moving these massive $N \times N$ matrices back and forth between HBM and SRAM (the fast, small on-chip compute memory) takes more time than the actual matrix multiplication.

**Solution:** FlashAttention computes exact attention without ever materializing the $N \times N$ matrix in HBM. It uses a technique called **Tiling** combined with **Recomputation**.

#### Tiling Architecture
FlashAttention loads blocks (tiles) of $Q$, $K$, and $V$ from HBM into SRAM, computes the attention block by block, and incrementally updates the final output.

```text
+-----------------------+       +------------------------+
| GPU HBM (Large/Slow)  |       | GPU SRAM (Small/Fast)  |
|                       |       |                        |
|  [ Q, K, V Tensors ]  |--1--> | Load Tile Q_i, K_j, V_j|
|                       |       | Compute Local Softmax  |
|  [ Output Tensor O ]  |<--2-- | Write Updated O_i      |
+-----------------------+       +------------------------+
```

#### Safe Softmax and Online Normalization
The core challenge of tiling is the Softmax function, because the denominator requires the sum of exponentials across the *entire* row. FlashAttention solves this using Online Normalization (Safe Softmax): it keeps track of the local maximum and the local sum of exponentials for each block, incrementally scaling the output as new blocks of $K$ and $V$ are processed.

```python
# Simplified Conceptual Online Softmax in Tiling
def flash_attention_block(Q_tile, K_tile, V_tile, O_prev, m_prev, l_prev):
    # m_prev: previous row max, l_prev: previous exp sum
    S_tile = Q_tile @ K_tile.T
    
    m_curr = max(m_prev, row_max(S_tile))
    P_tile = exp(S_tile - m_curr)
    
    # Rescale previous sum and add new block sum
    l_curr = l_prev * exp(m_prev - m_curr) + row_sum(P_tile)
    
    # Rescale previous output and add new block contribution
    O_curr = (O_prev * l_prev * exp(m_prev - m_curr) + P_tile @ V_tile) / l_curr
    
    return O_curr, m_curr, l_curr
```

### Conclusion
The KV Cache optimizes the temporal complexity of autoregressive decoding by trading compute for memory. FlashAttention optimizes the spatial complexity and memory bandwidth of attention by computing exact softmax in fast SRAM via tiling. Together, these innovations are the bedrock of modern, real-time LLM inference, enabling massive context windows like 128k and beyond.
