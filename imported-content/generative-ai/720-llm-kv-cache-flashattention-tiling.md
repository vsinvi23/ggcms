# LLM Inference Optimization: The KV Cache and FlashAttention On-Chip Tiling

### The Problem: Memory Bandwidth Bottlenecks in Autoregressive Decoding

LLM inference is divided into two distinct operational phases: the **prefill** phase and the **decoding** (generation) phase. 

In the prefill phase, the model processes the entire prompt concurrently, which is highly compute-bound and utilizes the GPU's Tensor Cores efficiently. In contrast, the decoding phase generates tokens sequentially, one by one. 

```
Standard Attention Memory Bottleneck:
    HBM (High-Bandwidth Memory) <======== [Massive Q, K, V Matrices] ========> SRAM (On-chip L1)
    * Constant read/write operations throttle GPU execution speed.
```

In naive decoding, to predict token $t$, the model must recompute the attention scores for all preceding tokens $1$ to $t-1$. Re-projecting and re-calculating Key ($K$) and Value ($V$) states for historical tokens at every single generation step results in an $O(N^2)$ computational overhead, causing performance to degrade as sequences grow longer.

Solving this with a Key-Value (KV) cache introduces a new issue: **VRAM exhaustion**. The KV cache stores $K$ and $V$ matrices across all layers and attention heads, consuming massive memory. Additionally, fetching these large cached matrices from slow High-Bandwidth Memory (HBM) to on-chip SRAM at every step creates a memory bandwidth bottleneck, starving the GPU's execution units.

---

### Technical Architectures

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

#### The KV Cache Mechanics
To eliminate redundant calculations, the KV cache saves the Key and Value representations of the past context. The mathematical query-key-value (QKV) attention formula at token position $t$ is updated dynamically:

$$\text{Attention}(Q_t, K_{1:t}, V_{1:t}) = \text{softmax}\left(\frac{Q_t K_{1:t}^T}{\sqrt{d_k}}\right) V_{1:t}$$

Instead of evaluating full sequences, we append the newly generated token's $K_t$ and $V_t$ to our cached historical states $K_{1:t-1}$ and $V_{1:t-1}$, converting an $O(N^2)$ compute problem into an $O(N)$ memory retrieval process.

#### FlashAttention Tiling & Online Softmax
While the KV cache reduces FLOPS, standard attention still reads and writes intermediate attention matrices $S \in \mathbb{R}^{N \times N}$ and $P \in \mathbb{R}^{N \times N}$ to high-latency HBM. FlashAttention optimizes this by executing the entire attention operation within fast, on-chip SRAM via **tiling**.

1. **SRAM Tiling:** FlashAttention splits the Query ($Q$), Key ($K$), and Value ($V$) matrices into small, SRAM-compatible blocks.
2. **Online Softmax:** Standard softmax requires computing the denominator sum over the entire row before exponentiation. FlashAttention computes softmax incrementally across blocks by tracking running local statistics: maximum value $m$ and sum of exponentials $d$.
   When moving from block $j-1$ to block $j$, the running attention output $O^{(j-1)}$ is rescaled to match the updated global denominator:

   $$m^{(j)} = \max(m^{(j-1)}, \tilde{m}^{(j)})$$

   $$d^{(j)} = d^{(j-1)} e^{m^{(j-1)} - m^{(j)}} + \tilde{d}^{(j)} e^{\tilde{m}^{(j)} - m^{(j)}}$$

   $$O^{(j)} = \text{diag}\left(e^{m^{(j-1)} - m^{(j)}}\right) \frac{d^{(j-1)}}{d^{(j)}} O^{(j-1)} + \frac{e^{\tilde{m}^{(j)} - m^{(j)}}}{d^{(j)}} \tilde{P}^{(j)} V_j$$

3. **No Intermediate Writes:** The $N \times N$ attention matrix is never written back to HBM; only the final block-aggregated output $O$ and the softmax scaling factors are materialized.

---

### Implementation: Simulating Online Softmax Scaling

This Python simulation replicates the numerical rescaling logic used in FlashAttention's online softmax algorithm, illustrating how block-by-block processing produces mathematically identical outputs to global softmax.

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
            q_row = q[i:i+1] # Shape: (1, d)
            
            # Local block score
            S_ij = torch.matmul(q_row, k_block.transpose(-2, -1)) * scale # Shape: (1, block_size)
            
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

### Key Takeaway
By caching KV representations, we avoid redundant computations at the expense of memory footprint. FlashAttention addresses this memory bottleneck. Instead of writing intermediate $N \times N$ matrices back to high-latency memory, it keeps computations on-chip using SRAM tiling and online softmax rescaling, resulting in a $2-4\times$ speedup during training and inference.
