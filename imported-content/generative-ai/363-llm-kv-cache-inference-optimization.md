# LLM Inference Optimization: The KV Cache and FlashAttention

## The Problem: The Autoregressive Generation Bottleneck

During autoregressive generation, a Large Language Model generates text one token at a time. To generate token $t$, the model must attend to all preceding tokens $1 \dots t-1$. In a naive implementation:
1. At step 1, we project and process token 1.
2. At step 2, we project and process tokens [1, 2] to get token 3.
3. At step 3, we project and process tokens [1, 2, 3] to get token 4.

```
Naive Generation (No KV Cache):
Step 1: [Token 1] ===> compute Q, K, V
Step 2: [Token 1, Token 2] ===> re-compute Q, K, V for Token 1 AND Token 2
Step 3: [Token 1, Token 2, Token 3] ===> re-compute Q, K, V for all three!
```

This redundant recomputation of Keys ($K$) and Values ($V$) for previous tokens creates a severe computational bottleneck. For a context window of length $N$, the overall complexity scales as $O(N^3)$ over the generation cycle, hitting severe **memory-bandwidth limits** as GPU cores sit idle waiting for weight matrices to load from high-bandwidth memory (HBM).

---

## Technical Solutions: KV Caching and FlashAttention

To make text generation commercially viable, modern inference engines rely on two fundamental optimizations: **KV Caching** (algorithmic) and **FlashAttention** (hardware-aware compiler-level optimization).

### 1. The Key-Value (KV) Cache
The KV Cache addresses the redundant computation problem. Since past tokens do not change, their Key ($K$) and Value ($V$) projections are static. We save these intermediate tensors in GPU memory after their first calculation. During subsequent generation steps:
* We only project the *single, newly generated token* into Query ($q_t$), Key ($k_t$), and Value ($v_t$) tensors.
* We append $k_t$ and $v_t$ to our rolling historical cache: $K \leftarrow [K_{\text{history}}; k_t]$ and $V \leftarrow [V_{\text{history}}; v_t]$.
* We compute attention using the new single query $q_t$ against the aggregated history $K$ and $V$. This reduces the step complexity of self-attention from $O(N^2)$ to $O(N)$, and the entire sequence complexity to $O(N^2)$.

```
Generation with KV Cache:
Step 1: [Token 1] ===> compute K_1, V_1 ===> Store in Cache
Step 2: [Token 2] ===> compute K_2, V_2 ===> Append to Cache: [K_1, K_2], [V_1, V_2]
Step 3: [Token 3] ===> compute K_3, V_3 ===> Append to Cache: [K_1..3], [V_1..3]
```

### 2. FlashAttention
Even with a KV Cache, computing self-attention requires reading and writing the intermediate $N \times N$ attention weights matrix to high-bandwidth memory (HBM). Since HBM access is much slower than SRAM (on-chip SRAM speed is $\sim 19 \text{ TB/s}$ vs HBM speed $\sim 1.5 - 2 \text{ TB/s}$), standard attention is highly memory-bandwidth bound.

FlashAttention (Dao et al., 2022) restructures the attention computation to avoid writing the $N \times N$ matrix back to HBM. It does this by:
* **Tiling**: Splitting the input matrices into smaller blocks that fit completely within the fast on-chip SRAM.
* **Online Softmax**: Computing softmax incrementally over the blocks without needing the full row of dot products.
* **Recomputation**: In training, instead of saving the large attention matrix for backpropagation, it stores only the softmax normalization statistics and recomputes the attention values during the backward pass.

---

## PyTorch Simulation of a Stateful KV Cache

Below is a PyTorch implementation of a multi-head self-attention layer equipped with a stateful KV cache, showing how the cache is initialized, updated, and used to accelerate incremental decoding.

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Tuple, Optional

class CausalSelfAttentionWithKVCache(nn.Module):
    def __init__(self, d_model: int, n_heads: int):
        super().__init__()
        self.d_model = d_model
        self.n_heads = n_heads
        self.d_k = d_model // n_heads
        
        # Projections
        self.q_proj = nn.Linear(d_model, d_model)
        self.k_proj = nn.Linear(d_model, d_model)
        self.v_proj = nn.Linear(d_model, d_model)
        self.out_proj = nn.Linear(d_model, d_model)
        
    def forward(
        self, 
        x: torch.Tensor, 
        kv_cache: Optional[Tuple[torch.Tensor, torch.Tensor]] = None
    ) -> Tuple[torch.Tensor, Tuple[torch.Tensor, torch.Tensor]]:
        """
        Args:
            x: Input tensor of shape [batch_size, seq_len, d_model]
               For prompt processing (prefill), seq_len > 1.
               For token generation (decoding), seq_len == 1.
            kv_cache: Optional tuple of (cached_k, cached_v)
                      Each of shape [batch_size, n_heads, prev_seq_len, d_k]
        """
        batch_size, seq_len, _ = x.size()
        
        # 1. Project current token(s)
        q = self.q_proj(x).view(batch_size, seq_len, self.n_heads, self.d_k).transpose(1, 2)
        k = self.k_proj(x).view(batch_size, seq_len, self.n_heads, self.d_k).transpose(1, 2)
        v = self.v_proj(x).view(batch_size, seq_len, self.n_heads, self.d_k).transpose(1, 2)
        
        # 2. Update KV Cache
        if kv_cache is not None:
            cached_k, cached_v = kv_cache
            # Concatenate along sequence dimension (dim=2)
            k = torch.cat([cached_k, k], dim=2)
            v = torch.cat([cached_v, v], dim=2)
            
        # Keep track of current cache states
        new_kv_cache = (k, v)
        
        # 3. Scaled dot product attention: Q * K^T
        # Shape of q: [B, H, seq_len, d_k]
        # Shape of k: [B, H, total_seq_len, d_k]
        scores = torch.matmul(q, k.transpose(-2, -1)) / (self.d_k ** 0.5)
        
        # Apply causal mask if processing multiple prompt tokens (seq_len > 1)
        if seq_len > 1:
            causal_mask = torch.tril(torch.ones(seq_len, k.size(2), device=x.device))
            scores = scores.masked_fill(causal_mask == 0, float('-inf'))
            
        attn_weights = F.softmax(scores, dim=-1)
        context = torch.matmul(attn_weights, v) # [B, H, seq_len, d_k]
        
        # 4. Project output
        context = context.transpose(1, 2).contiguous().view(batch_size, seq_len, self.d_model)
        output = self.out_proj(context)
        
        return output, new_kv_cache

if __name__ == "__main__":
    # Validate cache updates and token tracking
    batch_size = 1
    d_model = 64
    n_heads = 2
    
    attention = CausalSelfAttentionWithKVCache(d_model, n_heads)
    
    # Simulate step 1: Prefill phase (processing prompt: 3 tokens)
    prompt = torch.randn(batch_size, 3, d_model)
    out_prefill, cache = attention(prompt)
    print(f"Prefill Phase Output Shape: {out_prefill.shape}")
    print(f"Cache K Shape: {cache[0].shape} (Expected seq_len = 3)")
    
    # Simulate step 2: Decode Phase (generating 1st new token)
    new_token = torch.randn(batch_size, 1, d_model)
    out_decode_1, cache = attention(new_token, kv_cache=cache)
    print(f"Decode Step 1 Output Shape: {out_decode_1.shape}")
    print(f"Cache K Shape: {cache[0].shape} (Expected seq_len = 4)")
    
    # Validate that sequence length increased correctly in cache
    assert cache[0].size(2) == 4
    print("KV Cache validation passed. Tokens successfully appended and routed through attention.")
```

---

## Performance Characteristics Table

The following matrix contrasts the memory and compute footprint across the optimization spectrum:

| Phase | Metric | Naive Attention | Attention with KV Cache | Attention with FlashAttention + KV Cache |
| :--- | :--- | :--- | :--- | :--- |
| **Decoding Step** | **Compute Complexity** | $O(N^2 \cdot d)$ | $O(N \cdot d)$ | $O(N \cdot d)$ |
| **Decoding Step** | **HBM Writes** | $O(N^2)$ (Attention Matrix)| $O(N \cdot d)$ (Appending cache) | $O(\text{SRAM size})$ (Tiled computation) |
| **Context Scale** | **Memory Usage** | $O(1)$ | $O(B \cdot L \cdot N \cdot d)$ | $O(B \cdot L \cdot N \cdot d)$ |
| **Bottleneck Type**| **Operational** | Compute-bound (FLOPs) | Memory-bandwidth bound | IO-aware optimal throughput |
