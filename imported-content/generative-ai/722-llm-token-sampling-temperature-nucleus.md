# LLM Decoding Strategies: Temperature, Top-K, and Top-P (Nucleus) Sampling

### The Problem: Balancing Creativity and Coherence in LLM Decoding

An LLM's final feedforward layer outputs a vector of raw, unnormalized real values called **logits** ($z$), with one value for each token in the model's vocabulary. 

To convert these logits into a probability distribution, we apply the standard softmax function. However, using a naive greedy search (always selecting the token with the highest probability, $\text{argmax}$) makes the model highly deterministic and repetitive. Greedy search often traps the model in local loops (e.g., repeating the same sentence indefinitely) and prevents it from exploring creative or nuanced phrasing.

```
Deterministic vs Random Token Selection:
  Logits (z) -> [Greedy Search] -> Deterministic & Repetitive (Low Entropy)
  Logits (z) -> [Unconstrained Softmax] -> High Halucination & Incoherence (High Entropy)
```

Conversely, completely unconstrained random sampling from the full softmax distribution introduces too much entropy. This allows extremely low-probability tokens to be selected, resulting in gibberish, grammatical errors, and sudden hallucinations. To generate natural, coherent, and creative text, we need a configurable way to scale and truncate this probability distribution before sampling.

---

### Technical Architectures

```
Logits Post-Processing Pipeline
+--------------------+      +--------------------+      +--------------------+      +---------------------+
| Raw Logits Vector  | ---> | Temperature Scaling| ---> |   Top-K Filtering  | ---> | Top-P (Nucleus) Filt|
| [z_1, z_2, ...,v]  |      |  z_i / T           |      | Truncate index > K |      | Dynamic CumProb < P |
+--------------------+      +--------------------+      +--------------------+      +---------------------+
                                                                                               |
                                                                                               v
                                                                                    +---------------------+
                                                                                    | Re-normalized Prob  |
                                                                                    | & Categorical Sample|
                                                                                    +---------------------+
```

#### Temperature ($T$) Scaling
Temperature scales the logits before the softmax normalization. It controls the entropy (flatness) of the resulting probability distribution:

$$q_i = \frac{\exp(z_i / T)}{\sum_j \exp(z_j / T)}$$

- **When $T \to 0$:** The distribution collapses into a one-hot vector at the maximum logit, making the model equivalent to greedy search.
- **When $T > 1$:** The differences between logits are flattened, rendering the output highly random, creative, and eventually incoherent.

#### Top-K Truncation
Top-K sampling restricts the pool of candidate tokens to the $K$ most likely options. All other tokens have their probabilities set to $-\infty$ (or $0$ after softmax) and are discarded. While effective, Top-K uses a rigid, static boundary. If the probability mass is concentrated in just one or two tokens, Top-K still forces the model to choose from $K$ options, which can introduce irrelevant words. If the distribution is highly flat (e.g., listing synonyms), Top-K might cut off valid alternatives prematurely.

#### Top-P (Nucleus) Truncation
Top-P (Nucleus) sampling addresses this limitation by dynamically adjusting the selection boundary. It sorts the vocabulary by probability in descending order and selects the smallest set of tokens whose cumulative probability exceeds the threshold $P \in [0, 1]$:

$$\sum_{i=1}^{U} P(\text{token}_i) \ge P$$

Only this dynamic "nucleus" of tokens is kept. The remaining tokens are discarded, and the probabilities of the retained tokens are re-normalized to sum to 1. This allows the sampling pool to shrink when the model is confident and expand when it is uncertain.

---

### Comparison of Sampling Truncations

| Strategy | Selection Bound | Computational Cost | Primary Use Case |
| :--- | :--- | :--- | :--- |
| **Greedy** | Static ($K=1$) | Minimal ($O(1)$) | Code execution, mathematics, factual QA |
| **Top-K** | Static count ($K$) | $O(V \log V)$ sort | Controlling general response vocabulary |
| **Top-P** | Dynamic cumulative mass ($P$) | $O(V \log V)$ sort + prefix sum | Creative writing, open-ended conversational agents |

---

### Implementation: A Comprehensive Multi-Strategy Logits Sampler

This Python function implements the complete post-processing pipeline. It takes raw logits, applies temperature scaling, applies Top-K filtering, applies Top-P (Nucleus) filtering, and then samples a token.

```python
import torch
import torch.nn.functional as F

def sample_logits(logits: torch.Tensor, temperature: float = 1.0, top_k: int = 0, top_p: float = 0.0) -> int:
    """Applies Temperature, Top-K, and Top-P filtering to raw logits and returns a sample."""
    
    # 1. Apply Temperature Scaling
    if temperature != 1.0:
        # Prevent division by zero
        temperature = max(temperature, 1e-5)
        logits = logits / temperature

    # Clone logits to avoid modifying the original tensor
    filtered_logits = logits.clone()

    # 2. Apply Top-K Truncation
    if top_k > 0:
        # Determine the cutoff value of the top-k-th token
        top_k = min(top_k, logits.size(-1))
        indices_to_remove = logits < torch.topk(logits, top_k)[0][..., -1, None]
        filtered_logits[indices_to_remove] = float('-inf')

    # 3. Apply Top-P (Nucleus) Truncation
    if 0.0 < top_p < 1.0:
        # Sort logits in descending order
        sorted_logits, sorted_indices = torch.sort(filtered_logits, descending=True)
        cumulative_probs = torch.cumsum(F.softmax(sorted_logits, dim=-1), dim=-1)

        # Shift cumulative probabilities to the right to keep the first token that exceeds top_p
        sorted_indices_to_remove = cumulative_probs > top_p
        sorted_indices_to_remove[..., 1:] = sorted_indices_to_remove[..., :-1].clone()
        sorted_indices_to_remove[..., 0] = False # Always keep at least the top token

        # Map back to original logit indices and mask them out
        indices_to_remove = sorted_indices[sorted_indices_to_remove]
        filtered_logits[indices_to_remove] = float('-inf')

    # 4. Re-normalize and Sample
    probabilities = F.softmax(filtered_logits, dim=-1)
    sampled_token = torch.multinomial(probabilities, num_samples=1)
    
    return int(sampled_token.item())

# Verification Execution
if __name__ == "__main__":
    torch.manual_seed(42)
    # Mock logit vector for a vocabulary of size 6
    mock_logits = torch.tensor([2.0, 1.5, 0.1, -1.0, -3.0, 0.5])
    
    print("Raw Input Logits:", mock_logits)
    print("Normal Softmax Probabilities:", F.softmax(mock_logits, dim=-1).tolist())
    
    # Sample with conservative high temperature
    token_temp_high = sample_logits(mock_logits, temperature=1.5, top_k=0, top_p=0.0)
    print(f"Sampled Token (T=1.5): {token_temp_high}")
    
    # Sample with Top-K = 2
    token_top_k = sample_logits(mock_logits, temperature=1.0, top_k=2, top_p=0.0)
    print(f"Sampled Token (Top-K=2): {token_top_k}")
    
    # Sample with Nucleus Top-P = 0.8
    token_top_p = sample_logits(mock_logits, temperature=1.0, top_k=0, top_p=0.8)
    print(f"Sampled Token (Top-P=0.8): {token_top_p}")
```

### Key Takeaway
Logit post-processing is a powerful tool for controlling LLM generation. Temperature adjusts the overall distribution's flatness, Top-K sets a strict limit on the number of candidate tokens, and Top-P dynamically scales the candidate pool based on the model's confidence. Combining these techniques allows developers to tailor the model's outputs for both deterministic tasks (like coding) and creative applications.
