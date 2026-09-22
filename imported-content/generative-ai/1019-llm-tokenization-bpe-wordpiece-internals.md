# LLM Tokenization: Byte-Pair Encoding (BPE) vs WordPiece Under the Hood

## The Problem
Mapping raw text into numerical representations for neural networks presents a fundamental trade-off. Word-level tokenization scales the vocabulary infinitely, leading to massive, sparse embedding matrices and fatal Out-Of-Vocabulary (OOV) errors. Character-level tokenization avoids OOV completely but generates overly long sequences, rapidly exhausting a Transformer's context window and destroying semantic density. 

Subword tokenization addresses this by segmenting rare words into meaningful sub-units while keeping common words intact. However, the algorithm chosen for this segmentation drastically impacts model performance, downstream latency, and cross-lingual capability.

## Technical Architecture: Subword Tokenization

The two dominant algorithms in the generative AI ecosystem are Byte-Pair Encoding (BPE), popularized by OpenAI's GPT models, and WordPiece, championed by Google's BERT and its derivatives.

### Byte-Pair Encoding (BPE)
BPE is a data compression algorithm adapted for tokenization. It operates iteratively, finding the most frequently occurring adjacent pair of tokens and merging them into a single new token. 

```text
[ BPE Merge Process ]
Iteration 0: ['h', 'e', 'g', 'h', 't']
Iteration 1: 'h' + 'e' -> 'he'  => ['he', 'g', 'h', 't']
Iteration 2: 'he' + 'g' -> 'heg' => ['heg', 'h', 't']
```

BPE relies on raw frequency. If `('e', 's')` appears most often across the corpus, it merges them, regardless of linguistic structure. For Modern LLMs, BPE is usually applied over bytes (Byte-Level BPE) rather than Unicode characters, ensuring that the initial vocabulary is exactly 256 tokens and absolutely zero OOV errors can occur, even for emojis or unseen languages.

### WordPiece
WordPiece is similar in its initialization and merge structure but differs crucially in its selection criteria. Instead of merging based solely on the highest frequency pair, WordPiece merges the pair that maximizes the likelihood of the training data.

In probabilistic terms, WordPiece evaluates pairs based on the score:
`Score = (Freq of pair) / (Freq of first element * Freq of second element)`

This means WordPiece normalizes by the individual frequencies. A pair is merged if they frequently co-occur *relative* to how often they occur independently. This creates a vocabulary that statistically models language more accurately than pure frequency counts, though it is computationally more expensive to generate the vocabulary.

## Comparative Diagram

```text
+-------------------+-----------------------------------+-----------------------------------+
| Feature           | Byte-Pair Encoding (BPE)          | WordPiece                         |
+-------------------+-----------------------------------+-----------------------------------+
| Merge Criterion   | Highest absolute frequency        | Maximum likelihood / PMI          |
| Base Unit         | Typically Bytes (256 units)       | Unicode Characters                |
| Out of Vocab      | Impossible (with Byte-level)      | Rare, uses [UNK] token fallback   |
| Dominant Models   | GPT-3, GPT-4, LLaMA, Mistral      | BERT, Electra, DistilBERT         |
+-------------------+-----------------------------------+-----------------------------------+
```

## Robust Implementation

To understand BPE, observing the fundamental merge algorithm is critical. Here is a robust Python implementation demonstrating the core BPE merge step on a raw corpus dictionary.

```python
import re
from collections import defaultdict

def get_stats(vocab: dict[str, int]) -> dict[tuple[str, str], int]:
    """Calculates frequency of adjacent symbol pairs in the vocabulary."""
    pairs = defaultdict(int)
    for word, freq in vocab.items():
        symbols = word.split()
        for i in range(len(symbols) - 1):
            pairs[symbols[i], symbols[i+1]] += freq
    return pairs

def merge_vocab(pair: tuple[str, str], v_in: dict[str, int]) -> dict[str, int]:
    """Merges the most frequent pair in the vocabulary."""
    v_out = {}
    bigram = re.escape(' '.join(pair))
    # Regex to match the exact pair separated by a space
    p = re.compile(r'(?<!\S)' + bigram + r'(?!\S)')
    
    replacement = ''.join(pair)
    for word in v_in:
        w_out = p.sub(replacement, word)
        v_out[w_out] = v_in[word]
    return v_out

# Example Usage
# Format: space-separated symbols to allow distinct character merging
vocab = {'l o w </w>': 5, 'l o w e s t </w>': 2, 'n e w e r </w>': 6, 'w i d e r </w>': 3}

num_merges = 3
for i in range(num_merges):
    pairs = get_stats(vocab)
    if not pairs:
        break
    best_pair = max(pairs, key=pairs.get)
    vocab = merge_vocab(best_pair, vocab)
    print(f"Iteration {i+1}: Merged {best_pair} -> {''.join(best_pair)}")
    print(f"Current Vocab: {list(vocab.keys())}\n")
```

## Strategic Takeaways
While WordPiece arguably produces more morphologically sound subwords due to its probabilistic grounding, Byte-Level BPE (BBPE) has won the LLM wars. The simplicity of BBPE, combined with its absolute guarantee against OOV tokens by falling back to the 256-byte foundation, makes it the robust choice for massive, multi-lingual, and code-heavy datasets processed by modern architectures.