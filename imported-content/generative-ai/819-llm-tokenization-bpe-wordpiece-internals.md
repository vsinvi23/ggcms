# LLM Tokenization: Byte-Pair Encoding (BPE) vs WordPiece Under the Hood

### The Problem: Out-of-Vocabulary (OOV) and Vocabulary Bloat
Language models cannot natively process raw text. Text must be converted into discrete numerical IDs. Traditional word-level tokenization struggles with rare words, morphological variations, and typos, leading to an intractable Out-of-Vocabulary (OOV) problem or an exploded vocabulary size. Conversely, character-level tokenization creates excessively long sequences, destroying the context window efficiency.

The industry standard solution is Subword Tokenization, which strikes a balance between character and word-level representations. The two dominant algorithms powering modern LLMs are Byte-Pair Encoding (BPE) (used by GPT-4, Llama 3) and WordPiece (used by BERT, Electra).

### Byte-Pair Encoding (BPE): The Frequency Approach
BPE is a compression algorithm adapted for tokenization. It builds a vocabulary bottom-up by iteratively merging the most frequently occurring adjacent pairs of characters (or bytes).

#### Architecture of BPE
1.  **Initialization**: Begin with a vocabulary of all individual characters (or bytes, in Byte-level BPE) present in the training corpus.
2.  **Frequency Counting**: Count the frequency of all adjacent token pairs.
3.  **Merge**: Find the most frequent pair (e.g., `e` and `s` occurring together as `es`). Merge them into a new token `es` and add it to the vocabulary.
4.  **Iteration**: Repeat step 3 until a predefined target vocabulary size (e.g., 50,000 or 128,000) is reached.

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

#### Code Implementation: Naive BPE
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

# Example Corpus
vocab = {'l o w </w>': 5, 'l o w e r </w>': 2, 'n e w e s t </w>': 6, 'w i d e s t </w>': 3}
num_merges = 5

for i in range(num_merges):
    pairs = get_stats(vocab)
    best = max(pairs, key=pairs.get)
    vocab = merge_vocab(best, vocab)
    print(f"Merge #{i+1}: {best} -> {''.join(best)}")
```

### WordPiece: The Likelihood Approach
While BPE merges pairs based purely on *frequency*, WordPiece (developed by Google for Voice Search and later BERT) merges pairs that *maximize the likelihood* of the language model training data.

WordPiece evaluates the score of a pair using:
`Score(x, y) = P(xy) / (P(x) * P(y))`

Where `P(xy)` is the probability of the combined token, and `P(x)`, `P(y)` are the probabilities of the individual tokens.

#### BPE vs WordPiece
1.  **Merge Criterion**: BPE chooses the pair with the highest raw count. WordPiece chooses the pair that most increases the likelihood of the corpus (identifying pairs where the combined frequency is significantly higher than expected given the individual frequencies).
2.  **Prefix Handling**: WordPiece explicitly marks subwords that do not start a word with `##` (e.g., `word`, `##piece`). BPE typically handles spacing by mapping spaces to a special character (like `Ġ` in RoBERTa/GPT-2) and treating the space as part of the token.

### Byte-Level BPE (BBPE)
Modern models like GPT-4 and LLaMA use Byte-Level BPE. Instead of initializing the base vocabulary with Unicode characters (which can exceed 100,000 characters), BBPE initializes with 256 raw bytes.
This guarantees that *any* string, in any language or encoding, can be tokenized without an OOV `<unk>` token, mapping unseen characters to their raw UTF-8 byte tokens.

### Conclusion
Tokenization defines the "atomic physics" of an LLM. BPE's deterministic frequency merges provide robust, OOV-free encoding, especially when applied at the byte level. Understanding these mechanics is crucial when managing context windows, analyzing API costs, or training custom tokenizers for domain-specific jargon like genomics or code.
