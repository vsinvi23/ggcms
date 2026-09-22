# LLM Decoding Strategies: Temperature, Top-K, and Nucleus (Top-P) Sampling

## The Problem: The Determinism vs. Creativity Trade-off
At its core, a causal language model predicts a probability distribution over the vocabulary for the next token. The simplest decoding strategy is **Greedy Decoding**, where the model always selects the token with the highest probability. 

While greedy decoding works well for structured tasks like code generation or JSON extraction, it fails catastrophically in open-ended text generation, frequently devolving into repetitive, deterministic loops (e.g., "I went to the store to buy a book and a book and a book..."). 

To generate natural, "creative" text, we must *sample* from the distribution. However, pure random sampling inevitably hits the "long tail" of the distribution, selecting absurd tokens that destroy the sentence's semantic coherence.

## Architecture: Modulating the Logits

Before probabilities are calculated, the model outputs raw, unnormalized scores called **logits**. All decoding strategies operate by mathematically modifying these logits before or during the `Softmax` operation.

### 1. Temperature Scaling
Temperature ($T$) modulates the "sharpness" of the probability distribution. It scales the logits before the Softmax function is applied.

$$ P(x_i) = \frac{\exp(logit_i / T)}{\sum_j \exp(logit_j / T)} $$

- $T = 1.0$: The baseline distribution.
- $T < 1.0$: The distribution becomes sharper. High-probability tokens dominate even more. $T=0$ approximates Greedy Decoding.
- $T > 1.0$: The distribution flattens. Lower-probability tokens become more likely, increasing "creativity" but risking hallucination.

### 2. Top-K Sampling
Top-K sampling truncates the distribution. We sort the vocabulary by probability and drop all tokens except the top $K$. The remaining $K$ tokens are re-normalized so their probabilities sum to 1.

*The flaw:* If the model is highly confident (e.g., the top token has 90% probability, and the next 9 are flat at 1%), Top-K still forces the model to consider the low-confidence tokens, potentially injecting gibberish.

### 3. Top-P (Nucleus) Sampling
Instead of a fixed number of tokens, Top-P selects the *smallest set of tokens* whose cumulative probability mass exceeds the threshold $P$. 

If $P = 0.9$, and the top two tokens have probabilities of 0.85 and 0.06, only those two tokens are kept ($0.85 + 0.06 = 0.91 \ge 0.9$). This dynamically adjusts the candidate pool: narrow when the model is confident, wide when the model is uncertain.

```text
[ Top-P Nucleus Sampling Diagram ]

Probabilities sorted descending:
Token A: 0.50 --\
Token B: 0.30 ----> Cumulative: 0.80. If P=0.9, keep adding.
Token C: 0.15 ----> Cumulative: 0.95. Stop! 
Token D: 0.02 --\
Token E: 0.01 ----> Discarded.
Token F: 0.02 --/
```

## Robust Implementation

Here is a pure PyTorch implementation demonstrating how these filters are applied to raw logits in a custom decoding loop.

```python
import torch
import torch.nn.functional as F

def decode_step(logits: torch.Tensor, temperature: float = 1.0, top_k: int = 50, top_p: float = 0.9):
    """
    Applies Temperature, Top-K, and Top-P filtering to logits.
    logits shape: (vocab_size,)
    """
    # 1. Apply Temperature
    logits = logits / temperature
    
    # 2. Apply Top-K
    if top_k > 0:
        # Find the k-th largest logit
        v, _ = torch.topk(logits, top_k)
        kth_val = v[-1]
        # Mask everything below the k-th value
        logits[logits < kth_val] = -float('Inf')
        
    # 3. Apply Top-P (Nucleus)
    if top_p > 0.0:
        sorted_logits, sorted_indices = torch.sort(logits, descending=True)
        cumulative_probs = torch.cumsum(F.softmax(sorted_logits, dim=-1), dim=-1)
        
        # Remove tokens with cumulative probability above the threshold
        sorted_indices_to_remove = cumulative_probs > top_p
        
        # Shift the indices to the right to keep the first token above threshold
        sorted_indices_to_remove[1:] = sorted_indices_to_remove[:-1].clone()
        sorted_indices_to_remove[0] = 0
        
        # Scatter the mask back to the original logits shape
        indices_to_remove = sorted_indices_to_remove.scatter(
            0, sorted_indices, sorted_indices_to_remove
        )
        logits[indices_to_remove] = -float('Inf')
        
    # 4. Sample from the final filtered distribution
    probs = F.softmax(logits, dim=-1)
    next_token = torch.multinomial(probs, num_samples=1)
    
    return next_token
```

## Strategic Takeaways
Modern API parameters often expose all three variables. The standard best practice is to set $T \approx 0.7$ and $P \approx 0.9$, while keeping $K = 50$. This combination ensures that the model can escape deterministic loops while relying on the dynamic boundary of the Top-P nucleus to physically prevent catastrophic sampling errors.