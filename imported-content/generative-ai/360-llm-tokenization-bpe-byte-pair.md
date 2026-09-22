# LLM Tokenization: Byte-Pair Encoding (BPE) vs WordPiece

## The Problem: The Out-of-Vocabulary (OOV) Dilemma

Deep learning models cannot ingest raw strings; they require a mapping of text to discrete numerical indices. Deciding the granularity of this mapping presents a fundamental trade-off:

```
Character-Level                     Subword                          Word-Level
[ "h", "e", "l", "l", "o" ]   --->  [ "hell", "##o" ]          --->  [ "hello" ]
- Small vocabulary (~256)           - Balanced vocab size            - Large vocab (100k+)
- Long context paths                - Zero OOV issues                - High OOV frequency
- Weak semantic capture             - Optimal representation         - Untrainable parameters
```

1. **Word-Level Tokenization**: High out-of-vocabulary (OOV) rates. Inflections like "running", "ran", and "runs" require separate vocabulary slots. Typographical errors cause complete lookup failures.
2. **Character-Level Tokenization**: Zero OOV rates but massive context lengths. A 1000-character paragraph becomes a sequence of length 1000, exploding self-attention cost ($O(N^2)$).

**Subword Tokenization** bridges this gap, decomposing rare words into frequent subunits (e.g., `"unexplainable"` -> `["un", "explain", "able"]`). The two dominant algorithms for constructing these vocabularies are **Byte-Pair Encoding (BPE)** and **WordPiece**.

---

## Technical Comparison: BPE vs WordPiece

While both algorithms create subword vocabularies by iteratively grouping smaller units, their merge criteria and vocabulary construction differ fundamentally.

### 1. Byte-Pair Encoding (BPE)
BPE (Senrich et al., 2015) is a bottom-up, frequency-driven clustering algorithm. 
* **Initialization**: The vocabulary is initialized with all individual characters (or raw bytes in byte-level BPE, used by modern models like GPT-2/3/4 and LLaMA) plus an end-of-word symbol.
* **Merge Criterion**: BPE counts all co-occurring adjacent symbol pairs in the corpus and merges the *most frequent* pair. This is repeated until the target vocabulary size is reached.

### 2. WordPiece
WordPiece (Schuster & Nakajima, 2012; used in BERT) is a bottom-up, likelihood-driven algorithm.
* **Initialization**: Similar to BPE, starts with characters, but represents subwords inside words with a special prefix (e.g., `##` for BERT) to indicate continuation.
* **Merge Criterion**: Rather than choosing the most frequent symbol pair, WordPiece evaluates candidates by how much they increase the likelihood of the training data if merged. The score for merging candidate $A$ and $B$ is:

$$\text{Score}(A, B) = \frac{\text{Count}(AB)}{\text{Count}(A) \times \text{Count}(B)}$$

A high score indicates that $A$ and $B$ appear together much more frequently than would be expected by their individual occurrences, maximizing the mutual information of the tokens.

---

## Tokenization Pipeline Flow

The downstream process of mapping a raw input string to an input tensor for a Transformer:

```
  +-------------------------------------------------+
  | Raw Input: "unexplainable bugs occur"           |
  +-----------------------+-------------------------+
                          |
                          v (Normalization: Unicode NFC, Lowercase, etc.)
  +-----------------------+-------------------------+
  | Normalized: "unexplainable bugs occur"          |
  +-----------------------+-------------------------+
                          |
                          v (Pre-tokenization: Split on spaces/punctuation)
  +-----------------------+-------------------------+
  | Words: ["unexplainable", "bugs", "occur"]       |
  +-----------------------+-------------------------+
                          |
                          v (Subword Tokenization: BPE or WordPiece)
  +-----------------------+-------------------------+
  | Tokens: ["un", "explain", "able", "bug", "s", "occur"]
  +-----------------------+-------------------------+
                          |
                          v (Vocabulary Index Lookup)
  +-----------------------+-------------------------+
  | Token IDs (Tensor): [420, 2049, 118, 592, 12, 8042]
  +-------------------------------------------------+
```

---

## Pure Python Implementation of Byte-Pair Encoding (BPE)

The following script implements the BPE training cycle from a raw corpus, demonstrating character extraction, pair-frequency aggregation, and symbol merging.

```python
import re
from typing import Dict, Tuple

def get_stats(vocab: Dict[str, int]) -> Dict[Tuple[str, str], int]:
    """Calculate frequency of all adjacent token pairs."""
    pairs = {}
    for word, freq in vocab.items():
        symbols = word.split()
        for i in range(len(symbols) - 1):
            pair = (symbols[i], symbols[i+1])
            pairs[pair] = pairs.get(pair, 0) + freq
    return pairs

def merge_vocab(pair: Tuple[str, str], v_in: Dict[str, int]) -> Dict[str, int]:
    """Merge all occurrences of the target pair in the vocabulary."""
    v_out = {}
    bigram = re.escape(' '.join(pair))
    p = re.compile(r'(?<!\S)' + bigram + r'(?!\S)')
    for word in v_in:
        w_out = p.sub(''.join(pair), word)
        v_out[w_out] = v_in[word]
    return v_out

def train_bpe(corpus: str, num_merges: int) -> Tuple[list, Dict[str, int]]:
    """Train BPE to extract vocabulary from corpus."""
    # 1. Initialize vocabulary with character splits and end-of-word character '</w>'
    raw_vocab = {}
    for word in corpus.split():
        spaced_word = ' '.join(list(word)) + ' </w>'
        raw_vocab[spaced_word] = raw_vocab.get(spaced_word, 0) + 1
        
    merges = []
    print(f"Initial Vocabulary Segment: {list(raw_vocab.keys())[:3]}")
    
    # 2. Iteratively merge the most frequent adjacent pair
    for i in range(num_merges):
        pairs = get_stats(raw_vocab)
        if not pairs:
            break
        best_pair = max(pairs, key=pairs.get)
        raw_vocab = merge_vocab(best_pair, raw_vocab)
        merges.append(best_pair)
        print(f"Merge #{i+1:02d}: {best_pair} (Frequency: {pairs[best_pair]})")
        
    return merges, raw_vocab

if __name__ == "__main__":
    # Sample corpus
    sample_corpus = (
        "hug hug hug pug hug pug hug "
        "pun pun pun pun bun pun "
        "unexplainable unexplainable"
    )
    
    merges, final_vocab = train_bpe(sample_corpus, num_merges=8)
    print("\nLearned Merges:")
    print(merges)
    
    print("\nResulting Vocabulary Segment:")
    for word, freq in list(final_vocab.items())[:5]:
        print(f"Sequence: '{word}' -> Count: {freq}")
```

---

## Comparative Matrix

| Feature | Byte-Pair Encoding (BPE) | WordPiece |
| :--- | :--- | :--- |
| **Model Usage** | GPT-2/3/4, LLaMA, RoBERTa, Mistral | BERT, DistilBERT, MobileBERT |
| **Criterion** | Absolute frequency of adjacent symbols | Likelihood ratio (Mutual Information) |
| **Out-of-vocabulary**| Eliminated via Byte-level fallback | Eliminated via character-level fallback |
| **Subword Prefix** | None (uses raw bytes or spaces) | Uses specific marker (e.g., `##` for continuation) |
| **Tokenizer Type** | Bottom-up greedy merge | Bottom-up conditional merge |
