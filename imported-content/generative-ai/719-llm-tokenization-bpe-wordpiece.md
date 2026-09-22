# LLM Tokenization: Byte-Pair Encoding (BPE) vs WordPiece Under the Hood

### The Problem: The Vocabulary Representation Dilemma

When designing a Large Language Model (LLM), representing raw text as input tensors introduces a fundamental engineering trade-off. 

If we map each unique word to a discrete token (word-level tokenization), our vocabulary size explodes into millions of entries, causing memory footprint inflation in the embedding layer. Furthermore, the model remains incapable of handling unseen words, throwing Out-Of-Vocabulary (OOV) errors. 

If we represent text at the character level, sequence lengths bloat exponentially, diluting semantic information across hundreds of tokens and exhausting the attention mechanism's context window.

Subword tokenization addresses this dilemma by breaking rare words into meaningful subword units while keeping frequent words intact. Two dominant algorithms power today's state-of-the-art models: **Byte-Pair Encoding (BPE)** (used in GPT-4, Llama 3, and RoBERTa) and **WordPiece** (used in BERT and DistilBERT). While similar on the surface, their core vocabulary-building and segmentation strategies are mathematically distinct.

---

### Technical Architectures

```
Byte-Pair Encoding (BPE): Frequency-Driven Merges
[Raw Text Corpus] -> [Character Vocabulary] -> [Count Adjacent Pairs] -> [Merge Most Frequent] -> [Iterate to Vocab Limit]

WordPiece: Likelihood-Driven Merges
[Raw Text Corpus] -> [Character Vocabulary] -> [Compute Likelihood Score] -> [Merge Max Score Pair] -> [Iterate to Vocab Limit]
```

#### Byte-Pair Encoding (BPE)
BPE is a bottom-up, frequency-driven merge algorithm. 
1. **Initialization:** Tokenize training text into characters. Add a special end-of-word symbol (e.g., `</w>`) to track boundaries.
2. **Frequency Counting:** Count all adjacent symbol pairs in the corpus.
3. **Merging:** Identify the most frequent pair (e.g., `'e'` and `'s'`) and merge them into a single new subword token (e.g., `'es'`).
4. **Iteration:** Repeat steps 2 and 3 until the target vocabulary size $V$ is reached.

#### WordPiece
WordPiece also builds its vocabulary bottom-up but optimizes for dataset likelihood rather than simple pair frequency.
1. **Initialization:** Set up character vocabulary. Mark subwords that occur inside words with a special prefix (e.g., `##`).
2. **Likelihood Maximization:** Instead of picking the most frequent adjacent pair, WordPiece evaluates candidates by how much they increase the likelihood of the training data if merged. Mathematically, it maximizes the mutual information ratio of candidate pairs $A$ and $B$:

$$\text{Score}(A, B) = \frac{\text{Count}(AB)}{\text{Count}(A) \times \text{Count}(B)}$$

This ensures that pairs whose constituents rarely occur apart are merged first, preserving semantic cohesiveness even for lower-frequency sequences.

---

### Algorithmic Comparison: BPE vs WordPiece

| Metric / Feature | Byte-Pair Encoding (BPE) | WordPiece |
| :--- | :--- | :--- |
| **Merge Criterion** | Maximum absolute pair frequency | Maximum mutual information / likelihood ratio |
| **Out-Of-Vocabulary** | Handled via byte-level fallbacks (BBPE) | Decoded using a special `[UNK]` token if unmatched |
| **Tokenization Style** | Greedy longest-match (via merge rules) | MaxMatch (longest prefix first, then suffix) |
| **Primary Models** | GPT series, Llama, Mistral, RoBERTa | BERT, Electra, MobileBERT |

---

### Implementation: BPE and WordPiece Merges from Scratch

Here is a robust, self-contained Python implementation of both BPE and WordPiece vocabulary building logic to demonstrate the structural differences in their merge decisions.

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

### Key Takeaway
BPE prioritizes high-frequency sequences, making it exceptionally fast to compute and align with vocabulary storage budgets. WordPiece filters out arbitrary high-frequency combinations (such as common punctuation-letter patterns) by verifying that the components of a merged token uniquely predict each other's presence, leading to slightly tighter, more semantically dense vocabulary mappings.
