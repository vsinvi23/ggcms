---
title: "LLM, RAG & ML Foundations Interview Prep"
description: "SME interview evaluation spanning tokenization, decoding strategies, attention/KV-cache inference optimization, LoRA/QLoRA fine-tuning, production RAG chunking, vector index internals, tool calling, agentic loops, and core ML evaluation metrics."
categorySlug: "generative-ai"
articleType: "INTERVIEW_PREP"
level: "Senior"
durationMinutes: 300
---

# LLM, RAG & ML Foundations Interview Track

Welcome to the LLM, RAG & ML Foundations evaluation track. This module tests your mastery of subword tokenization, decoding math, inference-time memory bottlenecks, parameter-efficient fine-tuning, production retrieval pipelines, vector index internals, structured tool calling, agentic control loops, and the classical ML evaluation metrics that still gate every model shipped to production.

---

### Question 1: Why do modern LLMs use subword tokenization instead of word-level or character-level tokenization, and how do BPE and WordPiece actually differ in their merge selection?

Think Prompt: Consider vocabulary size explosion, out-of-vocabulary (OOV) failures, sequence length inflation, and the mathematical difference between frequency-driven and likelihood-driven merge scoring.

Model Answer / Explanation:
1. Word-level tokenization maps every unique word to an ID. Vocabulary size explodes into the millions, the embedding table balloons, and any word not seen during training is a hard OOV failure at inference time.
2. Character-level tokenization avoids OOV entirely but inflates sequence length dramatically — a 10-word sentence becomes 50+ tokens, diluting semantic signal across the model's finite context window and attention budget.
3. Subword tokenization (BPE, WordPiece) splits the difference: common words stay intact as single tokens, rare words decompose into meaningful subword pieces, so the vocabulary stays bounded (typically 32K–128K tokens) while still covering arbitrary input via byte/character fallback.
4. BPE (GPT-4, Llama 3, RoBERTa) is purely frequency-driven: at each iteration, count every adjacent symbol pair across the corpus and merge whichever pair occurs most often.
5. WordPiece (BERT, Electra) is likelihood-driven: it scores each candidate pair by a mutual-information ratio rather than raw count, preferring pairs whose components rarely occur apart even if their absolute frequency is modest:

$$\text{Score}(A, B) = \frac{\text{Count}(AB)}{\text{Count}(A) \times \text{Count}(B)}$$

6. Practical consequence: BPE merges can be dominated by generic high-frequency bigrams; WordPiece's ratio suppresses that and favors semantically bound units. WordPiece also marks non-word-initial pieces with `##` (`##piece`), while byte-level BPE folds the preceding space into the token itself (`Ġpiece`).

```python
from collections import Counter

def bpe_merge_step(word_freqs: dict[tuple[str, ...], int]) -> tuple[tuple[str, str], dict]:
    """One frequency-driven BPE merge iteration."""
    pair_counts = Counter()
    for word, freq in word_freqs.items():
        for a, b in zip(word, word[1:]):
            pair_counts[(a, b)] += freq

    best_pair = max(pair_counts, key=pair_counts.get)  # pure frequency argmax

    new_word_freqs = {}
    for word, freq in word_freqs.items():
        merged, i = [], 0
        while i < len(word):
            if i < len(word) - 1 and (word[i], word[i + 1]) == best_pair:
                merged.append(word[i] + word[i + 1])
                i += 2
            else:
                merged.append(word[i])
                i += 1
        new_word_freqs[tuple(merged)] = freq
    return best_pair, new_word_freqs


def wordpiece_merge_step(word_freqs: dict[tuple[str, ...], int]) -> tuple[tuple[str, str], dict]:
    """One likelihood-driven WordPiece merge iteration."""
    pair_counts, symbol_counts = Counter(), Counter()
    for word, freq in word_freqs.items():
        for sym in word:
            symbol_counts[sym] += freq
        for a, b in zip(word, word[1:]):
            pair_counts[(a, b)] += freq

    # score = Count(AB) / (Count(A) * Count(B)) -- mutual-information style ratio
    best_pair = max(
        pair_counts,
        key=lambda p: pair_counts[p] / (symbol_counts[p[0]] * symbol_counts[p[1]]),
    )
    return best_pair, word_freqs  # merge application mirrors bpe_merge_step
```

Common Mistakes:
- Assuming BPE and WordPiece are "the same algorithm" because both merge bottom-up — the scoring function is mathematically distinct and changes which pairs get merged first.
- Forgetting that subword tokenization still has an OOV boundary at the byte level unless byte-level BPE (GPT-2/GPT-4 style) is used, in which case OOV becomes structurally impossible since every byte value is representable.
- Ignoring that tokenizer choice affects downstream cost and latency directly — more tokens per input means higher API cost and slower generation, independent of model quality.

Related Concepts: Byte-Pair Encoding, WordPiece, Vocabulary Construction, Out-of-Vocabulary Handling, Byte-Level BPE
Related Courses: llm-rag-fundamentals-track, llm-tokenization-bpe-vs-wordpiece

---

### Question 2: How do temperature, Top-K, and Top-P (nucleus) sampling each transform the logits distribution, and in what order should they be applied?

Think Prompt: Think about what problem greedy decoding and unconstrained sampling each fail at, and where in the pipeline scaling versus truncation belongs.

Model Answer / Explanation:
1. Greedy decoding (`argmax` every step) is fully deterministic and traps the model in repetition loops — it never explores a token that was only slightly less likely but would have led somewhere better.
2. Unconstrained sampling from the raw softmax distribution goes too far the other way: with tens of thousands of vocabulary entries, low-probability tail tokens eventually get picked, producing incoherent output.
3. Temperature ($T$) is applied to the logits *before* softmax: $q_i = \frac{\exp(z_i / T)}{\sum_j \exp(z_j / T)}$. $T < 1$ sharpens the distribution (more deterministic, favors high-confidence tokens — good for SQL/code generation); $T > 1$ flattens it (more diverse — good for creative copy).
4. Top-K filtering truncates the distribution to the $K$ highest-probability tokens post-temperature, zeroing everything else out before re-normalizing. It caps diversity with a fixed count regardless of how peaked or flat the distribution actually is.
5. Top-P (nucleus) filtering is dynamic: sort tokens by probability descending and keep the smallest prefix whose cumulative probability mass exceeds $P$ (e.g. 0.9). Unlike Top-K, the number of tokens retained expands when the model is uncertain (flat distribution) and shrinks when the model is confident (peaked distribution).
6. Production pipelines apply all three in sequence: temperature scaling → Top-K truncation → Top-P truncation → re-normalize → sample. Order matters because each stage operates on the output of the previous one.

```python
import torch

def sample_next_token(logits: torch.Tensor, temperature: float = 0.8,
                       top_k: int = 50, top_p: float = 0.9) -> int:
    # 1. Temperature scaling (before softmax)
    scaled_logits = logits / temperature

    # 2. Top-K: zero out everything outside the K highest logits
    top_k_vals, top_k_idx = torch.topk(scaled_logits, top_k)
    filtered = torch.full_like(scaled_logits, float("-inf"))
    filtered[top_k_idx] = top_k_vals

    # 3. Top-P: keep the smallest prefix whose cumulative probability exceeds p
    probs = torch.softmax(filtered, dim=-1)
    sorted_probs, sorted_idx = torch.sort(probs, descending=True)
    cumulative = torch.cumsum(sorted_probs, dim=-1)
    cutoff = (cumulative > top_p).nonzero()[0].item() + 1  # first index crossing p
    nucleus_idx = sorted_idx[:cutoff]

    nucleus_probs = probs[nucleus_idx] / probs[nucleus_idx].sum()  # re-normalize
    chosen = nucleus_idx[torch.multinomial(nucleus_probs, num_samples=1)]
    return chosen.item()
```

Common Mistakes:
- Setting `temperature=0` and expecting sampling code not to crash — dividing by zero, or degenerating to greedy in a way that silently disables Top-P entirely, needs explicit handling.
- Using a fixed Top-K everywhere, which either wastes diversity when the model is very confident or admits garbage tokens when the distribution is flat and K is too large — Top-P adapts to this automatically.
- Applying Top-P before temperature scaling, which changes which tokens fall inside the nucleus and produces inconsistent behavior across requests.

Related Concepts: Softmax Temperature Scaling, Top-K Truncation, Nucleus Sampling, Logits Post-Processing
Related Courses: llm-rag-fundamentals-track, llm-decoding-strategies-temperature-topk-topp-sampling

---

### Question 3: Why does a KV cache alone not solve LLM inference latency, and how does FlashAttention's tiling strategy fix the resulting bottleneck?

Think Prompt: Separate the compute-bound prefill phase from the sequential decode phase, and distinguish a FLOPS bottleneck from a memory-bandwidth bottleneck.

Model Answer / Explanation:
1. Inference splits into prefill (the full prompt processed in parallel — compute-bound, uses Tensor Cores efficiently) and decode (tokens generated one at a time — sequential by nature).
2. Without caching, predicting token $t$ requires recomputing Key/Value projections for every prior token $1..t-1$ again — pure redundant computation that produces $O(N^2)$ overhead as the sequence grows.
3. A KV cache eliminates that redundancy by storing $K$/$V$ once per layer/head and reusing them on each subsequent step. This fixes the compute-redundancy problem but introduces a new one: the cache for a long context can consume dozens of gigabytes of VRAM, and it must be re-fetched from High-Bandwidth Memory (HBM) into on-chip SRAM at every single decode step.
4. That repeated HBM→SRAM traffic is a memory-bandwidth bottleneck, not a compute bottleneck — the GPU has FLOPS to spare but is starved waiting on data movement, since HBM bandwidth (~100s of GB/s) is orders of magnitude slower than on-chip SRAM (~19 TB/s).
5. FlashAttention fixes this by tiling: it splits Q, K, V into blocks small enough to fit entirely in SRAM, computes partial attention scores for each block on-chip, and uses an online (running) softmax normalization so it never needs to materialize the full $N \times N$ attention matrix in HBM.
6. The output block is accumulated incrementally as each K/V tile streams through SRAM, so total HBM traffic drops from $O(N^2)$ reads/writes to a much smaller number of block-sized transfers — the same mathematical attention result, computed with far less memory movement.

```python
import numpy as np

def flash_attention_tile(Q, K, V, block_size=2):
    """Simplified online-softmax tiled attention (single head, illustrative)."""
    N, d = Q.shape
    O = np.zeros((N, d))
    row_max = np.full(N, -np.inf)   # running max per query row
    row_sum = np.zeros(N)           # running softmax denominator per query row

    for j in range(0, N, block_size):
        K_block, V_block = K[j:j + block_size], V[j:j + block_size]
        S_block = Q @ K_block.T                       # scores for this K/V tile only

        block_max = S_block.max(axis=1)
        new_max = np.maximum(row_max, block_max)       # online softmax rescale
        exp_block = np.exp(S_block - new_max[:, None])
        correction = np.exp(row_max - new_max)

        row_sum = row_sum * correction + exp_block.sum(axis=1)
        O = O * correction[:, None] + exp_block @ V_block
        row_max = new_max

    return O / row_sum[:, None]
```

Common Mistakes:
- Treating the KV cache as a strict win with no cost — engineers size deployments without accounting for cache VRAM, then hit OOM errors at long context lengths.
- Believing FlashAttention reduces the number of FLOPS computed — it doesn't; it reduces HBM memory traffic. The mathematical result is numerically identical, just computed with a different memory access pattern.
- Forgetting that online softmax requires a running rescale (`correction` factor) whenever a new block's max exceeds the previous running max — skipping this produces numerically wrong outputs, not just slower ones.

Related Concepts: KV Cache, FlashAttention, Online Softmax, Memory-Bandwidth Bottleneck, GPU Memory Hierarchy
Related Courses: llm-rag-fundamentals-track, llm-kv-cache-flashattention-tiling

---

### Question 4: How does LoRA reduce fine-tuning cost, and what additional problem does QLoRA's NF4 quantization solve on top of it?

Think Prompt: Consider the "intrinsic rank" hypothesis behind weight-update decomposition, and separate the parameter-count problem LoRA solves from the raw-memory problem QLoRA solves.

Model Answer / Explanation:
1. Full fine-tuning updates every parameter in every weight matrix. For a large model, VRAM must hold base weights, gradients (same size as weights), and optimizer states (AdamW: ~2x weight size for momentum and variance) simultaneously — for a 70B model this can exceed 1.5TB, well beyond a single GPU.
2. LoRA assumes the weight *update* needed to specialize a pretrained model has low "intrinsic dimension" — even though $W_0$ is huge, $\Delta W$ lives in a much smaller subspace. Instead of updating $W_0$ directly, LoRA decomposes $\Delta W$ into two small low-rank matrices $A \in \mathbb{R}^{r \times k}$ and $B \in \mathbb{R}^{d \times r}$ with $r \ll \min(d, k)$:

$$W = W_0 + \frac{\alpha}{r}(B A)$$

3. $W_0$ is frozen and receives no gradients; only $A$ and $B$ are trained, cutting trainable parameters by up to 99%+ relative to full fine-tuning, which also eliminates the optimizer-state memory blowup for the frozen weights.
4. LoRA alone still requires $W_0$ to be loaded in FP16/BF16, which for very large models is still tens of gigabytes — too much for a single consumer GPU.
5. QLoRA solves that separate problem: it quantizes the frozen base weights to 4-bit NF4 (NormalFloat4, a quantization scheme tuned for the actual distribution of pretrained weights rather than uniform int4), applies double quantization (quantizing the quantization constants themselves to save additional memory), and uses paged optimizers to offload optimizer state to CPU RAM when it would otherwise spike GPU memory.
6. The combination lets a 65B-parameter model be fine-tuned on a single 48GB (or smaller) consumer GPU: NF4 shrinks the frozen base weights, LoRA keeps trainable parameters tiny, and the forward pass dequantizes NF4 blocks on the fly for the frozen path while the LoRA adapter path runs in higher precision.

```python
import torch
import torch.nn as nn

class LoRALinear(nn.Module):
    """Frozen base weight + trainable low-rank adapter, matching the LoRA forward pass."""
    def __init__(self, base_layer: nn.Linear, rank: int = 8, alpha: int = 16):
        super().__init__()
        self.base_layer = base_layer
        for p in self.base_layer.parameters():
            p.requires_grad = False  # W_0 is frozen -- no gradients, no optimizer state

        in_features, out_features = base_layer.in_features, base_layer.out_features
        self.lora_A = nn.Parameter(torch.randn(rank, in_features) * 0.01)
        self.lora_B = nn.Parameter(torch.zeros(out_features, rank))  # B starts at 0 -> delta=0 initially
        self.scaling = alpha / rank

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        base_out = self.base_layer(x)                       # W_0 x
        delta_out = (x @ self.lora_A.T) @ self.lora_B.T      # (B A) x, computed low-rank
        return base_out + self.scaling * delta_out
```

Common Mistakes:
- Confusing LoRA (reduces trainable *parameter count*) with QLoRA's quantization (reduces *base weight memory footprint*) — they solve different bottlenecks and are complementary, not alternatives.
- Initializing both `lora_A` and `lora_B` with nonzero random values, which makes $\Delta W \neq 0$ at the start of training and perturbs the pretrained model's behavior before any training signal has been seen.
- Forgetting that NF4 dequantization happens on the fly during the forward pass — treating QLoRA as "the model just runs in 4-bit" ignores that compute still happens at higher precision after dequantizing each block.

Related Concepts: LoRA, QLoRA, NF4 Quantization, Parameter-Efficient Fine-Tuning, Catastrophic Forgetting
Related Courses: ml-foundations-from-scratch, llm-fine-tuning-lora-qlora-nf4-quantization

---

### Question 5: Why does naive fixed-size chunking degrade RAG retrieval quality, and how does a production chunking strategy fix it?

Think Prompt: Think about what happens to semantic coherence when a chunk boundary lands in the middle of a sentence, and why chunk size interacts with embedding quality.

Model Answer / Explanation:
1. RAG exists because LLMs have frozen training data (no knowledge of private/recent documents) and stuffing entire documents into the context window is expensive, slow, and suffers "lost in the middle" recall degradation even within large context windows.
2. Naive fixed-character chunking (e.g. "split every 500 characters") frequently cuts a paragraph mid-sentence, separating a pronoun from its antecedent or a definition from the term it defines — the resulting chunk, embedded independently, no longer carries the meaning a human reader would infer from surrounding context.
3. Recursive chunking fixes this by splitting on a prioritized list of separators (double newline → single newline → sentence boundary → word boundary), falling back to a coarser separator only when a chunk still exceeds the size limit, so splits preferentially land on natural document boundaries.
4. Chunk overlap (e.g. 10-20% of chunk size repeated between adjacent chunks) preserves context that would otherwise be lost exactly at a chunk boundary, at the cost of some storage/embedding redundancy.
5. Retrieval itself should combine semantic similarity (cosine similarity over dense embeddings, which captures meaning — "automobile diagnostics" matches "car repair") with keyword search (BM25, which captures exact terms — part numbers, proper nouns) in a hybrid scheme, since dense embeddings alone can miss exact-match queries that keyword search handles trivially.
6. Metadata filtering (source, date, access-control tags) applied *before* or alongside the similarity search prevents the retriever from surfacing documents the requesting user shouldn't see, or documents that are semantically similar but contextually wrong (e.g. an outdated policy version).

```python
import re

def recursive_chunk(text: str, max_chunk_size: int = 500, overlap: int = 50) -> list[str]:
    separators = ["\n\n", "\n", ". ", " "]  # prioritized: paragraph -> line -> sentence -> word

    def split_on(text: str, seps: list[str]) -> list[str]:
        if not seps:
            return [text]
        sep, rest = seps[0], seps[1:]
        parts = text.split(sep)
        chunks, buffer = [], ""
        for part in parts:
            candidate = buffer + sep + part if buffer else part
            if len(candidate) <= max_chunk_size:
                buffer = candidate
            else:
                if buffer:
                    chunks.append(buffer)
                # part itself may still be too large -- recurse with a finer separator
                buffer = part if len(part) <= max_chunk_size else ""
                if len(part) > max_chunk_size:
                    chunks.extend(split_on(part, rest))
        if buffer:
            chunks.append(buffer)
        return chunks

    raw_chunks = split_on(text, separators)

    # apply overlap: prepend tail of previous chunk to the next one
    overlapped = []
    for i, chunk in enumerate(raw_chunks):
        prefix = raw_chunks[i - 1][-overlap:] if i > 0 else ""
        overlapped.append((prefix + chunk).strip())
    return overlapped
```

Common Mistakes:
- Picking one global chunk size for every document type — a legal contract and a chat transcript have very different natural boundaries, and a one-size-fits-all splitter degrades both.
- Using dense vector similarity alone and dropping BM25/keyword search entirely, which silently fails on queries built around exact identifiers (SKUs, error codes, proper nouns) that embeddings don't discriminate well.
- Applying metadata/access-control filters *after* similarity ranking instead of as part of the retrieval query — this leaks restricted content into the top-K candidates before it gets filtered out, and can still leak via reranking scores or logs.

Related Concepts: Recursive Chunking, Hybrid Search (BM25 + Vector), Chunk Overlap, Metadata Filtering, Lost-in-the-Middle
Related Courses: llm-rag-fundamentals-track, production-rag-chunking-embeddings-metadata-filtering, rag-architecture-llm-applications

---

### Question 6: How does HNSW turn nearest-neighbor search from O(N) into approximately O(log N), and what do M, efConstruction, and efSearch actually control?

Think Prompt: Think in terms of a skip-list built out of graphs instead of linked lists, and separate index-build-time parameters from query-time parameters.

Model Answer / Explanation:
1. Flat/exact KNN search compares a query vector against every stored vector — $O(N \cdot d)$ per query. At 10 million 1536-dimensional embeddings, that's roughly 15 billion floating-point operations per query, far too slow for real-time use.
2. A Navigable Small World (NSW) graph connects each vector to its closest neighbors, forming a graph with the "six degrees of separation" property. Searching it greedily (start at a random node, move to whichever neighbor is closest to the query, repeat until no neighbor is closer) usually finds a good answer in few hops — but can get stuck in a local minimum, and a random entry point can still require many hops to reach the right region.
3. HNSW fixes the entry-point problem by stacking multiple NSW graph layers, sparser at the top, borrowing the skip-list idea: search starts at the topmost (sparsest) layer, greedily moves to the locally closest node, then drops down one layer at the same node and repeats with progressively denser connectivity, narrowing in on the true nearest neighbors in roughly $O(\log N)$ hops instead of a linear scan.
4. `M` controls the maximum number of graph edges per node per layer — higher `M` gives better recall and denser connectivity at the cost of more memory and slower inserts.
5. `efConstruction` controls how many candidate neighbors are considered while *building* the graph — higher values produce a higher-quality graph (better recall later) at the cost of longer index build time. It only affects insert-time behavior.
6. `efSearch` controls how many candidates are explored per layer during a *query* — higher values trade query latency for recall, and can be tuned per-query without rebuilding the index, unlike `M` and `efConstruction`.

```python
import numpy as np

def greedy_search_layer(graph: dict[int, list[int]], vectors: np.ndarray,
                         query: np.ndarray, entry_point: int, ef: int) -> list[int]:
    """Greedy routing within a single HNSW layer, keeping the ef closest candidates seen."""
    visited = {entry_point}
    candidates = [(np.linalg.norm(vectors[entry_point] - query), entry_point)]
    best = list(candidates)

    while candidates:
        candidates.sort(key=lambda c: c[0])
        dist, node = candidates.pop(0)
        if best and dist > max(b[0] for b in best) and len(best) >= ef:
            break  # no improvement possible -- local minimum reached for this ef budget

        for neighbor in graph.get(node, []):
            if neighbor in visited:
                continue
            visited.add(neighbor)
            d = np.linalg.norm(vectors[neighbor] - query)
            candidates.append((d, neighbor))
            best.append((d, neighbor))

    best.sort(key=lambda c: c[0])
    return [node for _, node in best[:ef]]
```

Common Mistakes:
- Tuning `M` at query time expecting a recall improvement — `M` is fixed at graph-build time and changing it requires a full re-index, unlike `efSearch`.
- Setting `efSearch` lower than the number of results (`k`) requested — you cannot return more high-quality candidates than the search actually explored, so recall degrades sharply.
- Assuming HNSW returns exact nearest neighbors — it's an *approximate* nearest-neighbor structure; it trades a small, tunable amount of recall for large speed gains, and evaluation must measure recall@k against a ground-truth brute-force scan.

Related Concepts: Approximate Nearest Neighbor Search, Navigable Small World Graphs, Greedy Graph Routing, Index Build vs Query Parameters
Related Courses: llm-rag-fundamentals-track, vector-db-hnsw-graph-index-internals, vector-databases-through-rag-pipeline

---

### Question 7: How does native LLM tool calling avoid the fragility of regex-based prompt parsing, and what validation must the orchestrator still perform?

Think Prompt: Think about where structure is enforced (model-side schema-constrained generation vs. text post-processing) and what a "guaranteed valid JSON" claim does and does not cover.

Model Answer / Explanation:
1. Before native tool calling, developers coerced models into an ad-hoc text format (`Action: GET /users/123`) and parsed it with regex — a missing quote, an extra space, or a hallucinated field format would break the parser and crash the pipeline.
2. Native tool calling supplies the model with a JSON Schema describing each available function's name, parameters, and types. The model is trained (or constrained via grammar-based decoding) to emit a structured JSON object matching that schema instead of freeform text, eliminating the class of "malformed JSON" failures caused by conversational preambles or stray characters.
3. This does not mean the arguments are *semantically* correct — the model can still emit a syntactically valid JSON object with a hallucinated parameter value, a value outside a valid range, or an argument that doesn't correspond to any resource that actually exists.
4. Pydantic (or an equivalent runtime schema validator) is the correct place to enforce those semantic guarantees: types, required fields, enum membership, numeric ranges, and any cross-field constraints, run *after* the model returns its structured call and *before* execution against a real API.
5. The orchestrator lifecycle is: inject schemas + prompt → model selects a tool and emits arguments → orchestrator validates arguments locally → orchestrator executes the call against the real API → result is appended back into the model's context as an observation for the next reasoning step.
6. Execution must never be delegated to the model itself — the model's job ends at producing a validated-shape argument payload; the host application is responsible for actually calling the API, applying authorization checks, and handling failures.

```python
from pydantic import BaseModel, Field, ValidationError

class GetWeatherArgs(BaseModel):
    city: str = Field(..., min_length=1)
    unit: str = Field(default="celsius", pattern="^(celsius|fahrenheit)$")

def execute_tool_call(tool_name: str, raw_arguments: dict) -> dict:
    if tool_name != "get_weather":
        raise ValueError(f"Unknown tool: {tool_name}")

    try:
        # Pydantic re-validates semantics even though the model already emitted valid JSON syntax
        args = GetWeatherArgs.model_validate(raw_arguments)
    except ValidationError as e:
        return {"error": f"Invalid arguments from model: {e}"}  # fed back as an observation, not raised to the user

    return call_weather_api(args.city, args.unit)  # only real execution happens here, never inside the model
```

Common Mistakes:
- Treating "the model supports tool calling" as equivalent to "the arguments are safe to execute" — schema-valid JSON can still contain a hallucinated city name or an out-of-range value that a validator must catch.
- Letting the model's tool-call output execute directly against a production API without an intermediate validation/authorization layer, which turns a hallucination into an unauthorized action instead of just a bad answer.
- Not feeding validation failures back into the model's context as an observation — silently dropping a failed call gives the model no signal to retry with corrected arguments.

Related Concepts: Tool/Function Calling, JSON Schema Constrained Generation, Pydantic Validation, Agent Orchestration Loop
Related Courses: llm-rag-fundamentals-track, llm-tool-calling-json-schemas-pydantic

---

### Question 8: How does the ReAct (Reason + Act) loop differ from a single-shot tool call, and what stops it from looping forever?

Think Prompt: Think about interleaving reasoning traces with actions, and where termination conditions and budget limits need to be enforced.

Model Answer / Explanation:
1. A single-shot tool call is one round trip: prompt → model emits one tool call → orchestrator executes it → done. This is insufficient for tasks that require multiple dependent steps (e.g. "look up the user's order, then check its shipping status, then draft a response").
2. The ReAct loop interleaves explicit reasoning ("Thought: I need the order ID before I can check shipping status") with actions (tool calls) and observations (tool results), feeding each observation back into the context so the next Thought can condition on it.
3. Each iteration: the model produces a Thought, selects an Action (a tool call) based on that Thought, the orchestrator executes the Action and returns an Observation, and the Observation is appended to context for the next iteration — repeating until the model emits a final Answer instead of another Action.
4. Left unconstrained, this loop can run indefinitely if the model keeps selecting actions without ever converging (e.g. it repeatedly calls the same lookup tool with slightly different arguments). Production agents enforce a hard maximum iteration count and a wall-clock/token budget, terminating with a fallback response if the budget is exhausted before a final Answer is reached.
5. Stateful multi-step agents (as opposed to a single linear ReAct chain) are often modeled as a graph (e.g. LangGraph) rather than a flat loop, so branching logic — retry a failed step, escalate to a human, or short-circuit on a confidence threshold — can be expressed as graph transitions instead of ad-hoc conditionals inside the loop body.
6. Every tool call inside the loop still goes through the same schema validation and execution boundary as a single-shot call — ReAct changes the control flow around tool calls, not the trust model for what a tool call is allowed to do.

```python
MAX_ITERATIONS = 6

def react_loop(user_query: str, tools: dict, llm_call) -> str:
    context = [{"role": "user", "content": user_query}]

    for step in range(MAX_ITERATIONS):
        response = llm_call(context)  # model emits either a final answer or {thought, action, args}

        if response.get("final_answer"):
            return response["final_answer"]

        thought, action, args = response["thought"], response["action"], response["args"]
        tool_fn = tools.get(action)
        if tool_fn is None:
            observation = f"Error: no such tool '{action}'"
        else:
            observation = tool_fn(**args)

        context.append({"role": "assistant", "content": f"Thought: {thought}\nAction: {action}({args})"})
        context.append({"role": "tool", "content": f"Observation: {observation}"})

    return "Unable to complete the task within the allotted reasoning budget."  # hard stop, not an infinite loop
```

Common Mistakes:
- Omitting a maximum iteration/budget cap, allowing a model stuck in a reasoning loop (repeating a failing action) to run until an external timeout kills the process ungracefully instead of returning a controlled fallback.
- Feeding raw tool errors back into context without framing them as an Observation the model can reason about — the model then has no signal to try a different action and just repeats the same failing call.
- Conflating the ReAct control loop with the tool-execution trust boundary — adding reasoning steps does not reduce the need to validate and authorize every individual Action before executing it.

Related Concepts: ReAct Reasoning Loop, Agentic Control Flow, Stateful Agent Graphs, Iteration Budget/Termination
Related Courses: llm-rag-fundamentals-track, agentic-ai-react-reason-act-loop, agentic-ai-stateful-graphs-langgraph

---

### Question 9: How does gradient descent actually update parameters in linear regression, and what happens when the learning rate is set too high or too low?

Think Prompt: Think in terms of the loss surface, the gradient as a direction of steepest ascent, and why a single scalar learning rate has to balance convergence speed against stability.

Model Answer / Explanation:
1. Linear regression fits parameters $\theta$ (weights and bias) to minimize a loss function, typically Mean Squared Error: $J(\theta) = \frac{1}{n}\sum_{i=1}^n (\hat{y}_i - y_i)^2$, where $\hat{y}_i = \theta^T x_i$.
2. The gradient $\nabla_\theta J(\theta)$ points in the direction of steepest *ascent* of the loss; gradient descent updates parameters in the opposite direction, scaled by a learning rate $\alpha$: $\theta \leftarrow \theta - \alpha \nabla_\theta J(\theta)$.
3. Batch gradient descent computes the gradient over the entire training set each step (accurate but slow per step); stochastic gradient descent (SGD) uses one example at a time (fast, noisy); mini-batch gradient descent is the practical middle ground used in virtually all production training.
4. If $\alpha$ is too small, convergence is correct but extremely slow — the loss decreases, but training may need far more iterations than the compute budget allows.
5. If $\alpha$ is too large, updates overshoot the minimum: the loss can oscillate or diverge outright, because each step moves further along the loss surface than the local gradient approximation is valid for.
6. In practice, a learning rate schedule (decay over time, or warmup followed by decay) and per-parameter adaptive rates (Adam, which tracks per-parameter running estimates of the first and second moments of the gradient) are used instead of a single fixed $\alpha$, precisely because the ideal step size differs across parameters and across training phases.

```python
import numpy as np

def gradient_descent(X: np.ndarray, y: np.ndarray, lr: float = 0.01,
                      epochs: int = 1000) -> np.ndarray:
    n_samples, n_features = X.shape
    theta = np.zeros(n_features)

    for _ in range(epochs):
        predictions = X @ theta
        error = predictions - y
        gradient = (2 / n_samples) * (X.T @ error)   # d/dtheta of MSE
        theta -= lr * gradient                        # step opposite the gradient

        if np.isnan(theta).any() or np.abs(theta).max() > 1e6:
            raise RuntimeError("Diverged -- learning rate is too high for this loss surface")

    return theta
```

Common Mistakes:
- Picking a single global learning rate without checking the loss curve for oscillation (too high) or near-flat decrease (too low) — the correct value is almost always found empirically, not guessed.
- Forgetting to normalize/standardize features before gradient descent — features on wildly different scales distort the loss surface's curvature, making a single learning rate work well for one feature's gradient and poorly for another's.
- Treating divergence (loss increasing or `NaN`) as a bug in the implementation rather than a learning-rate/scaling issue — it is almost always the latter.

Related Concepts: Gradient Descent, Learning Rate, Loss Surface, Feature Scaling, Adam Optimizer
Related Courses: ml-foundations-from-scratch

---

### Question 10: Why is accuracy a misleading metric for an imbalanced classification problem, and which metrics should replace it?

Think Prompt: Think about what a trivial "always predict the majority class" model scores on accuracy, and what precision, recall, and F1 each measure that accuracy doesn't.

Model Answer / Explanation:
1. Accuracy measures the fraction of all predictions that were correct: $\frac{TP + TN}{TP + TN + FP + FN}$. On a balanced dataset this is a reasonable headline number, but on an imbalanced one it is actively misleading.
2. Consider fraud detection where 0.5% of transactions are fraudulent. A model that always predicts "not fraud" scores 99.5% accuracy while catching zero fraud cases — the metric rewards a completely useless model because the majority class dominates the denominator.
3. Precision answers "of everything the model flagged as positive, how much was actually positive?": $\frac{TP}{TP + FP}$. Low precision means the model wastes downstream review effort on false alarms.
4. Recall answers "of everything that was actually positive, how much did the model catch?": $\frac{TP}{TP + FN}$. Low recall means the model misses real positive cases — the costly failure mode in fraud/medical screening.
5. F1 score is the harmonic mean of precision and recall, $2 \cdot \frac{P \cdot R}{P + R}$, useful as a single number when both false positives and false negatives carry real cost and neither should be optimized in isolation.
6. Precision and recall trade off against each other via the classification threshold — lowering the decision threshold catches more true positives (higher recall) but also admits more false positives (lower precision). The right operating point depends on the relative cost of the two error types for the specific business problem, which is a judgment call accuracy alone cannot make.

```python
def precision_recall_f1(y_true: list[int], y_pred: list[int]) -> dict:
    tp = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 1)
    fp = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 1)
    fn = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 0)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

    return {"precision": precision, "recall": recall, "f1": f1}

# Fraud example: model predicts "not fraud" (0) for every transaction
y_true = [0] * 995 + [1] * 5
y_pred = [0] * 1000
print(precision_recall_f1(y_true, y_pred))
# -> precision=0.0, recall=0.0, f1=0.0 -- correctly exposes the model as useless,
#    even though accuracy on this same data would report 99.5%.
```

Common Mistakes:
- Reporting a single accuracy number as "model performance" for any dataset without first checking the class balance — on an imbalanced dataset this number alone hides a model that never predicts the minority class at all.
- Optimizing purely for recall (catch everything) without checking precision, which in production means flooding a review queue with false positives until the system becomes unusable.
- Comparing F1 scores across two models trained/evaluated at different, uninspected classification thresholds — F1 moves with the threshold, so a fair comparison requires either matching thresholds or comparing full precision-recall curves (or AUC-PR) instead of one F1 point.

Related Concepts: Precision, Recall, F1 Score, Class Imbalance, Classification Threshold
Related Courses: ml-foundations-from-scratch, ml-model-evaluation-metrics

---

### Question 11: What causes hallucination even inside a well-built RAG pipeline, and what guardrails and evaluation metrics catch it before it reaches production?

Think Prompt: Think about the failure modes that exist even when retrieval itself works correctly — the model can still misuse correctly retrieved context.

Model Answer / Explanation:
1. RAG reduces hallucination by grounding generation in retrieved passages, but it does not eliminate it: even when retrieval surfaces the correct passages, the model can still ignore them and answer from its parametric memory, misread a nuance in the retrieved text, or synthesize a plausible-sounding claim that isn't actually supported by any retrieved chunk.
2. A separate, common failure is retrieval itself returning irrelevant or stale chunks (bad chunking, an outdated document not filtered out by metadata, or a query whose embedding doesn't semantically align with the relevant passage) — the model then does exactly what it's designed to do (answer from the provided context) but the context itself was wrong.
3. Prompt injection is a distinct risk specific to RAG: if retrieved documents can contain attacker-controlled or untrusted text, that text is concatenated into the model's context alongside trusted instructions, and the model may follow instructions embedded in the retrieved content rather than treating it as inert reference data.
4. RAGAS-style evaluation separates these failure modes into distinct measurable metrics rather than one blended "quality" score: faithfulness (is every claim in the generated answer actually supported by the retrieved context?), answer relevance (does the answer address the actual question asked?), context precision (how much of the retrieved context was actually relevant?), and context recall (did retrieval surface all the relevant information that exists in the corpus?).
5. Faithfulness specifically catches hallucination-despite-correct-retrieval: it is computed by extracting individual factual claims from the generated answer and checking each one against the retrieved context independently, rather than judging the answer as a single holistic unit.
6. Production guardrails combine this offline evaluation with runtime mitigations: instructing the model explicitly to answer only from provided context and say "I don't know" otherwise, citing the specific source chunk for each claim so a human can verify it, and treating retrieved document content as data rather than instructions to prevent injected text from being followed.

```python
def faithfulness_score(generated_answer: str, retrieved_context: str, extract_claims, nli_check) -> float:
    """
    Faithfulness = fraction of claims in the generated answer that are entailed
    by the retrieved context (RAGAS-style decomposition).
    extract_claims: LLM call that splits an answer into atomic factual claims.
    nli_check: LLM/NLI call returning True if a claim is entailed by the context.
    """
    claims = extract_claims(generated_answer)
    if not claims:
        return 1.0

    supported = sum(1 for claim in claims if nli_check(claim, retrieved_context))
    return supported / len(claims)


# Example: the answer adds an unsupported specific detail the context never stated
context = "The refund policy allows returns within 30 days of purchase with a receipt."
answer = "You can return the item within 30 days, and refunds are processed within 2 hours."

claims = ["Returns are allowed within 30 days.", "Refunds are processed within 2 hours."]
# claim 1 -> entailed by context (True); claim 2 -> not present in context (False)
# faithfulness_score = 1/2 = 0.5, correctly flagging the fabricated "2 hours" detail
```

Common Mistakes:
- Assuming "RAG" is itself a hallucination fix and skipping faithfulness evaluation entirely — a RAG system with poor generation-grounding can hallucinate just as confidently as a non-RAG model, only now with a citation-shaped veneer of credibility.
- Treating retrieved document content as trusted instructions rather than untrusted data, which opens the door to prompt injection from any document an attacker can get indexed (a shared drive, a support ticket, a web page fetched into the corpus).
- Measuring only "context recall" (did we retrieve the right passages) and never "faithfulness" (did the model actually use them correctly) — these are independent failure modes and a system can score well on one while failing badly on the other.

Related Concepts: RAG Hallucination, Faithfulness Evaluation, RAGAS Metrics, Prompt Injection, Context Precision/Recall
Related Courses: llm-rag-fundamentals-track, production-rag-chunking-embeddings-metadata-filtering, rag-from-scratch-why-it-exists, rag-architecture-llm-applications

---
