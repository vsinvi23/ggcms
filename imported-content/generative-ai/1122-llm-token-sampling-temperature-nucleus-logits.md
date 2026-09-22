# LLM Decoding Strategies: Temperature, Top-K, and Top-P (Nucleus) Sampling

**The Problem:** An LLM does not inherently generate text; it outputs a probability distribution (logits) over its entire vocabulary for the next token. How we select the next token from this distribution drastically affects the model's creativity, coherence, and accuracy.

## The Raw Logits
At step $t$, the model's final linear layer produces a raw, unnormalized score (logit) for every word in the vocabulary (e.g., 32,000 tokens). To convert these to probabilities, we apply the Softmax function.

$P(x_i) = \frac{e^{z_i}}{\sum e^{z_j}}$

If we strictly pick the token with the highest probability ($argmax$), we perform **Greedy Decoding**. This leads to deterministic, repetitive, and often robotic text. To introduce variation, we use sampling.

## Temperature Scaling
Temperature ($T$) modifies the softmax function to sharpen or flatten the probability distribution before sampling.

$P(x_i) = \frac{e^{z_i / T}}{\sum e^{z_j / T}}$

- **T < 1.0 (Low Temperature):** Makes the distribution sharper. High-probability tokens dominate. Output is predictable, focused, and conservative. Useful for code generation or factual Q&A.
- **T = 1.0 (Default):** Standard softmax.
- **T > 1.0 (High Temperature):** Flattens the distribution. Low-probability tokens become more likely. Output is diverse, creative, but prone to hallucinations and incoherence.

```text
Logits: [A: 3.0, B: 1.0, C: 0.1]
T = 0.1 -> P: [A: 99.9%, B: 0.1%, C: 0.0%] (Deterministic)
T = 1.0 -> P: [A: 86.6%, B: 11.7%, C: 1.7%] (Standard)
T = 5.0 -> P: [A: 42.6%, B: 30.1%, C: 27.3%] (Random/Creative)
```

## Top-K Sampling
Sampling from the entire vocabulary is dangerous; the long tail of low-probability tokens can result in gibberish. Top-K sampling truncates the distribution by only considering the $K$ most likely tokens.

1. Sort probabilities in descending order.
2. Select the top $K$ tokens.
3. Zero out the rest and renormalize the probabilities of the top $K$.

**Drawback:** The choice of $K$ is static. If the model is highly confident (one token has 90% probability), Top-K still forces sampling from $K$ tokens, injecting unnecessary noise. If the distribution is flat, $K$ might be too small to allow valid creative choices.

## Top-P (Nucleus) Sampling
Nucleus sampling addresses the static nature of Top-K by dynamically adjusting the pool of candidates based on cumulative probability $P$.

1. Sort probabilities in descending order.
2. Calculate the cumulative sum of probabilities.
3. Include tokens until the cumulative sum exceeds the threshold $P$.
4. Renormalize and sample.

```python
def top_p_filtering(logits, top_p=0.9):
    sorted_logits, sorted_indices = torch.sort(logits, descending=True)
    cumulative_probs = torch.cumsum(F.softmax(sorted_logits, dim=-1), dim=-1)
    
    # Remove tokens with cumulative probability above the threshold
    sorted_indices_to_remove = cumulative_probs > top_p
    # Shift the indices to keep the first token above the threshold
    sorted_indices_to_remove[..., 1:] = sorted_indices_to_remove[..., :-1].clone()
    sorted_indices_to_remove[..., 0] = 0

    # Scatter back and set to -inf
    indices_to_remove = sorted_indices_to_remove.scatter(1, sorted_indices, sorted_indices_to_remove)
    logits[indices_to_remove] = float('-inf')
    return logits
```

**Why it works:** In highly confident states, the top 1 or 2 tokens might sum to $P=0.9$, so only they are considered. In uncertain states, it might take 50 tokens to reach $P=0.9$, allowing for broader selection.

### Best Practices
Modern APIs allow combining these. Typically, you apply Temperature first to adjust the baseline entropy, then Top-K for a hard cutoff of the long tail, and finally Top-P for dynamic nucleus shaping.