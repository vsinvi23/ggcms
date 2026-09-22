# LLM Inference Optimization: The KV Cache and FlashAttention On-Chip Tiling

## The Problem: The Quadratic Bottleneck of Attention
Standard multi-head attention suffers from two critical bottlenecks during LLM inference:
1. **Time Complexity**: Attention scales $O(N^2)$ with respect to sequence length $N$.
2. **Memory Bandwidth**: The autoregressive decoding phase requires loading immense weight matrices and historical states from High Bandwidth Memory (HBM) to SRAM for *every single token generated*.

Without optimization, generating the 1000th token requires re-computing attention over the previous 999 tokens. This redundancy creates massive latency spikes and severely limits the maximum batch size a GPU can handle.

## Architecture 1: The KV Cache
During decoding, the queries ($Q$), keys ($K$), and values ($V$) for previous tokens do not change. The KV Cache resolves the time complexity problem by storing the computed $K$ and $V$ tensors for all past tokens in GPU memory. 

When generating token $t$, the model only computes the $Q$, $K$, and $V$ for token $t$. It then concatenates the new $K$ and $V$ with the cached $K_{1:t-1}$ and $V_{1:t-1}$ before computing attention.

```text
[ Autoregressive Step with KV Cache ]

Token t_new --> Linear Layers --> Q_new, K_new, V_new

KV_Cache [K_1...K_{t-1}] + [K_new] -> K_full
KV_Cache [V_1...V_{t-1}] + [V_new] -> V_full

Attention(Q_new, K_full, V_full) = Softmax(Q_new @ K_full^T / sqrt(d)) @ V_full
```
*Result:* Time complexity per generation step drops from $O(N^2)$ to $O(N)$. 

## Architecture 2: FlashAttention and SRAM Tiling
While the KV Cache solves the computation redundancy, it exacerbates the memory bandwidth problem. The cache itself becomes huge. For a 70B parameter model with an 8k context, the KV cache can easily exceed 10GB per sequence. 

Standard PyTorch attention implementations materialize the massive $N \times N$ attention matrix $S = QK^T$ entirely in the GPU's HBM. Reading and writing this matrix to HBM is incredibly slow.

**FlashAttention** solves this via **Tiling**. It prevents the $N \times N$ matrix from ever being materialized in HBM. Instead, it loads small blocks (tiles) of $Q, K$, and $V$ from the slow HBM into the extremely fast (but small) on-chip SRAM, computes the attention for that block, and writes only the final result back to HBM.

```text
[ FlashAttention SRAM Tiling Diagram ]

+-------------------+      (1) Load Tile       +-------------------+
| GPU HBM (Slow)    | -----------------------> | GPU SRAM (Fast)   |
|                   |                          |                   |
| [Q_full]          |      (3) Write Out       | block_Q @ block_K |
| [K_full]          | <----------------------- | scale & softmax   |
| [V_full]          |                          | @ block_V         |
|                   |                          |                   |
| [Output_full]     |                          | [Output_tile]     |
+-------------------+                          +-------------------+
```

To achieve this without breaking the Softmax calculation (which normally requires the sum of the entire row before exponentiation), FlashAttention mathematically restructures Softmax into a rolling computation, keeping track of running statistics (`m_max` and `l_sum`).

## Robust Implementation

While FlashAttention is implemented in heavily optimized CUDA C++, the conceptual hardware-aware tiling algorithm can be modeled in Python to illustrate the block-wise approach.

```python
import torch

def flash_attention_simulated(Q: torch.Tensor, K: torch.Tensor, V: torch.Tensor, B_r: int, B_c: int):
    """
    Simulates FlashAttention block tiling.
    Q, K, V shape: (seq_len, d_model)
    B_r: Row block size (fits in SRAM)
    B_c: Column block size (fits in SRAM)
    """
    seq_len, d_model = Q.shape
    O = torch.zeros_like(Q)           # Output matrix in HBM
    l = torch.zeros(seq_len, 1)       # Softmax denominator in HBM
    m = torch.full((seq_len, 1), -float('inf')) # Max scores in HBM

    # Iterate over row blocks of Q
    for i in range(0, seq_len, B_r):
        Q_tile = Q[i:i+B_r, :]        # Load Q block to SRAM
        
        # Iterate over column blocks of K, V
        for j in range(0, seq_len, B_c):
            K_tile = K[j:j+B_c, :]    # Load K block to SRAM
            V_tile = V[j:j+B_c, :]    # Load V block to SRAM
            
            # Compute raw scores for this tile
            S_tile = Q_tile @ K_tile.transpose(0, 1) / (d_model ** 0.5)
            
            # Online Softmax updates (SRAM local)
            m_prev = m[i:i+B_r]
            m_curr = torch.maximum(m_prev, torch.max(S_tile, dim=1, keepdim=True).values)
            
            P_tile = torch.exp(S_tile - m_curr)
            
            l_prev = l[i:i+B_r]
            l_curr = torch.exp(m_prev - m_curr) * l_prev + torch.sum(P_tile, dim=1, keepdim=True)
            
            # Update Output tile (SRAM -> HBM)
            O_prev = O[i:i+B_r, :]
            O[i:i+B_r, :] = (torch.exp(m_prev - m_curr) * O_prev * l_prev + P_tile @ V_tile) / l_curr
            
            # Update statistics in HBM
            m[i:i+B_r] = m_curr
            l[i:i+B_r] = l_curr

    return O
```

## Strategic Takeaways
The combination of KV Caching (eliminating temporal redundancy) and FlashAttention (eliminating spatial/bandwidth redundancy via SRAM tiling) forms the foundation of modern, production-grade LLM inference engines like vLLM and TGI. Understanding these hardware-software co-designs is non-negotiable for scaling generative AI architectures.