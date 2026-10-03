---
title: "LLM Tokenization: Byte-Pair Encoding (BPE) vs WordPiece Under the Hood"
description: "Why word-level and character-level tokenization both fail LLMs, and how BPE's frequency-driven merges differ mathematically from WordPiece's likelihood-driven merges -- with from-scratch Python implementations of both, plus byte-level BPE."
type: "ARTICLE"
categorySlug: "generative-ai"
articleType: "DEEP_DIVE"
tags:
  - "tokenization"
  - "bpe"
  - "wordpiece"
  - "byte-level-bpe"
  - "nlp-fundamentals"
---

# LLM Tokenization: Byte-Pair Encoding (BPE) vs WordPiece Under the Hood

## The Problem: The Vocabulary Representation Dilemma

Language models cannot natively process raw text — text must first be converted into discrete numerical IDs. This introduces a fundamental engineering trade-off.

If you map each unique word to a token (word-level tokenization), vocabulary size explodes into the millions, bloating the embedding layer's memory footprint, and the model is incapable of handling any word it hasn't seen before — a hard Out-Of-Vocabulary (OOV) failure. If you instead represent text character by character, sequence lengths balloon, diluting semantic information across hundreds of tokens per sentence and burning through the attention mechanism's finite context window.

**Subword tokenization** resolves this dilemma by breaking rare words into meaningful subword units while keeping common words intact. Two algorithms dominate today's production models: **Byte-Pair Encoding (BPE)** (GPT-4, Llama 3, RoBERTa) and **WordPiece** (BERT, Electra, MobileBERT). They look similar on the surface — both build a vocabulary bottom-up by iteratively merging pairs of symbols — but their merge-selection criteria are mathematically distinct, and that difference has real consequences for vocabulary quality and OOV handling.

```
Byte-Pair Encoding (BPE): Frequency-Driven Merges
[Raw Text Corpus] -> [Character Vocabulary] -> [Count Adjacent Pairs] -> [Merge Most Frequent] -> [Iterate to Vocab Limit]

WordPiece: Likelihood-Driven Merges
[Raw Text Corpus] -> [Character Vocabulary] -> [Compute Likelihood Score] -> [Merge Max Score Pair] -> [Iterate to Vocab Limit]
```

## Byte-Pair Encoding (BPE): The Frequency Approach

BPE is a compression algorithm adapted for tokenization, and it is a purely bottom-up, frequency-driven merge process:

1. **Initialization.** Tokenize the training corpus into individual characters, and add a special end-of-word marker (e.g. `</w>`) so the algorithm can track word boundaries even after merging.
2. **Frequency counting.** Count every adjacent symbol pair across the whole corpus.
3. **Merging.** Find the single most frequent pair (e.g. `e` and `s` co-occurring as `es`) and merge it into one new subword token, adding it to the vocabulary.
4. **Iteration.** Repeat steps 2–3 until the target vocabulary size (commonly 50,000–128,000 tokens) is reached.

```text
+---------------------------------------------------+
|               BPE Merge Iterations                |
+---------------------------------------------------+
| Iteration 0: [ "l", "o", "w", "e", "s", "t" ]     |
| Iteration 1: "e" + "s" -> "es" (Freq: 900)        |
| Iteration 2: "es" + "t" -> "est" (Freq: 850)      |
| Iteration 3: "l" + "o" -> "lo" (Freq: 600)        |
| Final Tokenization of "lowest": ["lo", "w", "est"]|
+---------------------------------------------------+
```

## WordPiece: The Likelihood Approach

WordPiece (developed by Google for Voice Search, later used in BERT) also builds its vocabulary bottom-up, but it optimizes for **corpus likelihood** rather than raw pair frequency. Instead of always merging the pair with the highest absolute count, WordPiece scores each candidate pair by how much merging it would increase the likelihood of the training data — mathematically, the mutual-information ratio of the two constituent symbols:

$$\text{Score}(A, B) = \frac{\text{Count}(AB)}{\text{Count}(A) \times \text{Count}(B)}$$

This ratio is large exactly when $A$ and $B$ co-occur far more often than their individual frequencies would predict by chance — i.e. when the two symbols rarely occur *apart*. That means WordPiece preferentially merges pairs whose components are tightly bound together semantically, even if the absolute pair count is modest, rather than merging whatever happens to be the single most common bigram in the corpus (which is often dominated by generic, low-information sequences like common punctuation-letter combinations). WordPiece also explicitly marks subword pieces that don't start a word with a `##` prefix (`word`, `##piece`), whereas BPE-family tokenizers typically fold the preceding space into the token itself (represented as `Ġ` in GPT-2/RoBERTa-style byte-level BPE).

### Algorithmic Comparison: BPE vs WordPiece

| Metric / Feature | Byte-Pair Encoding (BPE) | WordPiece |
| :--- | :--- | :--- |
| **Merge Criterion** | Maximum absolute pair frequency | Maximum mutual information / likelihood ratio |
| **Out-Of-Vocabulary** | Handled via byte-level fallbacks (BBPE) | Decoded using a special `[UNK]` token if unmatched |
| **Tokenization Style** | Greedy longest-match (via merge rules) | MaxMatch (longest prefix first, then suffix) |
| **Prefix Handling** | Space folded into token (e.g. `Ġtoken`) | Continuation pieces marked with `##` |
| **Primary Models** | GPT series, Llama, Mistral, RoBERTa | BERT, Electra, MobileBERT |

## Implementation: BPE and WordPiece from Scratch

The cleanest way to see the difference is to implement both merge-selection rules against the same toy corpus and compare what each one picks first.

```python
from collections import defaultdict
from typing import Dict, Tuple

# Sample Corpus representing domain-specific patterns
CORPUS = {
    "hug": 10,
    "pug": 5,
    "pun": 12,
    "bun": 4,
    "hugs": 5
}

def get_bpe_stats(vocab: Dict[Tuple[str, ...], int]) -> Dict[Tuple[str, str], int]:
    pairs = defaultdict(int)
    for word, freq in vocab.items():
        for i in range(len(word) - 1):
            pairs[(word[i], word[i+1])] += freq
    return pairs

def merge_bpe_vocab(pair: Tuple[str, str], v_in: Dict[Tuple[str, ...], int]) -> Dict[Tuple[str, ...], int]:
    v_out = {}
    bigram = pair
    for word in v_in:
        new_word = []
        i = 0
        while i < len(word):
            if i < len(word) - 1 and word[i] == bigram[0] and word[i+1] == bigram[1]:
                new_word.append(bigram[0] + bigram[1])
                i += 2
            else:
                new_word.append(word[i])
                i += 1
        v_out[tuple(new_word)] = v_in[word]
    return v_out

def run_bpe(corpus: Dict[str, int], num_merges: int) -> list:
    # Initialize vocabulary with characters and end-of-word marker
    vocab = {tuple(list(word) + ["</w>"]): freq for word, freq in corpus.items()}
    merges = []

    for _ in range(num_merges):
        pairs = get_bpe_stats(vocab)
        if not pairs:
            break
        best_pair = max(pairs, key=pairs.get)
        vocab = merge_bpe_vocab(best_pair, vocab)
        merges.append(best_pair)
    return merges

def compute_wordpiece_scores(vocab: Dict[Tuple[str, ...], int]) -> Dict[Tuple[str, str], float]:
    char_freqs = defaultdict(int)
    pair_freqs = defaultdict(int)

    for word, freq in vocab.items():
        for char in word:
            char_freqs[char] += freq
        for i in range(len(word) - 1):
            pair_freqs[(word[i], word[i+1])] += freq

    scores = {}
    for (char_a, char_b), pair_count in pair_freqs.items():
        # Score = Count(AB) / (Count(A) * Count(B))
        scores[(char_a, char_b)] = pair_count / (char_freqs[char_a] * char_freqs[char_b])
    return scores

# Execution Validation
if __name__ == "__main__":
    print("--- Running BPE (Frequency-based) ---")
    bpe_merges = run_bpe(CORPUS, num_merges=3)
    for step, merge in enumerate(bpe_merges, 1):
        print(f"Merge {step}: {merge}")

    print("\n--- Running WordPiece Scoring (Likelihood-based) ---")
    wp_vocab = {tuple(list(word) + ["</w>"]): freq for word, freq in CORPUS.items()}
    scores = compute_wordpiece_scores(wp_vocab)
    top_wp_merges = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:3]
    for step, (pair, score) in enumerate(top_wp_merges, 1):
        print(f"Rank {step}: {pair} with Mutual Info Score: {score:.5f}")
```

Run this against `CORPUS` and compare the two merge orders directly: BPE's `get_bpe_stats` always picks the pair with the highest raw `Count(AB)`, while `compute_wordpiece_scores` normalizes that count by each symbol's individual frequency — so a pair made of two otherwise-rare characters that *only* ever appear together can outrank a more frequent but less mutually-predictive pair. That's the concrete, checkable difference between "most common" and "most mutually informative."

## Byte-Level BPE (BBPE): Guaranteeing No OOV At All

Modern models like GPT-4 and Llama use **Byte-Level BPE**. Instead of initializing the base vocabulary with Unicode characters — which can exceed 100,000 distinct code points once you account for every language and emoji — BBPE initializes with the 256 raw byte values. Because every possible string, in every encoding and language, decomposes into some sequence of UTF-8 bytes, BBPE guarantees *any* input can be tokenized without ever needing a `<unk>` fallback token: unseen characters simply map to their raw byte sequence instead of failing outright. This is also why BPE-family tokenizers are described as handling OOV "via byte-level fallbacks" in the comparison table above, while WordPiece's classic implementation still relies on an explicit `[UNK]` token when a fragment can't be matched.

## Key Takeaway

Tokenization defines the "atomic physics" of an LLM — everything downstream, from context-window budgeting to per-token API costs, is denominated in whatever units the tokenizer decided on. BPE's deterministic, frequency-driven merges are fast to compute and, especially at the byte level, provide robust OOV-free encoding for any input. WordPiece's likelihood-driven merges instead filter out arbitrary high-frequency combinations by requiring that a merged token's components genuinely predict each other's presence, producing a tighter, more semantically dense vocabulary. Understanding which algorithm — and which merge criterion — sits under a given model matters directly when managing context windows, reasoning about API costs, or training a custom tokenizer for domain-specific jargon like genomics, legal text, or source code.
