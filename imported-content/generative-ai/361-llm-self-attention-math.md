# The Math of Self-Attention: Queries, Keys, Values, and Softmax

## The Problem: Static Routing vs Dynamic Contextual Alignment

In standard Feed-Forward Neural Networks (FFNs), weights are fixed after training. When processing a sequence, a traditional dense layer applies the same transformation to every token $x_i$, completely independent of its context or neighboring tokens:

```
Static Dense Layer:      [Token x_i] ---> [W_fixed] ---> [Representation h_i]  (No context)
```

This fails for natural language where words are highly polysemous. For example, in the sentences:
1. "The **bank** of the river was muddy."
2. "I went to the **bank** to deposit money."

The representation of `"bank"` must change based on context. We need a dynamic routing mechanism where a token's representation is built by blending representations of surrounding tokens, with weights determined dynamically at runtime based on relevance.

---

## The Mathematics of Self-Attention

Self-attention achieves dynamic contextual representation through a query-key alignment mechanism. Let $X \in \mathbb{R}^{N \times d_{\text{model}}}$ be the input matrix representing a sequence of $N$ tokens of dimension $d_{\text{model}}$.

```
                          Input Matrix X  (N x d_model)
                                |
             +------------------+------------------+
             |                  |                  |
             v                  v                  v
         Projections        Projections        Projections
         X * W_Q            X * W_K            X * W_V
             |                  |                  |
             v                  v                  v
         Queries Q          Keys K             Values V  (N x d_k)
         (N x d_k)          (N x d_k)              |
             |                  |                  |
             +--------->  (Q * K^T)  <-------------+
                          Raw Scores (N x N)
                                |
                                v Scale: / sqrt(d_k)
                          Scaled Scores
                                |
                                v Softmax (row-wise)
                          Attention Weights A (N x N)
                                |
                                v Weight Values: A * V
                          Context Matrix (N x d_k)
```

### 1. Linear Projection
We project $X$ into three distinct spaces using learned projection matrices $W_Q, W_K \in \mathbb{R}^{d_{\text{model}} \times d_k}$ and $W_V \in \mathbb{R}^{d_{\text{model}} \times d_v}$:
* **Queries ($Q$)**: What this token is looking for.
  
  $$Q = X W_Q \quad (Q \in \mathbb{R}^{N \times d_k})$$
  
* **Keys ($K$)**: What this token contains to match queries.
  
  $$K = X W_K \quad (K \in \mathbb{R}^{N \times d_k})$$
  
* **Values ($V$)**: The actual content representation to be routed.
  
  $$V = X W_V \quad (V \in \mathbb{R}^{N \times d_v})$$

### 2. Scaled Dot-Product Alignment
To compute how relevant token $i$ is to token $j$, we compute the dot product of their respective query and key vectors. Doing this across all positions simultaneously:

$$S = Q K^T \quad (S \in \mathbb{R}^{N \times N})$$

The elements $S_{i, j}$ are raw alignment scores. If $d_k$ is large, the variance of these dot products grows large, pushing the subsequent Softmax function into regions with extremely small gradients. To prevent this gradient vanishing, we scale the dot products by $\frac{1}{\sqrt{d_k}}$:

$$S_{\text{scaled}} = \frac{Q K^T}{\sqrt{d_k}}$$

### 3. Normalization via Softmax
We apply the Softmax function row-wise to convert raw alignment scores into a probability distribution:

$$A = \text{Softmax}\left(\frac{Q K^T}{\sqrt{d_k}}\right) \quad (A \in \mathbb{R}^{N \times N})$$

Each entry $A_{i, j}$ represents the attention weight that token $i$ pays to token $j$.

### 4. Value Aggregation
Finally, we compute the weighted sum of the value vectors using the attention weights. This routes information dynamically:

$$\text{Attention}(Q, K, V) = A V = \text{Softmax}\left(\frac{Q K^T}{\sqrt{d_k}}\right) V \quad (\text{Output} \in \mathbb{R}^{N \times d_v})$$

---

## PyTorch Implementation of Scaled Dot-Product Self-Attention

The following implementation details the exact matrix routing, scaling factor application, and causal masking necessary for decoder operations.

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class ScaledDotProductAttention(nn.Module):
    def __init__(self, d_k: int):
        super().__init__()
        self.scale = 1.0 / (d_k ** 0.5)
        
    def forward(self, q: torch.Tensor, k: torch.Tensor, v: torch.Tensor, mask: torch.Tensor = None):
        """
        Args:
            q: Queries of shape [batch_size, n_heads, seq_len, d_k]
            k: Keys of shape [batch_size, n_heads, seq_len, d_k]
            v: Values of shape [batch_size, n_heads, seq_len, d_v]
            mask: Optional binary mask of shape [batch_size, 1, seq_len, seq_len]
        """
        # 1. Compute Raw Scores: Q * K^T
        # Shape of scores: [batch_size, n_heads, seq_len, seq_len]
        scores = torch.matmul(q, k.transpose(-2, -1)) * self.scale
        
        # 2. Apply Causal/Padding Mask (if provided)
        # We fill masked values with a massive negative number to force softmax to zero
        if mask is not None:
            scores = scores.masked_fill(mask == 0, float('-inf'))
            
        # 3. Compute Softmax along the last dimension (columns)
        attn_weights = F.softmax(scores, dim=-1)
        
        # 4. Multiply by Values
        # Shape of output: [batch_size, n_heads, seq_len, d_v]
        output = torch.matmul(attn_weights, v)
        
        return output, attn_weights

if __name__ == "__main__":
    # Execution validation test
    batch_size = 2
    n_heads = 4
    seq_len = 5
    d_k = 64
    d_v = 64
    
    # Generate dummy Q, K, V tensors
    q = torch.randn(batch_size, n_heads, seq_len, d_k)
    k = torch.randn(batch_size, n_heads, seq_len, d_k)
    v = torch.randn(batch_size, n_heads, seq_len, d_v)
    
    # Construct a causal mask (lower triangular) to simulate decoder constraints
    causal_mask = torch.tril(torch.ones(seq_len, seq_len)).view(1, 1, seq_len, seq_len)
    
    attention_layer = ScaledDotProductAttention(d_k)
    out, weights = attention_layer(q, k, v, mask=causal_mask)
    
    print("Attention Weights Matrix for Batch 0, Head 0:\n", weights[0, 0].detach())
    print("\nOutput Tensor Shape:", out.shape)
    
    # Asserting that causal masking worked (upper triangular elements must be 0.0)
    assert torch.allclose(weights[0, 0, 0, 1:], torch.tensor(0.0)), "Causal mask failed!"
    print("Mask validation passed: future tokens are correctly masked (0 attention weights).")
```

---

## Architectural Scaling Implications

Understanding the computational characteristics of this operation highlights why context-length expansion remains a severe engineering bottleneck:

1. **Space Complexity**: Storing the attention weights matrix $A$ requires $O(N^2 \cdot \text{heads})$ memory, as we must compute an alignment score for every token pair in the sequence.
2. **Time Complexity**: The two matrix multiplications ($QK^T$ and $AV$) require $O(N^2 \cdot d)$ floating-point operations. Scaling the sequence length $N$ by a factor of $10$ increases compute and memory overheads by a factor of $100$.
