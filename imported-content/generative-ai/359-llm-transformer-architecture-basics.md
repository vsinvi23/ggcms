# The Transformer Architecture: Encoder-Decoder Blocks and Self-Attention

## The Problem: Sequential Bottlenecks in Sequence Processing

Prior to the introduction of the Transformer architecture, state-of-the-art sequence-to-sequence modeling relied on recurrent neural networks (RNNs), Long Short-Term Memory (LSTM) networks, and Gated Recurrent Units (GRUs). These architectures process tokens sequentially: to compute the hidden state $h_t$ at step $t$, the network requires the hidden state $h_{t-1}$ from the previous step. 

```
[Token 1] ---> [RNN Cell (h1)] ---> [Token 2] ---> [RNN Cell (h2)] ---> [Token 3] ---> [RNN Cell (h3)]
```

This design introduces two fatal flaws:
1. **$O(N)$ Sequential Dependency**: Training cannot be parallelized across the sequence dimension. The computational complexity prevents scaling to massive datasets.
2. **Information Loss (Vanishing Gradients)**: Despite gating mechanisms in LSTMs, gradients backpropagated through time decay exponentially, making it difficult to capture dependencies across long contexts.

The Transformer solves these issues by replacing recurrence entirely with **Self-Attention**, allowing all tokens to interact simultaneously in $O(1)$ sequential steps, enabling massive parallelization during training.

---

## Technical Architecture: Encoder-Decoder Blocks

The original Transformer (Vaswani et al., 2017) consists of an Encoder stack and a Decoder stack. Modern autoregressive Large Language Models (like GPT, LLaMA) typically use decoder-only variants, but understanding the joint encoder-decoder structure is crucial for understanding how information is representationally routed.

```
       ENCODER BLOCK                          DECODER BLOCK
    +------------------+                   +------------------+
    | Input Embeddings |                   | Output Embeddings|
    +--------+---------+                   +--------+---------+
             |                                      |
             v                                      v
    +--------+---------+                   +--------+---------+
    |Positional Encod. |                   |Positional Encod. |
    +--------+---------+                   +--------+---------+
             |                                      |
             v                                      v
    +--------+---------+                   +--------+---------+
 +->|  Multi-Head Attn |                +->| Masked MH Attn   |
 |  +--------+---------+                |  +--------+---------+
 |           | Add & Norm               |           | Add & Norm
 |           v                          |           v
 |  +--------+---------+                |  +--------+---------+
 +--| Feed-Forward Net |                |  | Multi-Head Attn  |<-+ (Encoder
    +--------+---------+                |  | (Cross-Attention)|--|  K, V keys)
             | Add & Norm               |  +--------+---------+  |
             +--------------------------+           | Add & Norm |
                                        |           v            |
                                        |  +--------+---------+  |
                                        +--| Feed-Forward Net |--+
                                           +--------+---------+
                                                    | Add & Norm
                                                    v
                                           +--------+---------+
                                           |  Linear & Softmax|
                                           +------------------+
```

### 1. The Encoder Block
The encoder maps an input sequence of symbol representations $(x_1, \dots, x_n)$ to a sequence of continuous representations $z = (z_1, \dots, z_n)$. Each encoder layer contains:
- **Multi-Head Self-Attention**: Computes attention weights across all tokens in the input sequence simultaneously.
- **Position-wise Feed-Forward Network (FFN)**: Applies two linear transformations and a non-linear activation (historically ReLU, modernly SwiGLU) to each position independently.
- **Residual Connections & Layer Normalization**: Pre-layer or post-layer normalization (Pre-LN is preferred in modern architectures to stabilize training) wraps each sub-layer: $\text{Output} = x + \text{SubLayer}(\text{LN}(x))$.

### 2. The Decoder Block
The decoder generates an output sequence $(y_1, \dots, y_m)$ autoregressively. In addition to the encoder's sub-layers, it introduces:
- **Masked Multi-Head Self-Attention**: Prevents positions from attending to subsequent positions (future tokens) by applying a causal mask (setting upper-triangular attention values to $-\infty$).
- **Encoder-Decoder Cross-Attention**: Queries ($Q$) come from the previous decoder layer, while keys ($K$) and values ($V$) come from the output stack of the encoder. This allows the decoder to focus on relevant segments of the input sequence.

---

## PyTorch Implementation of a Transformer Encoder Layer

Below is a robust PyTorch implementation of a single Transformer Encoder layer from scratch, demonstrating multi-head self-attention, layer normalization, residual connections, and the position-wise feed-forward network.

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class MultiHeadAttention(nn.Module):
    def __init__(self, d_model: int, n_heads: int):
        super().__init__()
        assert d_model % n_heads == 0, "d_model must be divisible by n_heads"
        
        self.d_model = d_model
        self.n_heads = n_heads
        self.d_k = d_model // n_heads
        
        # Projections for Q, K, V
        self.q_linear = nn.Linear(d_model, d_model)
        self.k_linear = nn.Linear(d_model, d_model)
        self.v_linear = nn.Linear(d_model, d_model)
        
        # Output projection
        self.out_linear = nn.Linear(d_model, d_model)
        
    def forward(self, x: torch.Tensor, mask: torch.Tensor = None) -> torch.Tensor:
        batch_size, seq_len, d_model = x.size()
        
        # 1. Project and split into heads: [batch_size, n_heads, seq_len, d_k]
        q = self.q_linear(x).view(batch_size, seq_len, self.n_heads, self.d_k).transpose(1, 2)
        k = self.k_linear(x).view(batch_size, seq_len, self.n_heads, self.d_k).transpose(1, 2)
        v = self.v_linear(x).view(batch_size, seq_len, self.n_heads, self.d_k).transpose(1, 2)
        
        # 2. Scaled Dot-Product Attention: Softmax( (Q * K^T) / sqrt(d_k) ) * V
        scores = torch.matmul(q, k.transpose(-2, -1)) / (self.d_k ** 0.5)
        
        if mask is not None:
            scores = scores.masked_fill(mask == 0, -1e9)
            
        attn_weights = F.softmax(scores, dim=-1)
        context = torch.matmul(attn_weights, v) # [batch_size, n_heads, seq_len, d_k]
        
        # 3. Concatenate heads and project
        context = context.transpose(1, 2).contiguous().view(batch_size, seq_len, d_model)
        return self.out_linear(context)

class PositionwiseFeedForward(nn.Module):
    def __init__(self, d_model: int, d_ff: int, dropout: float = 0.1):
        super().__init__()
        self.w_1 = nn.Linear(d_model, d_ff)
        self.w_2 = nn.Linear(d_ff, d_model)
        self.dropout = nn.Dropout(dropout)
        
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.w_2(self.dropout(F.relu(self.w_1(x))))

class TransformerEncoderLayer(nn.Module):
    def __init__(self, d_model: int, n_heads: int, d_ff: int, dropout: float = 0.1):
        super().__init__()
        self.self_attn = MultiHeadAttention(d_model, n_heads)
        self.feed_forward = PositionwiseFeedForward(d_model, d_ff, dropout)
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.dropout1 = nn.Dropout(dropout)
        self.dropout2 = nn.Dropout(dropout)
        
    def forward(self, x: torch.Tensor, mask: torch.Tensor = None) -> torch.Tensor:
        # Pre-LN Layer structure for training stability
        attn_out = self.self_attn(self.norm1(x), mask)
        x = x + self.dropout1(attn_out)
        
        ff_out = self.feed_forward(self.norm2(x))
        x = x + self.dropout2(ff_out)
        
        return x

if __name__ == "__main__":
    # Smoke test for tensor shape routing
    batch_size = 4
    seq_length = 32
    embedding_dim = 512
    heads = 8
    ff_dim = 2048
    
    layer = TransformerEncoderLayer(d_model=embedding_dim, n_heads=heads, d_ff=ff_dim)
    dummy_input = torch.randn(batch_size, seq_length, embedding_dim)
    
    output = layer(dummy_input)
    print(f"Input Shape:  {dummy_input.shape}")
    print(f"Output Shape: {output.shape}")
    assert output.shape == dummy_input.shape, "Shape mismatch in Transformer encoder block!"
```

---

## Architectural Performance Characteristics

The following table summarizes the time complexity and maximum path length between any two token positions for various network layer types, highlighting why Transformers excel at long-range dependencies:

| Layer Type | Complexity per Layer | Sequential Operations | Maximum Path Length |
| :--- | :--- | :--- | :--- |
| **Self-Attention** | $O(N^2 \cdot d)$ | $O(1)$ | $O(1)$ |
| **Recurrent** | $O(N \cdot d^2)$ | $O(N)$ | $O(N)$ |
| **Convolutional** | $O(k \cdot N \cdot d^2)$ | $O(1)$ | $O(\log_k(N))$ |

*Where $N$ is the sequence length, $d$ is the representation dimension, and $k$ is the kernel size.* Because self-attention provides $O(1)$ path length, the gradient is routed directly between any two points in the sequence, minimizing informational decay and allowing the network to build deep hierarchical relationships.
