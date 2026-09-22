# Mixture of Experts (MoE): Scaling Parameters Without Scaling Compute

## The Problem: The Computational Cost of Dense Scaling

In standard dense Transformer architectures, every token in a sequence must pass through every single weight tensor in the network. As models scale from 7 billion to 700 billion parameters, the floating-point operations (FLOPs) required per token increase linearly:

$$\text{FLOPs per token} \approx 2 \times \text{Number of Parameters}$$

This linear dependency creates a painful engineering bottleneck. Scaling parameter capacity to capture complex, multi-domain knowledge makes the model incredibly expensive and slow to run during training and inference. We need a way to decouple a model's total capacity (its "knowledge storage") from the active compute required to process a single token.

---

## Technical Solution: Sparse Mixture of Experts (MoE)

A Sparse Mixture of Experts (MoE) architecture breaks this linear dependency. Instead of a single, massive Feed-Forward Network (FFN) at each Transformer layer, an MoE layer contains multiple, smaller FFNs called **"Experts"**, managed by a trainable **"Gating Network" (or Router)**.

```
                             Incoming Token Vector x
                                        |
                                        v
                           +------------+------------+
                           |  Gating Network / Router | ---> Computes soft routing scores G(x)
                           +------------+------------+
                                        |
                 +----------------------+----------------------+
                 | (Expert 1 Score)     | (Expert 2 Score)     | (Expert N Score)
                 v [Weight: 0.85]       v [Weight: 0.15]       v [Weight: 0.0]
           +-----+------+         +-----+------+         +-----+------+
           |  Expert 1  |         |  Expert 2  |         |  Expert N  |
           | (FFN Block)|         | (FFN Block)|         | (FFN Block)|
           +-----+------+         +-----+------+         +-----+------+
                 |                      |                      |
                 +----------------------+----------------------+
                                        |
                                        v Weighted Sum
                                 Output Vector y
```

During the forward pass:
1. The Gating Network evaluates the incoming token vector $x \in \mathbb{R}^d$ and outputs a sparse routing vector $G(x) \in \mathbb{R}^E$, where $E$ is the total number of experts.
2. The router selects the **Top-$k$** experts (typically $k=1$ or $k=2$) with the highest routing scores.
3. The token $x$ is sent *only* to those selected experts.
4. The outputs from the active experts are combined as a weighted sum based on the gating scores:

$$\text{Output}(x) = \sum_{i \in \text{Top-k}} G(x)_i \cdot E_i(x)$$

By activating only $k$ experts per token, we can scale the total model size (e.g., $8 \times 16\text{B} \approx 128\text{B}$ total parameters) while keeping the active compute footprint small (e.g., $2 \times 16\text{B} \approx 32\text{B}$ active parameters).

### Routing Collapse & Load Balancing
A common issue in training MoE models is **Routing Collapse**, where the gating network defaults to sending all tokens to the same one or two experts. This happens because early in training, a few experts become slightly better, creating a positive feedback loop that leaves other experts completely untrained.

To prevent routing collapse, modern architectures apply an **Auxiliary Load-Balancing Loss** during training. This loss penalizes the model when token routing is unevenly distributed across the available experts, forcing the router to utilize all experts uniformly.

---

## PyTorch Implementation of a Top-k Gated MoE Layer

Below is a robust PyTorch implementation of a Sparse Mixture of Experts layer from scratch, demonstrating the routing logic, Top-k masking, softmax re-normalization, and token dispatching.

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class Expert(nn.Module):
    """A standard position-wise Feed-Forward Network acting as an Expert."""
    def __init__(self, d_model: int, d_ff: int):
        super().__init__()
        self.w1 = nn.Linear(d_model, d_ff)
        self.w2 = nn.Linear(d_ff, d_model)
        
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.w2(F.silu(self.w1(x)))

class SparseMoELayer(nn.Module):
    def __init__(self, d_model: int, d_ff: int, num_experts: int = 8, top_k: int = 2):
        super().__init__()
        self.num_experts = num_experts
        self.top_k = top_k
        
        # 1. Create the pool of experts
        self.experts = nn.ModuleList([Expert(d_model, d_ff) for _ in range(num_experts)])
        
        # 2. Gate network (projects input to expert selection space)
        self.gate = nn.Linear(d_model, num_experts, bias=False)
        
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: Input tensor of shape [batch_size, seq_len, d_model]
        """
        orig_shape = x.shape
        batch_size, seq_len, d_model = orig_shape
        
        # Flatten input to [num_tokens, d_model] for batch-independent routing
        tokens = x.view(-1, d_model)
        num_tokens = tokens.size(0)
        
        # 1. Compute raw routing gate logits: [num_tokens, num_experts]
        gate_logits = self.gate(tokens)
        
        # 2. Select Top-k experts and their raw routing scores
        topk_logits, topk_indices = torch.topk(gate_logits, self.top_k, dim=-1)
        
        # 3. Softmax over the Top-k scores to get routing weights
        topk_weights = F.softmax(topk_logits, dim=-1) # [num_tokens, top_k]
        
        # Initialize output tensor of zeros
        out_tokens = torch.zeros_like(tokens)
        
        # 4. Route each token to its selected experts
        # We iterate over the top-k selections (e.g., 1st expert, 2nd expert)
        for k in range(self.top_k):
            weights = topk_weights[:, k].unsqueeze(-1) # [num_tokens, 1]
            indices = topk_indices[:, k]               # [num_tokens]
            
            # Group tokens by the expert they need to go to
            for expert_idx in range(self.num_experts):
                # Mask identifying which tokens are routed to this specific expert
                token_mask = (indices == expert_idx)
                if not token_mask.any():
                    continue
                    
                # Extract and process the selected tokens
                selected_tokens = tokens[token_mask]
                expert_outputs = self.experts[expert_idx](selected_tokens)
                
                # Accumulate the weighted expert output
                out_tokens[token_mask] += weights[token_mask] * expert_outputs
                
        # Reshape output back to the original batch/sequence configuration
        return out_tokens.view(orig_shape)

if __name__ == "__main__":
    # Validate tensor routing shapes and gradients
    batch_size = 2
    seq_len = 5
    d_model = 64
    d_ff = 128
    num_experts = 4
    top_k = 2
    
    moe_layer = SparseMoELayer(d_model, d_ff, num_experts, top_k)
    dummy_input = torch.randn(batch_size, seq_len, d_model)
    
    # Forward Pass
    output = moe_layer(dummy_input)
    print(f"Input Shape:  {dummy_input.shape}")
    print(f"Output Shape: {output.shape}")
    
    # Asserting that shapes are equal
    assert output.shape == dummy_input.shape, "Shape mismatch in MoE routing layer!"
    
    # Backward Pass validation
    loss = output.sum()
    loss.backward()
    print("Backward pass executed successfully. Gradients routed through Gating and Expert layers.")
```

---

## Architectural Scaling Trade-offs

The following table highlights the operational differences between dense and sparse models:

| Metric | Dense Transformer | Sparse MoE Transformer |
| :--- | :--- | :--- |
| **Total Parameter Capacity**| Medium (e.g., $34\text{B}$) | Extremely High (e.g., $141\text{B}$) |
| **Active Parameters / Token**| High ($100\%$ of model) | Low ($\approx 20-25\%$ of model) |
| **Inference Throughput** | Lower (proportional to total size) | Much Higher (proportional to active size) |
| **Memory Footprint** | Fits in lower VRAM | Extremely High (must load all experts into memory) |
| **Routing Overhead** | None | Low (Gate projection + dispatch latency) |
| **Training Complexity** | Standard | High (Load balancing, expert synchronization) |
| **Ecosystem Usage** | GPT-3, LLaMA-2/3, Gemma | GPT-4, Mixtral 8x7B, Qwen-MoE |
