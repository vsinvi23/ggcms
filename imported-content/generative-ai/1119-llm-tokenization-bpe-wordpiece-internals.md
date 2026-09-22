# LLM Tokenization: Byte-Pair Encoding (BPE) vs WordPiece Under the Hood

**The Problem:** Neural networks only understand numbers, not raw text. However, splitting text into raw bytes loses semantic meaning and creates excessively long sequences, while splitting into whole words leads to an unmanageable vocabulary size and Out-Of-Vocabulary (OOV) errors. The solution is subword tokenization, but two dominant algorithms—Byte-Pair Encoding (BPE) and WordPiece—achieve this differently.

## Byte-Pair Encoding (BPE)
BPE was originally a data compression technique. In the context of LLMs (like GPT-4), it works by iteratively merging the most frequently co-occurring consecutive characters or bytes.

### The BPE Algorithm
1. **Initialize** the vocabulary with all unique base characters (or bytes).
2. **Count** the frequencies of all adjacent pairs.
3. **Merge** the most frequent pair into a new token.
4. **Repeat** until a predefined vocabulary size is reached.

```text
+-------------------------------------------------+
| Iteration 1: (h, e) -> he                       |
| Iteration 2: (he, l) -> hel                     |
| Iteration 3: (hel, l) -> hell                   |
| Iteration 4: (hell, o) -> hello                 |
+-------------------------------------------------+
```

### BPE Training Code (Simplified)
```python
from collections import defaultdict

def get_stats(vocab):
    pairs = defaultdict(int)
    for word, freq in vocab.items():
        symbols = word.split()
        for i in range(len(symbols)-1):
            pairs[symbols[i], symbols[i+1]] += freq
    return pairs

def merge_vocab(pair, v_in):
    v_out = {}
    bigram = ' '.join(pair)
    replacement = ''.join(pair)
    for word in v_in:
        w_out = word.replace(bigram, replacement)
        v_out[w_out] = v_in[word]
    return v_out
```

## WordPiece
WordPiece, used heavily by Google (e.g., BERT), is similar to BPE but uses a probabilistic approach for merging rather than raw frequency.

### The WordPiece Algorithm
Instead of merging the most frequent pair, WordPiece merges the pair that maximizes the likelihood of the training data. It evaluates the score of a pair `(x, y)` as:

`Score(x, y) = P(x, y) / (P(x) * P(y))`

This means WordPiece favors merging tokens that frequently appear together but rarely appear independently. It builds a language model at each step to determine the best merge.

```text
+-------------------------------------------------+
| BPE targets max frequency: Freq(A,B)            |
| WordPiece targets max likelihood:               |
|      P(A,B) / (P(A)*P(B))                       |
+-------------------------------------------------+
```

### WordPiece Subword Prefixing
WordPiece distinguishes mid-word subwords using a prefix (often `##`). For example, "tokenization" might be tokenized as `["token", "##ization"]`.

## Architectural Trade-offs

**Vocabulary Efficiency:** WordPiece often produces a more efficient vocabulary for a specific language model because it optimizes for likelihood. BPE is purely frequency-driven, which can sometimes merge less semantically meaningful pairs if they occur often.
**Handling Unknowns:** Both handle OOV well by falling back to smaller subwords or individual characters/bytes. BPE on raw bytes (Byte-Level BPE, BBPE) guarantees 0% OOV, as any string can be represented as bytes.
**Inference Speed:** BPE merging at inference time is deterministic and fast (greedy longest-match). WordPiece also uses a greedy longest-match-first strategy during tokenization.

Understanding the difference informs model selection and debugging. If your model struggles with specific technical jargon, analyzing the BPE/WordPiece token boundaries reveals if the semantic root is being preserved or fragmented.