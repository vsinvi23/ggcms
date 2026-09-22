# LLM Decoding Strategies: Temperature, Top-K, and Top-P (Nucleus) Sampling

### The Problem: Determinism vs. Creativity
At the end of an LLM's forward pass, the model outputs a vector of raw, unnormalized scores called *logits*—one for every token in the vocabulary. To pick the next word, these logits must be converted into probabilities.

If we always pick the token with the highest probability (Greedy Decoding), the output becomes highly deterministic, repetitive, and robotic. On the other hand, if we sample purely randomly from the probability distribution, the model might hallucinate or produce incoherent gibberish by selecting statistically unlikely tokens. 

Decoding strategies mathematically manipulate the logits to balance coherence and creativity. The three most vital knobs are Temperature, Top-K, and Top-P (Nucleus) Sampling.

### 1. Temperature: Scaling the Logits
Temperature ($T$) controls the "sharpness" of the probability distribution. It is applied *before* the Softmax function.

Given a logit $z_i$, the scaled probability $p_i$ is calculated as:
$$p_i = \frac{\exp(z_i / T)}{\sum_j \exp(z_j / T)}$$

*   **T < 1.0 (Low Temperature)**: Divides logits by a fraction, making positive logits much larger. The distribution sharpens, exaggerating differences. The model becomes more deterministic, factual, and rigid. (Used for coding, JSON output).
*   **T = 1.0**: Standard Softmax.
*   **T > 1.0 (High Temperature)**: Divides logits by a larger number, pushing them closer to zero. The Softmax distribution flattens, making all tokens more equally likely. The model becomes more creative and unpredictable. (Used for poetry, brainstorming).

```text
+---------------------------------------------------+
|               Temperature Effects                 |
+---------------------------------------------------+
| Logits: [10, 8, 4]                                |
|                                                   |
| T = 0.5 (Low)  -> Probs: [98.1%,  1.8%,  0.0%]    |
| T = 1.0 (Base) -> Probs: [88.0%, 11.9%,  0.1%]    |
| T = 2.0 (High) -> Probs: [66.5%, 24.5%,  9.0%]    |
+---------------------------------------------------+
```

### 2. Top-K Sampling: Truncating the Tail
Even with temperature adjustments, the "long tail" of the vocabulary contains tens of thousands of highly unlikely words. High temperature might randomly sample from this tail, causing hallucinations.

**Top-K Sampling** solves this by strictly limiting the sampling pool to the $K$ most likely tokens.
1. Sort all logits in descending order.
2. Keep only the top $K$ tokens (e.g., $K=50$).
3. Set the probability of all other tokens to $0$ (or logit to $-\infty$).
4. Re-normalize the remaining $K$ probabilities using Softmax.

*Problem with Top-K*: $K$ is static. If the model is highly confident in only 2 words, Top-K=50 still allows 48 bad choices. If the model is uncertain and 100 words are viable, Top-K=50 artificially truncates good options.

### 3. Top-P (Nucleus) Sampling: Dynamic Truncation
To solve the static nature of Top-K, **Top-P (Nucleus) Sampling** evaluates the *cumulative probability* mass.

Instead of selecting a fixed number of tokens, Top-P selects the smallest set of tokens whose cumulative probability exceeds the threshold $P$ (e.g., $P=0.90$).

1. Sort tokens by probability in descending order.
2. Iterate through the list, adding probabilities to a running total.
3. Stop when the total $\ge P$.
4. Discard all subsequent tokens and re-normalize.

```python
# Conceptual Implementation of Top-P (Nucleus) Sampling
import torch
import torch.nn.functional as F

def top_p_sampling(logits, p=0.9):
    # 1. Sort logits descending
    sorted_logits, sorted_indices = torch.sort(logits, descending=True)
    
    # 2. Convert to probabilities
    probs = F.softmax(sorted_logits, dim=-1)
    
    # 3. Calculate cumulative probabilities
    cumulative_probs = torch.cumsum(probs, dim=-1)
    
    # 4. Find tokens to remove (cumulative prob > p)
    # Shift by one to ensure the token that crosses the threshold is kept
    sorted_indices_to_remove = cumulative_probs > p
    sorted_indices_to_remove[..., 1:] = sorted_indices_to_remove[..., :-1].clone()
    sorted_indices_to_remove[..., 0] = 0
    
    # 5. Mask out removed tokens
    indices_to_remove = sorted_indices_to_remove.scatter(
        1, sorted_indices, sorted_indices_to_remove
    )
    logits[indices_to_remove] = float('-inf')
    
    # 6. Final sampling from re-normalized distribution
    return torch.multinomial(F.softmax(logits, dim=-1), num_samples=1)
```

### Conclusion: The Combined Pipeline
In production systems, these strategies are combined in a specific order:
1. Apply **Temperature** to scale raw logits.
2. Apply **Top-K** to chop off the extreme long tail.
3. Apply **Top-P** to dynamically adjust the candidate pool based on confidence.
4. Sample from the resulting distribution.

Mastering these hyperparameters is essential for Prompt Engineering and LLM API integration. For deterministic tasks like SQL generation, use `T=0.1, Top-P=0.1`. For open-ended creative writing, use `T=0.8, Top-P=0.9`.
