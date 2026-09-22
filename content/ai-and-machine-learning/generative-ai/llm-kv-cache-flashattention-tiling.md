---
title: "LLM Inference Optimization: The KV Cache and FlashAttention On-Chip Tiling"
description: "How the KV cache eliminates redundant recomputation during autoregressive decoding, why that alone creates a memory-bandwidth bottleneck, and how FlashAttention's SRAM tiling and online softmax fix it -- with a numerically-verified Python simulation."
type: "ARTICLE"
categorySlug: "generative-ai"
articleType: "DEEP_DIVE"
tags:
  - "kv-cache"
  - "flashattention"
  - "llm-inference"
  - "gpu-optimization"
  - "attention-mechanism"
---

# LLM Inference Optimization: The KV Cache and FlashAttention On-Chip Tiling

## The Problem: Memory Bandwidth Bottlenecks in Autoregressive Decoding

LLM inference splits into two distinct phases: **prefill** and **decoding**. In prefill, the model processes the entire input prompt concurrently — this is compute-bound and uses the GPU's Tensor Cores efficiently. In decoding, the model generates tokens one at a time, sequentially, and that sequential nature is where the trouble starts.

```
Standard Attention Memory Bottleneck:
    HBM (High-Bandwidth Memory) <======== [Massive Q, K, V Matrices] ========> SRAM (On-chip L1)
    * Constant read/write operations throttle GPU execution speed.
```

In naive decoding, to predict token $t$, the model would have to recompute attention scores for every preceding token from $1$ to $t-1$ all over again. Re-projecting and re-calculating Key ($K$) and Value ($V$) states for tokens that haven't changed is mathematically redundant, and doing it at every single generation step gives you $O(N^2)$ computational overhead as sequences grow longer — a naive implementation gets dramatically slower per-token as the conversation or document gets longer.

Solving that with a **KV cache** — storing $K$/$V$ once and reusing them — introduces a different problem: VRAM exhaustion. The KV cache stores $K$ and $V$ matrices across every layer and every attention head, and for a large model with a long context window it can consume dozens of gigabytes per batch. Worse, fetching those large cached matrices from slow High-Bandwidth Memory (HBM) into on-chip SRAM at every decoding step creates a *memory bandwidth* bottleneck that starves the GPU's compute units even when there's plenty of raw FLOPS available.

## GPU Memory Hierarchy and FlashAttention Tiling

```
+-----------------------------------------------------------------------------------+
| GPU Memory Hierarchy & FlashAttention Tiling                                      |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  [HBM (High-Bandwidth Memory)]                                                    |
|         |                     ^                                                   |
|      Load Q,K,V            Write S, P, O                                          |
|      Blocks (100 GB/s)     Blocks (100 GB/s)                                      |
|         v                     |                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | GPU On-Chip SRAM (L1 Cache - 19 TB/s)                                       |  |
|  |                                                                             |  |
|  |  +---------------------+   +---------------------+   +-------------------+  |  |
|  |  |  Query Block (Qi)   |   |   Key Block (Kj)    |   |  Value Block (Vj) |  |  |
|  |  +---------------------+   +---------------------+   +-------------------+  |  |
|  |             \                        /                         /            |  |
|  |              v                      v                         /             |  |
|  |         [Compute Block Attention Score Sij]                  /              |  |
|  |                         |                                   /               |  |
|  |                         v                                  /                |  |
|  |         [Online Softmax Normalization Row Stats]          /                 |  |
|  |                         \                                /                  |  |
|  |                          v                              v                   |  |
|  |                         [Multiply Softmax Block by Vj]                      |  |
|  |                                         |                                   |  |
|  |                                         v                                   |  |
|  |                           [Update Local Output Block Oi]                    |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

The roughly 190x bandwidth gap between HBM (~100s of GB/s) and on-chip SRAM (~19 TB/s) is the entire reason FlashAttention exists: keep the expensive intermediate math on-chip, and only touch HBM for the blocks you actually need.

## The KV Cache Mechanics

The full query-key-value attention formula at decoding position $t$ is:

$$\text{Attention}(Q_t, K_{1:t}, V_{1:t}) = \text{softmax}\left(\frac{Q_t K_{1:t}^T}{\sqrt{d_k}}\right) V_{1:t}$$

Instead of recomputing $K_{1:t-1}$ and $V_{1:t-1}$ from scratch on every step, the KV cache stores them once and simply appends the newly computed $K_t$ and $V_t$ for the current token:

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

This converts an $O(N^2)$ compute problem into an $O(N)$ memory-retrieval-plus-append problem per generated token. But for a 70B-parameter model with a 32k-token context window, the KV cache can consume dozens of gigabytes of VRAM per batch — this is exactly the pressure that led to architectural variants like Grouped-Query Attention (GQA), which shares KV heads across multiple query heads to shrink the cache, and is the reason KV cache size (not just parameter count) is now a first-class constraint on how many concurrent requests a serving system can batch.

## FlashAttention Tiling & Online Softmax

While the KV cache reduces redundant FLOPS, standard attention implementations still materialize the full intermediate attention matrices $S \in \mathbb{R}^{N \times N}$ (scores) and $P \in \mathbb{R}^{N \times N}$ (softmax probabilities) in HBM. Moving these $N \times N$ matrices back and forth between HBM and SRAM takes *longer* than the matrix multiplication itself does — the operation is memory-bandwidth-bound, not compute-bound.

**FlashAttention** eliminates this by never materializing the full $N \times N$ matrix in HBM at all. It uses **tiling**: split $Q$, $K$, and $V$ into small SRAM-sized blocks, compute attention block by block entirely on-chip, and incrementally update the running output.

```text
+-----------------------+       +------------------------+
| GPU HBM (Large/Slow)  |       | GPU SRAM (Small/Fast)  |
|                       |       |                        |
|  [ Q, K, V Tensors ]  |--1--> | Load Tile Q_i, K_j, V_j|
|                       |       | Compute Local Softmax  |
|  [ Output Tensor O ]  |<--2-- | Write Updated O_i      |
+-----------------------+       +------------------------+
```

The core challenge with tiling is that the softmax denominator normally requires summing exponentials over the *entire* row before you can normalize anything — but if you only have one block of that row in SRAM at a time, you don't have the full sum yet. FlashAttention solves this with **online (safe) softmax**: it tracks a running maximum $m$ and running sum of exponentials $d$ per row, and rescales the previously-accumulated output every time a new block shifts that running maximum:

$$m^{(j)} = \max(m^{(j-1)}, \tilde{m}^{(j)})$$

$$d^{(j)} = d^{(j-1)} e^{m^{(j-1)} - m^{(j)}} + \tilde{d}^{(j)} e^{\tilde{m}^{(j)} - m^{(j)}}$$

$$O^{(j)} = \text{diag}\left(e^{m^{(j-1)} - m^{(j)}}\right) \frac{d^{(j-1)}}{d^{(j)}} O^{(j-1)} + \frac{e^{\tilde{m}^{(j)} - m^{(j)}}}{d^{(j)}} \tilde{P}^{(j)} V_j$$

The $N \times N$ attention matrix is never written back to HBM at all — only the final, block-aggregated output $O$ and the small per-row softmax scaling statistics ($m$, $d$) are ever materialized.

## Implementation: Simulating Online Softmax Scaling

This Python simulation replicates the numerical rescaling logic of FlashAttention's online softmax step by step, and proves — via `torch.allclose` — that processing attention block-by-block produces mathematically identical output to computing softmax over the whole row at once:

```python
import torch
import torch.nn.functional as F

def standard_softmax_attention(q: torch.Tensor, k: torch.Tensor, v: torch.Tensor) -> torch.Tensor:
    """Computes exact, un-tiled attention using global HBM memory writes."""
    d_k = q.size(-1)
    scores = torch.matmul(q, k.transpose(-2, -1)) / (d_k ** 0.5)
    probs = F.softmax(scores, dim=-1)
    output = torch.matmul(probs, v)
    return output

def online_softmax_attention_tiled(q: torch.Tensor, k: torch.Tensor, v: torch.Tensor, block_size: int = 2) -> torch.Tensor:
    """Simulates FlashAttention's incremental on-chip SRAM tiling and online scaling."""
    N, d = q.size(0), q.size(1)
    d_k = d
    scale = 1.0 / (d_k ** 0.5)

    # Initialize global tracking structures on "SRAM"
    O = torch.zeros((N, d))
    m = torch.full((N, 1), float('-inf'))
    d_sum = torch.zeros((N, 1))

    # Iterate over key/value blocks (outer loop in FlashAttention)
    for j in range(0, N, block_size):
        k_block = k[j:j+block_size]
        v_block = v[j:j+block_size]

        # Intermediate step: inner loop over queries
        for i in range(0, N):
            q_row = q[i:i+1]  # Shape: (1, d)

            # Local block score
            S_ij = torch.matmul(q_row, k_block.transpose(-2, -1)) * scale  # Shape: (1, block_size)

            # Compute block-local max
            m_ij = torch.max(S_ij, dim=-1, keepdim=True).values

            # Rescale running stats
            m_new = torch.maximum(m[i], m_ij)
            exp_old = torch.exp(m[i] - m_new)
            exp_local = torch.exp(S_ij - m_new)

            d_local = torch.sum(exp_local, dim=-1, keepdim=True)
            d_new = d_sum[i] * exp_old + d_local

            # Rescale and update running attention output
            # O_new = (O_old * d_old * exp_old + exp_local * V_local) / d_new
            local_probs = exp_local
            O_local = torch.matmul(local_probs, v_block)

            O[i] = (O[i:i+1] * d_sum[i] * exp_old + O_local) / d_new
            m[i] = m_new
            d_sum[i] = d_new

    return O

# Validation Execution
if __name__ == "__main__":
    torch.manual_seed(42)
    seq_len, dim = 8, 4

    Q = torch.randn(seq_len, dim)
    K = torch.randn(seq_len, dim)
    V = torch.randn(seq_len, dim)

    out_standard = standard_softmax_attention(Q, K, V)
    out_tiled = online_softmax_attention_tiled(Q, K, V, block_size=2)

    print("Standard Attention Output:\n", out_standard[0])
    print("Tiled Attention Output:\n", out_tiled[0])

    # Numerical validation of equivalence
    is_equivalent = torch.allclose(out_standard, out_tiled, rtol=1e-5, atol=1e-5)
    print(f"\nExact Equivalence Validated: {is_equivalent}")
```

Running this confirms `is_equivalent` is `True`: processing $K$/$V$ in blocks of 2 with online rescaling produces the exact same output, row by row, as computing softmax over the entire sequence at once. That equivalence is the whole point — FlashAttention is an *exact*, not approximate, attention algorithm; it only changes the memory-access pattern, not the math.

## Key Takeaway

Caching $K$/$V$ representations avoids redundant recomputation at the cost of a growing memory footprint. FlashAttention addresses the resulting memory-bandwidth bottleneck: instead of writing the intermediate $N \times N$ attention matrices back to high-latency HBM, it keeps every computation on-chip using SRAM tiling and an online softmax rescaling algorithm that provably produces identical results. Together, the KV cache and FlashAttention are the bedrock of modern, real-time LLM inference — including the 128k-and-beyond context windows that would be computationally infeasible without both optimizations working together.
