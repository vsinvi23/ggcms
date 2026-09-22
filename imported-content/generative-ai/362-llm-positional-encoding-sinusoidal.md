# Positional Encoding: Giving Sequence Order to Stateless Transformers

## The Problem: Permutation Invariance in Self-Attention

In recurrent neural networks (RNNs), sequence order is implicitly baked into the sequential, step-by-step state transition. In self-attention, however, all tokens are processed simultaneously in parallel. Mathematically, if we apply a permutation matrix $P$ to the input sequence $X$, the self-attention output is simply permuted:

$$\text{Attention}(PX) = P \cdot \text{Attention}(X)$$

```
Input: "Not bad, good"   ---> [Attention Engine] ---> Output: ["Not", "bad", ",", "good"]
Input: "Good, bad not"   ---> [Attention Engine] ---> Output: ["Good", ",", "bad", "not"]
```

Without an explicit mechanism to inject token positions, the Transformer behaves as a weighted **Bag-of-Words** model. It has no way of distinguishing `"not bad, actually good"` from `"good, actually not bad"`. To resolve this, we must inject a positional representation directly into the token embeddings before feeding them to the attention stack.

---

## Technical Solutions: Absolute Sinusoidal vs Relative Rotary (RoPE)

Two dominant frameworks exist for encoding token positions: static absolute additive encodings (original Transformer) and dynamic relative multiplicative rotation encodings (modern LLMs like LLaMA and Mistral).

### 1. Sinusoidal Positional Encoding (Absolute Additive)
The original Transformer added a static positional vector directly to the token embedding. To enable the model to easily generalize to sequences longer than those seen during training, Vaswani et al. proposed using a series of sine and cosine functions of varying frequencies:

$$PE_{(pos, 2i)} = \sin\left(\frac{pos}{10000^{\frac{2i}{d_{\text{model}}}}}\right)$$

$$PE_{(pos, 2i+1)} = \cos\left(\frac{pos}{10000^{\frac{2i}{d_{\text{model}}}}}\right)$$

*Where $pos$ is the token position in the sequence, and $i$ is the dimension index ($0 \le i < d_{\text{model}}/2$).*
* **Linear Translation Property**: Since $\cos(\alpha+\beta) = \cos\alpha\cos\beta - \sin\alpha\sin\beta$, for any fixed offset $k$, $PE_{pos+k}$ can be expressed as a linear function of $PE_{pos}$. This allows the model to easily learn to attend to relative positions.

```
       Token Index (pos)  --->  [Sinusoidal Formula]  --->  Positional Vector (PE)
                                                                     |
       Token ID           --->  [Embedding Lookup]    --->  Semantic Vector (X)
                                                                     |
                                                                     v
                                                          Sum: Input Tensor (X + PE)
```

### 2. Rotary Position Embeddings (RoPE - Relative Multiplicative)
Modern LLMs use Rotary Position Embeddings (RoPE). Instead of adding positional vectors to embeddings, RoPE applies a rotation to the Query and Key vectors in the 2D plane for each coordinate pair:

$$R_{\Theta, pos}^d = \text{diag}\left( R_{\theta_1, pos}, R_{\theta_2, pos}, \dots, R_{\theta_{d/2}, pos} \right)$$

$$\text{where } R_{\theta_i, pos} = \begin{pmatrix} \cos(pos \cdot \theta_i) & -\sin(pos \cdot \theta_i) \\ \sin(pos \cdot \theta_i) & \cos(pos \cdot \theta_i) \end{pmatrix}$$

By rotating Query and Key vectors, the inner product $\langle q_m, k_n \rangle$ becomes a function of only the relative distance $m-n$. This provides natural extrapolation to longer sequence lengths (context window scaling).

---

## PyTorch Implementation of Sinusoidal Positional Encoding

Here is a robust PyTorch implementation of the classic sinusoidal positional encoding module, showing how the encoding matrix is constructed and added to input tensors.

```python
import torch
import torch.nn as nn
import math

class SinusoidalPositionalEncoding(nn.Module):
    def __init__(self, d_model: int, max_len: int = 5000):
        super().__init__()
        
        # 1. Create a matrix of shape [max_len, d_model] representing positional encodings
        pe = torch.zeros(max_len, d_model)
        
        # 2. Compute the division term: 10000^(2i/d_model)
        # We compute this in log-space for numerical stability
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        
        # 3. Apply sine to even indices and cosine to odd indices
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        
        # 4. Register PE as a buffer (it is stateful but has no gradients to backpropagate)
        pe = pe.unsqueeze(0) # Shape: [1, max_len, d_model]
        self.register_buffer('pe', pe)
        
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: Input embeddings of shape [batch_size, seq_len, d_model]
        """
        seq_len = x.size(1)
        # Add the positional encoding up to the current sequence length
        x = x + self.pe[:, :seq_len, :]
        return x

if __name__ == "__main__":
    # Validate tensor routing and math correctness
    batch_size = 2
    seq_len = 10
    embedding_dim = 128
    
    pos_encoder = SinusoidalPositionalEncoding(d_model=embedding_dim, max_len=100)
    dummy_embeddings = torch.randn(batch_size, seq_len, embedding_dim)
    
    output = pos_encoder(dummy_embeddings)
    
    print(f"Embedding Input Shape: {dummy_embeddings.shape}")
    print(f"Output Shape (added PE): {output.shape}")
    
    # Asserting that shapes are equal and values actually changed
    assert output.shape == dummy_embeddings.shape
    assert not torch.allclose(output, dummy_embeddings), "Positional encodings were not added!"
    print("Execution verification succeeded. Positional vectors successfully added to input tensors.")
```

---

## Architectural Comparison Matrix

| Property | Sinusoidal Encoding | Learnable Absolute | Rotary Embeddings (RoPE) |
| :--- | :--- | :--- | :--- |
| **Type** | Fixed Absolute | Learned Absolute | Relative Multiplicative |
| **Integration Point**| Pre-Attention (Input) | Pre-Attention (Input) | Inside Attention (Q, K) |
| **Formulation** | Sine/Cosine waves | Vector parameters | Complex multiplication/Rotation |
| **Relative Modeling**| Weakly emergent | Extremely weak | Mathematically guaranteed |
| **Extrapolation** | Moderate (with decay) | Fails completely | High (with RoPE scaling like YaRN/NTK) |
| **Model Usage** | Original Transformer | BERT, GPT-2 | LLaMA, Mistral, Gemma, Qwen |
