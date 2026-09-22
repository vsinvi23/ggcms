# LLM Tokenization: Byte-Pair Encoding (BPE) vs WordPiece under the Hood

**The Problem:** LLMs cannot process raw text. They require numbers. Mapping characters to IDs creates sequences that are too long (losing context window efficiency), while mapping whole words creates an unmanageable vocabulary size (millions of unique words, leading to OOV - Out of Vocabulary errors). Subword tokenization balances sequence length and vocabulary size, but algorithms like BPE and WordPiece construct their vocabularies differently, heavily impacting model performance across languages and domains.

## Tokenization Architecture

At the core, subword tokenizers initialize with a base vocabulary (usually characters or bytes) and iteratively merge tokens based on a specific algorithm.

```text
[ Raw Text ] --> [ Pre-Tokenizer (Regex/Whitespace) ] --> [ Subword Tokenizer (BPE/WordPiece) ] --> [ Integer IDs ]
```

## Byte-Pair Encoding (BPE)

BPE is a data compression algorithm adapted for tokenization, famously used by GPT-X and LLaMA models.

### Algorithm
1. **Initialize** vocabulary with all characters (or 256 raw bytes in Byte-Level BPE).
2. **Count** frequency of adjacent token pairs in the training corpus.
3. **Merge** the most frequent pair into a new single token.
4. **Repeat** until the target vocabulary size is reached.

### Internals

BPE relies strictly on frequency. If "e" and "s" appear together most frequently as "es", they become a single token.

```python
import collections
import re

def get_stats(vocab):
    pairs = collections.defaultdict(int)
    for word, freq in vocab.items():
        symbols = word.split()
        for i in range(len(symbols)-1):
            pairs[symbols[i], symbols[i+1]] += freq
    return pairs

def merge_vocab(pair, v_in):
    v_out = {}
    bigram = re.escape(' '.join(pair))
    p = re.compile(r'(?<!\S)' + bigram + r'(?!\S)')
    for word in v_in:
        w_out = p.sub(''.join(pair), word)
        v_out[w_out] = v_in[word]
    return v_out

# Example usage:
vocab = {'l o w </w>': 5, 'l o w e s t </w>': 2, 'n e w e r </w>': 6, 'w i d e r </w>': 3, 'n e w </w>': 2}
num_merges = 5
for i in range(num_merges):
    pairs = get_stats(vocab)
    best = max(pairs, key=pairs.get)
    vocab = merge_vocab(best, vocab)
    print(f"Merge #{i+1}: {best} -> {''.join(best)}")
```

## WordPiece

WordPiece, developed by Google and popularized by BERT, also merges characters but uses a probabilistic approach rather than strict frequency.

### Algorithm
1. **Initialize** vocabulary with characters.
2. **Train a language model** on the base vocabulary.
3. **Score pairs** by computing the likelihood of the training data. The score for merging `A` and `B` is `Count(AB) / (Count(A) * Count(B))`.
4. **Merge** the pair that maximizes this score (i.e., increases the likelihood of the data the most).
5. **Repeat**.

WordPiece merges tokens if their combination is significantly more probable than their independent occurrences, effectively handling rare but strongly coupled syllables.

## Architectural Trade-offs

| Feature | BPE | WordPiece |
| :--- | :--- | :--- |
| **Merge Criterion** | Absolute Frequency | Likelihood (Frequency relative to parts) |
| **Prefix Handling** | Relies on spacing rules | Uses `##` prefix for inner subwords (`##ing`) |
| **Encoding Phase** | Greedy longest match (left-to-right) | Greedy longest match |
| **Model Families** | OpenAI (GPT), Meta (LLaMA), Anthropic | Google (BERT, Electra, T5) |

### The Byte-Level BPE (BBPE) Advantage

Traditional tokenizers struggled with Unicode (e.g., Japanese, Emojis). If an emoji wasn't in the corpus, it became `<UNK>`. BBPE solves this by treating the base vocabulary as 256 bytes. Every Unicode character is mapped to 1-4 bytes. No `<UNK>` tokens can exist because any string can be broken down into bytes.

```text
UTF-8 String: "こんにちは" 
Bytes: [\xe3, \x81, \x93, \xe3, \x82, \x93, \xe3, \x81, \xab, \xe3, \x81, \xa1, \xe3, \x81, \xaf]
BPE merges bytes directly into tokens based on frequency.
```

When building modern LLMs, BBPE is the de facto standard, drastically reducing vocabulary bloat while eliminating out-of-vocabulary edge cases.
