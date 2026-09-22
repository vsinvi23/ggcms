# LLM Decoding Strategies: Temperature, Top-K, and Top-P (Nucleus) Sampling

## The Problem: The Pitfalls of Greedy vs Unconstrained Sampling

At each generation step, a Large Language Model projects its final hidden state onto the vocabulary dimension, producing a vector of raw **logits** ($y \in \mathbb{R}^{|V|}$). Converting these logits directly into a probability distribution via Softmax and choosing the token with the highest probability is known as **Greedy Decoding (Argmax)**.

```
Logits (Raw Outputs) ---> [ Softmax ] ---> Probabilities ---> [ Argmax ] ---> Select Highest (Greedy)
```

Greedy decoding has several major limitations:
* **Repetitive Loops**: The model often gets stuck in loops (e.g., *"the system is running, running, running..."*).
* **Banal Responses**: It always selects the most obvious token, resulting in flat, uninspired text.
* **Prone to Local Minima**: High-probability tokens early on can lead to low-probability paths later in the generation.

Conversely, sampling completely unconstrained from the full softmax probability distribution is also problematic. The long tail of the vocabulary contains thousands of irrelevant tokens. If the model samples one of these (e.g., a $0.001\%$ chance of a typo or weird character), the generation becomes nonsensical. 

We need decoding strategies that dynamically prune bad choices while allowing the model to make creative, coherent selections.

---

## Technical Solutions: Temperature, Top-K, and Top-P

Modern LLMs combine three mathematical filters sequentially to shape the token probability distribution: **Temperature**, **Top-K**, and **Top-P**.

```
   Raw Logits Matrix
          |
          v
+---------+----------+
| Temperature Scaling|  ===> Adjusts distribution entropy (flattens or sharpens)
+---------+----------+
          |
          v
+---------+----------+
|    Top-K Filter    |  ===> Keeps only the top K highest-probability tokens
+---------+----------+
          |
          v
+---------+----------+
|  Top-P (Nucleus)   |  ===> Keeps only the smallest set of tokens whose sum exceeds P
+---------+----------+
          |
          v
   Re-normalized Softmax ---> Multinomial Sample ---> Final Token ID
```

### 1. Temperature Scaling
Before applying softmax, logits are divided by a hyperparameter $T$ called Temperature:

$$p_i = \frac{\exp(y_i / T)}{\sum_j \exp(y_j / T)}$$

* **High Temperature ($T > 1.0$)**: Flattens the distribution, bringing token probabilities closer together. This increases entropy, making the output more creative, diverse, and unpredictable.
* **Low Temperature ($0 < T < 1.0$)**: Sharpens the peaks of the distribution. High-probability tokens dominate, making the model highly confident, conservative, and deterministic. As $T \to 0$, this behaves exactly like greedy decoding.

### 2. Top-K Sampling
Top-K limits sampling to a fixed number ($K$) of the most probable tokens. For example, if $K=50$, the model zero-fills the probabilities of all tokens ranked below 50. This guarantees that the model will never sample an extremely rare or irrelevant token.

### 3. Top-P (Nucleus) Sampling
Top-K's flaw is that it is static. If the model is highly confident (e.g., predicting the next token in `"United States of..."`), the probability of `"America"` might be $99\%$, and the remaining 49 tokens are highly unlikely. Conversely, in open-ended prompts, the top 50 tokens might all be equally plausible.

Top-P (Holtzman et al., 2019) solves this by dynamically resizing the selection pool based on a cumulative probability threshold $p$ (e.g., $p=0.90$). The model sorts the vocabulary descending by probability and selects the smallest subset of tokens whose cumulative probability exceeds $p$:

$$\sum_{i \in V_{\text{nucleus}}} p_i \ge p$$

All tokens outside this "nucleus" are masked out.

---

## PyTorch Implementation of the Complete Decoding Pipeline

Below is a robust PyTorch implementation of the full decoding pipeline, executing temperature scaling, Top-K filtering, and Top-P (Nucleus) filtering sequentially on raw model logits.

```python
import torch
import torch.nn.functional as F

def sample_next_token(
    logits: torch.Tensor, 
    temperature: float = 0.7, 
    top_k: int = 50, 
    top_p: float = 0.9
) -> torch.Tensor:
    """
    Transforms raw logits into a clean token ID using Temperature, Top-K, and Top-P.
    Args:
        logits: Raw outputs from the model [batch_size, vocab_size]
        temperature: Temperature scaling factor (> 0.0)
        top_k: Static token limit (0 to disable)
        top_p: Cumulative probability threshold (0.0 to 1.0)
    """
    # 1. Apply Temperature Scaling
    if temperature > 0:
        logits = logits / temperature
    else:
        # Temperature of 0 is equivalent to greedy decoding (argmax)
        return torch.argmax(logits, dim=-1, keepdim=True)

    # We work on a copy to avoid in-place mutations of historical graphs
    filtered_logits = logits.clone()
    batch_size, vocab_size = logits.shape

    # 2. Apply Top-K Filtering
    if top_k > 0:
        top_k = min(top_k, vocab_size)
        # Find the threshold value for each batch element
        values, _ = torch.topk(filtered_logits, top_k, dim=-1)
        min_values = values[:, -1].unsqueeze(-1) # Get the K-th value
        # Mask out all values below the K-th value
        filtered_logits = torch.where(
            filtered_logits < min_values, 
            torch.tensor(float('-inf'), device=logits.device), 
            filtered_logits
        )

    # 3. Apply Top-P (Nucleus) Filtering
    if top_p < 1.0 and top_p > 0.0:
        # Sort logits in descending order
        sorted_logits, sorted_indices = torch.sort(filtered_logits, descending=True, dim=-1)
        sorted_probs = F.softmax(sorted_logits, dim=-1)
        
        # Compute cumulative probabilities
        cumulative_probs = torch.cumsum(sorted_probs, dim=-1)
        
        # Shift the mask to include the first token that exceeds top_p
        sorted_indices_to_remove = cumulative_probs > top_p
        sorted_indices_to_remove[:, 1:] = sorted_indices_to_remove[:, :-1].clone()
        sorted_indices_to_remove[:, 0] = False # Never remove the top-1 choice
        
        # Scatter the mask back to the original index positions
        # True values in sorted_indices_to_remove get mapped back to their original index
        indices_to_remove = sorted_indices_to_remove.scatter(
            dim=-1, 
            index=sorted_indices, 
            src=sorted_indices_to_remove
        )
        
        # Mask filtered logits to negative infinity
        filtered_logits = filtered_logits.masked_fill(indices_to_remove, float('-inf'))

    # 4. Compute Softmax and Sample
    probs = F.softmax(filtered_logits, dim=-1)
    # Sample from multinomial distribution
    next_token = torch.multinomial(probs, num_samples=1)
    
    return next_token

if __name__ == "__main__":
    # Smoke test validating pipeline routing
    torch.manual_seed(101)
    vocab_size = 100
    batch_size = 2
    
    # Generate random logits representing raw model outputs
    mock_logits = torch.randn(batch_size, vocab_size) * 5.0
    
    # Execute token selection
    sampled_tokens = sample_next_token(mock_logits, temperature=0.8, top_k=10, top_p=0.85)
    
    print(f"Logits Input Shape: {mock_logits.shape}")
    print(f"Sampled Token IDs:  {sampled_tokens.squeeze(-1).tolist()}")
    
    # Validate tensor mapping shape
    assert sampled_tokens.shape == (batch_size, 1), "Sampling shape mismatch!"
    print("Decoding pipeline simulation validated successfully.")
```

---

## Architectural Comparison Matrix

| Property | Greedy Decoding | Temperature Scaling | Top-K Sampling | Top-P (Nucleus) Sampling |
| :--- | :--- | :--- | :--- | :--- |
| **Concept** | Select argmax | Scale logits | Fixed pool size | Dynamic pool size |
| **Determinism**| $100\%$ Deterministic| Scalable | Stochastic | Highly Stochastic |
| **Latency** | Extremely Low | Low | Low | Moderate (sorting cost) |
| **Risk of Loops**| Very High | Low | Low | Extremely Low |
| **Best Used For**| Coding, Math, QA | Open-ended chat | Creative text | Creative, narrative text |
