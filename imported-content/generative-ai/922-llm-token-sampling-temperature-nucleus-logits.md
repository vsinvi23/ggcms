# LLM Decoding Strategies: Temperature, Top-K, and Top-P (Nucleus) Sampling

**The Problem:** LLMs do not output text; they output a probability distribution (logits) over their entire vocabulary for the next token. Selecting the next token from this distribution dictates the creativity, coherence, and determinism of the output. Greedy decoding (picking the highest probability token) causes repetitive loops. Sampling strategies reshape the distribution to balance exploration and exploitation.

## The Logit Pipeline

The final layer of a Transformer produces a vector of raw, unnormalized scores called logits ($z_i$). These are passed through a Softmax function to become probabilities ($p_i$).

$$ p_i = \frac{\exp(z_i)}{\sum_j \exp(z_j)} $$

## Temperature Scaling

Temperature ($T$) scales the logits before the Softmax function. It directly controls the "sharpness" of the distribution.

$$ p_i = \frac{\exp(z_i / T)}{\sum_j \exp(z_j / T)} $$

### Mechanics
- **$T = 1.0$:** Standard Softmax. Base distribution.
- **$T < 1.0$ (e.g., 0.2):** Divides logits by a small number, making the large logits much larger relative to the others. The distribution becomes "sharper" (more deterministic). As $T \to 0$, it approximates Greedy Decoding.
- **$T > 1.0$ (e.g., 1.5):** Divides logits by a larger number, pushing them closer together. The distribution becomes "flatter". Rare words gain probability, increasing randomness and hallucinations.

```python
import torch
import torch.nn.functional as F

logits = torch.tensor([2.0, 1.0, 0.1, -1.0])

# T = 1.0
probs_1 = F.softmax(logits, dim=0) # [0.659, 0.242, 0.099, 0.000]

# T = 0.5 (More deterministic)
probs_0_5 = F.softmax(logits / 0.5, dim=0) # [0.876, 0.118, 0.006, 0.000]

# T = 2.0 (More random)
probs_2 = F.softmax(logits / 2.0, dim=0) # [0.463, 0.281, 0.179, 0.077]
```

## Top-K Sampling

Top-K truncates the vocabulary by strictly keeping only the top $K$ most likely tokens and setting the probability of all other tokens to zero.

### Mechanics
1. Sort probabilities in descending order.
2. Select the top $K$ tokens.
3. Redistribute the probability mass among these $K$ tokens via Softmax.

**Drawback:** The shape of the distribution changes depending on the context. Sometimes there are 10 equally good words; sometimes there is only 1 obvious word. A static $K=50$ might include garbage tokens in a highly deterministic context, or exclude great tokens in a highly open context.

## Top-P (Nucleus) Sampling

Top-P resolves the rigidness of Top-K by dynamically adjusting the number of candidates based on the cumulative probability mass.

### Mechanics
1. Sort probabilities in descending order.
2. Calculate the cumulative sum of probabilities.
3. Keep tokens until the cumulative sum exceeds the threshold $P$ (e.g., 0.9).
4. Mask out the rest and renormalize.

```python
def top_p_sampling(logits, p=0.9):
    # Sort logits
    sorted_logits, sorted_indices = torch.sort(logits, descending=True)
    
    # Calculate probabilities and cumulative sum
    probs = F.softmax(sorted_logits, dim=-1)
    cumulative_probs = torch.cumsum(probs, dim=-1)
    
    # Identify tokens to remove (cumulative prob > p)
    # Shift by one to ensure the token that crosses the threshold is kept
    sorted_indices_to_remove = cumulative_probs > p
    sorted_indices_to_remove[..., 1:] = sorted_indices_to_remove[..., :-1].clone()
    sorted_indices_to_remove[..., 0] = 0
    
    # Scatter back to original indices and mask
    indices_to_remove = sorted_indices_to_remove.scatter(0, sorted_indices, sorted_indices_to_remove)
    logits[indices_to_remove] = float('-inf')
    
    return F.softmax(logits, dim=-1)
```

### Why Nucleus is Superior
If the model is highly confident, $P=0.9$ might be reached in just 2 tokens. If the model is uncertain, it might take 40 tokens to reach $P=0.9$. This dynamic truncation preserves the "nucleus" of the distribution, ensuring high quality without artificial limitations.

### Combining Them All
In practice, inference engines apply these sequentially:
1. Apply Temperature scaling.
2. Apply Top-K filter.
3. Apply Top-P filter.
4. Sample from the resulting distribution.
```
