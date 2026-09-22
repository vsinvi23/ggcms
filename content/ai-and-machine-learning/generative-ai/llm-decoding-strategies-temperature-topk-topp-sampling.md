---
title: "LLM Decoding Strategies: Temperature, Top-K, and Top-P (Nucleus) Sampling"
description: "How raw LLM logits get turned into the next token, why greedy decoding loops and pure random sampling hallucinates, and how to implement a combined temperature + Top-K + Top-P sampler in PyTorch."
type: "ARTICLE"
categorySlug: "generative-ai"
articleType: "GUIDE"
tags:
  - "llm-decoding"
  - "temperature-sampling"
  - "top-k-sampling"
  - "nucleus-sampling"
  - "logits"
  - "prompt-engineering"
---

# LLM Decoding Strategies: Temperature, Top-K, and Top-P (Nucleus) Sampling

You're calling an LLM API to generate SQL from natural language, and separately, calling the same model to write marketing copy. You ship both with the default settings. The SQL generator occasionally invents a column name that doesn't exist in the schema. The marketing copy reads like it was written by a committee — safe, repetitive, the same three adjectives every time. Both problems trace back to the same knob you didn't set: how the model turns its raw output into a chosen word, and that knob has different correct answers for the two tasks.

That knob is **decoding strategy** — temperature, Top-K, and Top-P (nucleus) sampling — and understanding what each one actually does mathematically is the difference between guessing at API parameters and choosing them deliberately.

## The Problem: Balancing Determinism and Creativity

At the end of an LLM's forward pass, the final layer produces a vector of raw, unnormalized real values called **logits** ($z$), one for every token in the model's vocabulary — tens of thousands of numbers, each representing "how strongly the model favors this token as the next one."

To turn logits into a probability distribution you need to run them through **softmax**. But how you sample from that distribution matters enormously:

```
Deterministic vs. Random Token Selection:
  Logits (z) -> [Greedy Search, argmax]   -> Deterministic & repetitive (low entropy)
  Logits (z) -> [Unconstrained softmax]   -> Frequent hallucination (high entropy)
```

- **Greedy search** (always take the highest-probability token) is fully deterministic. It traps the model in loops — repeating the same sentence, the same phrase — because it never explores an alternative that might have been only slightly less likely but led somewhere better.
- **Unconstrained random sampling** from the full softmax distribution goes too far the other way. Vocabularies have tens of thousands of tokens; even a "1% probability" tail token gets picked eventually, and picking it produces a grammatically broken or nonsensical continuation.

Production decoding needs a way to scale and truncate the distribution *before* sampling — narrow enough to stay coherent, wide enough to avoid repetition. That's what temperature, Top-K, and Top-P each do, at a different point in the pipeline.

## The Logits Post-Processing Pipeline

```
+--------------------+     +---------------------+     +--------------------+     +----------------------+
| Raw Logits Vector  | --> | Temperature Scaling  | --> |  Top-K Filtering    | --> | Top-P (Nucleus) Filt |
| [z_1, z_2, ..., z_v]|    |  z_i / T             |     | Truncate rank > K  |     | Dynamic CumProb < P  |
+--------------------+     +---------------------+     +--------------------+     +----------------------+
                                                                                              |
                                                                                              v
                                                                                   +----------------------+
                                                                                   | Re-normalize & sample|
                                                                                   +----------------------+
```

Each stage is optional and independently tunable; production systems typically apply all three in this order.

### 1. Temperature ($T$): Scaling the Logits

Temperature is applied *before* softmax, dividing every logit by $T$:

$$q_i = \frac{\exp(z_i / T)}{\sum_j \exp(z_j / T)}$$

- **$T \to 0$**: Dividing by a tiny number massively exaggerates differences between logits. The distribution collapses toward a one-hot vector at the max logit — equivalent to greedy search.
- **$T = 1.0$**: Standard softmax, unmodified.
- **$T > 1$**: Dividing by a larger number pushes logits toward zero, flattening the distribution — every token becomes more equally likely, so output becomes more random and, past a point, incoherent.

Concretely, for logits `[10, 8, 4]`:

```
+-----------------------------------------------------+
|               Temperature Effects                   |
+-----------------------------------------------------+
| Logits:  [10, 8, 4]                                 |
|                                                       |
| T = 0.5 (low)  -> Probs: [98.1%,  1.8%,  0.0%]      |
| T = 1.0 (base) -> Probs: [88.0%, 11.9%,  0.1%]      |
| T = 2.0 (high) -> Probs: [66.5%, 24.5%,  9.0%]      |
+-----------------------------------------------------+
```

Notice the ranking never changes — token 1 is always most likely — only how *sharply* the model prefers it. That's temperature's whole job: it reshapes confidence, it never reorders it.

### 2. Top-K Truncation

Even after temperature scaling, the vocabulary's long tail — tens of thousands of implausible tokens — still has nonzero probability. Top-K sampling caps the candidate pool at a fixed size:

1. Sort logits descending.
2. Keep only the top $K$ tokens.
3. Set every other token's logit to $-\infty$ (probability 0 after softmax).
4. Re-normalize the remaining $K$ probabilities.

Top-K's weakness is that $K$ is **static**. If the model is extremely confident and only 2 tokens are genuinely plausible, $K=50$ still forces the sampler to consider 48 bad options. If the model is uncertain and 100 tokens are all reasonable synonyms, $K=50$ artificially truncates good ones.

### 3. Top-P (Nucleus) Truncation

Top-P fixes Top-K's rigid boundary by truncating on **cumulative probability mass** instead of a fixed count:

$$\sum_{i=1}^{U} P(\text{token}_i) \ge P$$

Sort tokens by probability descending, and keep the smallest set whose cumulative probability crosses threshold $P$ (e.g. $P = 0.9$). Everything else is discarded and the kept set is re-normalized.

This nucleus shrinks when the model is confident (a couple of tokens might already sum past $P$) and expands when the model is uncertain (it takes many tokens to reach $P$) — which is exactly the adaptive behavior Top-K can't provide.

## Comparison

| Strategy | Selection bound | Computational cost | Primary use case |
|---|---|---|---|
| **Greedy** | Static ($K=1$) | Minimal, $O(1)$ | Code execution, math, factual QA |
| **Top-K** | Static count ($K$) | $O(V \log V)$ sort | Controlling general response vocabulary |
| **Top-P** | Dynamic cumulative mass ($P$) | $O(V \log V)$ sort + prefix sum | Creative writing, open-ended conversation |

## Implementation: A Combined Temperature + Top-K + Top-P Sampler

This function implements the full pipeline against raw logits: temperature scaling, then Top-K filtering, then Top-P filtering, then sampling.

```python
import torch
import torch.nn.functional as F


def sample_logits(
    logits: torch.Tensor,
    temperature: float = 1.0,
    top_k: int = 0,
    top_p: float = 0.0,
) -> int:
    """Applies Temperature, Top-K, and Top-P filtering to raw logits and returns a sampled token id."""

    # 1. Temperature scaling
    if temperature != 1.0:
        temperature = max(temperature, 1e-5)  # guard against division by zero
        logits = logits / temperature

    filtered_logits = logits.clone()

    # 2. Top-K truncation
    if top_k > 0:
        top_k = min(top_k, logits.size(-1))
        # cutoff = the logit value of the k-th ranked token
        cutoff = torch.topk(logits, top_k)[0][..., -1, None]
        indices_to_remove = logits < cutoff
        filtered_logits[indices_to_remove] = float("-inf")

    # 3. Top-P (nucleus) truncation
    if 0.0 < top_p < 1.0:
        sorted_logits, sorted_indices = torch.sort(filtered_logits, descending=True)
        cumulative_probs = torch.cumsum(F.softmax(sorted_logits, dim=-1), dim=-1)

        # Shift right by one so the token that CROSSES the threshold is kept
        sorted_indices_to_remove = cumulative_probs > top_p
        sorted_indices_to_remove[..., 1:] = sorted_indices_to_remove[..., :-1].clone()
        sorted_indices_to_remove[..., 0] = False  # always keep at least the top token

        indices_to_remove = sorted_indices[sorted_indices_to_remove]
        filtered_logits[indices_to_remove] = float("-inf")

    # 4. Re-normalize and sample
    probabilities = F.softmax(filtered_logits, dim=-1)
    sampled_token = torch.multinomial(probabilities, num_samples=1)
    return int(sampled_token.item())


if __name__ == "__main__":
    torch.manual_seed(42)
    mock_logits = torch.tensor([2.0, 1.5, 0.1, -1.0, -3.0, 0.5])

    print("Raw logits:", mock_logits)
    print("Standard softmax probs:", F.softmax(mock_logits, dim=-1).tolist())

    # Conservative: high temperature only
    token_temp_high = sample_logits(mock_logits, temperature=1.5, top_k=0, top_p=0.0)
    print(f"Sampled token (T=1.5): {token_temp_high}")

    # Top-K = 2: force the choice between only the two best candidates
    token_top_k = sample_logits(mock_logits, temperature=1.0, top_k=2, top_p=0.0)
    print(f"Sampled token (Top-K=2): {token_top_k}")

    # Nucleus Top-P = 0.8: keep the smallest set whose cumulative mass exceeds 0.8
    token_top_p = sample_logits(mock_logits, temperature=1.0, top_k=0, top_p=0.8)
    print(f"Sampled token (Top-P=0.8): {token_top_p}")
```

## Choosing Values for Real Tasks

| Task | Temperature | Top-P | Why |
|---|---|---|---|
| SQL / JSON generation, code execution | 0.0 – 0.2 | 0.1 | You want the single most probable, syntactically valid continuation almost every time. |
| Factual QA / RAG synthesis | 0.2 – 0.4 | 0.5 | Some flexibility in phrasing, essentially no room for invented facts. |
| General chat assistant | 0.6 – 0.8 | 0.9 | Natural variation without incoherence. |
| Creative writing / brainstorming | 0.8 – 1.2 | 0.9 – 0.95 | Maximize novelty; occasional incoherence is an acceptable cost. |

## Key Takeaways

- Logits are raw, unnormalized scores; softmax converts them to probabilities, but *how* you sample after that is a separate, tunable decision.
- **Temperature** reshapes confidence (sharpens or flattens the distribution) without ever changing the ranking of tokens.
- **Top-K** enforces a hard, static cap on the candidate pool — simple, but blind to how confident or uncertain the model actually is.
- **Top-P (nucleus)** adapts the candidate pool size to the model's own confidence by truncating on cumulative probability mass, not a fixed count.
- Production systems typically apply temperature, then Top-K, then Top-P, in that order, before sampling — and the correct values depend entirely on whether the task rewards determinism (code, SQL) or novelty (creative writing).
