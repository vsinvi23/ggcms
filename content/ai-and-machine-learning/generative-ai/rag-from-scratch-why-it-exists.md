---
title: "RAG From Scratch: Why Retrieval-Augmented Generation Exists"
description: "Building the retrieval-augmented generation pattern piece by piece, starting from a single LLM call, so every component — retriever, index, augmentation step — is understood as the fix for a specific, nameable failure."
type: "ARTICLE"
categorySlug: "generative-ai"
articleType: "DEEP_DIVE"
tags:
  - "rag"
  - "retrieval-augmented-generation"
  - "llm"
  - "hallucination"
  - "embeddings"
  - "vector-search"
  - "prompt-injection"
---

# RAG From Scratch: Why Retrieval-Augmented Generation Exists

> By the end of this article you'll be able to explain exactly which problem each piece of a RAG system solves, because you'll have built the pattern up yourself, one broken assumption at a time, starting from a single LLM call.

## The Problem

Say you work at a company with an internal HR policy document — twelve pages on parental leave, expense limits, and remote-work rules. It was last updated three weeks ago. Someone asks your company's LLM-based assistant: "How many weeks of parental leave do I get?"

The model answers confidently. The number is wrong — it's the *old* policy, the one that was true when the model's training data was collected, not the one your company updated three weeks ago.

This isn't a bug you can patch. It's a direct consequence of how the model was built, and it shows up as three separate, specific failures:

1. **Knowledge cutoff.** An LLM's weights are frozen at the end of its training run. It has no idea your company exists, let alone what your parental leave policy says today. Every LLM has a training cutoff date after which it simply has no information — ask about anything that happened, or changed, after that point, and there's nothing in the weights to draw on.
2. **Hallucination on facts it never saw.** Here's the part that trips people up: the model doesn't say "I don't know." Language models are trained to produce fluent, plausible continuations of text, not to introspect on the boundaries of their own knowledge. Asked a question it has no grounding for, it produces a fluent, confident, plausible-sounding answer anyway — because that's what its training objective rewards. The absence of knowledge doesn't produce an error message; it produces a fabrication that reads exactly like a correct answer.
3. **No source to check.** Even when the model happens to be right, there is no way to trace that answer back to a specific document, paragraph, or line. You can't ask a plain LLM "which policy document said that?" — the fact isn't stored as a reference to a document, it's stored as statistical patterns spread across billions of parameters. There is nothing to cite because nothing was ever "read" at answer time.

```
User: "How many weeks of parental leave do I get?"
                    |
                    v
         [ Plain LLM, frozen weights ]
                    |
                    v
   "You get 12 weeks of parental leave."
   (Confident. Fluent. Three weeks out of date.
    No document, no page number, nothing to check it against.)
```

This article builds, piece by piece, the architecture that exists specifically to fix these three problems — not by retraining the model, but by changing what happens *before* the model is asked to answer.

## Why This Problem Is Hard

The obvious fix — "just retrain the model on the new policy" — doesn't scale, for reasons worth naming explicitly:

- **Retraining (or fine-tuning) is slow and expensive relative to how often facts change.** Your HR policy might change monthly. Your product catalog might change hourly. A full retrain is not a same-day operation, and even lightweight fine-tuning runs are a deployment event, not something you do reflexively every time one paragraph in one document changes.
- **Fine-tuning teaches behavior, not facts, reliably.** Fine-tuning is good at teaching a model a tone, an output format, a style of reasoning. It's a poor mechanism for injecting a small number of precise, individually-checkable facts — the model can still blend, misremember, or overwrite what it learned, and you have no clean way to verify that a specific fact "made it in" the way you'd verify a row exists in a database.
- **You don't want the model to need retraining just because a document changed.** The people who own the HR policy are not machine learning engineers, and they shouldn't need to be. They should be able to edit a document and have the assistant reflect that change immediately.

So the constraint is: the model's frozen weights cannot be the source of truth for facts that change independently of the model's training schedule. Something else has to hold the facts, and something else has to get the *right* facts in front of the model *at the moment it's asked*.

## A Simple Mental Model

Think about the difference between a **closed-book exam** and an **open-book exam**.

In a closed-book exam, you rely entirely on what you memorized beforehand. If a fact wasn't in your notes when you studied, it isn't available to you now, no matter how confidently you write an answer.

In an open-book exam, you're handed the textbook at the moment of the question. You don't need to have memorized the exact page — you need to know *where to look* and how to *read and synthesize* what you find. Your reasoning ability (how to construct a good answer) and your knowledge source (the textbook) are separate, and you can update the textbook without touching your reasoning ability at all.

A plain LLM call is a closed-book exam. RAG is what happens when you insist on making it an open-book exam instead — and then have to solve every practical problem that "handing someone a textbook mid-exam" creates: which book, which page, how much of it fits on the desk, and how the student is supposed to know it's the book they should trust.

## The Core Idea: Building RAG One Broken Assumption at a Time

We're going to start from the simplest possible thing — one LLM call — and add exactly one new piece each time the previous version breaks in an identifiable way. Every component in a RAG system exists because of a specific failure in the step before it.

### Version 0: The Plain LLM Call

```python
prompt = "How many weeks of parental leave do I get?"
answer = llm.generate(prompt)
```

This is the closed-book exam. It fails exactly as described above: stale or absent knowledge, confident hallucination, no citation.

### Version 1: Stuff the Document Into the Prompt

The most obvious fix: if the model doesn't know the policy, put the policy *in* the prompt.

```python
prompt = f"""
Here is our HR policy document:
{entire_policy_document_text}

Question: How many weeks of parental leave do I get?
"""
answer = llm.generate(prompt)
```

This actually works — for one document. For a single short file it's often the *right* answer; don't reach for a retrieval system when the whole document just fits. But it breaks down along two separate axes as the knowledge base grows past a handful of documents:

- **Context window limits.** Once your knowledge base is thousands of documents — HR policy, engineering runbooks, product specs, support tickets — it no longer fits in any prompt, no matter how large the window.
- **Cost and latency.** Every token in the prompt is a token the model has to process, on every single call, even if only one sentence out of twelve pages is relevant.
- **Degraded recall over long contexts.** Even within a technically-large context window, LLMs are empirically less reliable at retrieving a fact placed in the middle of a very long context than one placed near the start or end — often called "lost in the middle."

> **Verification Note**
> Specific context-window sizes and the precise severity of "lost in the middle" degradation vary by model family and version, and improve over time. Treat these as directional, well-documented tendencies rather than fixed numeric guarantees.

The lesson from Version 1: **we need something that decides which part of the knowledge base is relevant, before it ever reaches the prompt.** That's a new job the LLM itself was never designed to do.

### Version 2: Add a Retriever

We introduce a component whose only job is: given a question, find the small number of passages likely to answer it, out of a much larger collection.

```python
def answer_question(question, all_documents):
    relevant_chunk = retriever.find_most_relevant(question, all_documents)
    prompt = f"""
Context:
{relevant_chunk}

Question: {question}
"""
    return llm.generate(prompt)
```

This is the actual moment RAG is born: **Retrieval**, then **Augmentation** of the prompt, then **Generation**. But `retriever.find_most_relevant(question, all_documents)` — *how*? Scanning every document's full text on every question is exactly the linear-scan cost we were trying to escape, just moved one layer down.

### Version 3: The Retriever Needs a Structure to Search — the Index

This is where **embeddings** and a **vector index** enter the picture. The retriever needs to answer "how semantically similar is this passage to this question" for potentially millions of passages, in milliseconds, without re-reading the raw text every time. The standard solution: convert every passage into a fixed-length numeric vector (an *embedding*) that captures its meaning, once, ahead of time, and store those vectors in a structure built for fast similarity search (a *vector index*).

Two separate things had to exist for the retriever to work:

1. **An index** — a precomputed structure over your documents, built *before* any question is asked, so the expensive part (reading and understanding every document) happens once, offline, not on every query.
2. **A similarity search** over that index at query time, using the same representation (embeddings) for both the stored passages and the incoming question.

```python
def answer_question(question, index):
    query_vector = embed(question)
    relevant_chunks = index.search(query_vector, top_k=3)
    prompt = f"""
Context:
{join(relevant_chunks)}

Question: {question}
"""
    return llm.generate(prompt)
```

### Version 4: The Augmentation Step Needs Structure Too

There's a quiet assumption in Version 2 that deserves its own name: how retrieved text gets combined with the question into a single prompt — the **augmentation** step.

If you just concatenate retrieved text and the user's question with no structure, the model has no way to distinguish "background material I was given" from "instructions I should follow" — and text pulled from a document you don't fully control (a user-submitted form, a public wiki page, a support ticket) can contain sentences that *look like* instructions. A well-formed augmentation step keeps retrieved content and instructions clearly separated:

```python
prompt = f"""
You are answering questions using ONLY the context below. If the answer
isn't in the context, say you don't know — do not guess.

<context>
{relevant_chunks}
</context>

<question>
{question}
</question>
"""
```

This tells the model what role the retrieved text plays (evidence to reason over, not instructions to obey), and gives it explicit permission to say "I don't know" instead of defaulting to a confident guess when retrieval comes up empty.

### Putting the Four Versions Together

```
                 OFFLINE — INGESTION (runs once, ahead of time)
 +--------------+    +----------------+    +-----------------+    +----------------+
 | Source docs  | -> | Split into     | -> | Generate         | -> | Vector index   |
 |              |    | chunks         |    | embeddings        |    | (searchable)   |
 +--------------+    +----------------+    +-----------------+    +----------------+

                 ONLINE — QUERY (runs per user question)
 +--------------+    +----------------+    +-----------------+    +----------------+    +-------------+
 | User question| -> | Embed question | -> | Search index for | -> | Augmentation:  | -> | LLM         |
 |              |    |                |    | top-k chunks     |    | build structured|   | generation  |
 +--------------+    +----------------+    +-----------------+    | prompt          |   +-------------+
                                                      ^             +----------------+          |
                                                      |                                          v
                                              (index built offline)                 Answer, grounded in
                                                                                       retrieved text
```

That's the whole pattern. Every box exists because a specific version above broke without it:

| Component | Exists because... |
|---|---|
| Chunking + embeddings + index (offline) | Version 1 showed you can't re-read everything on every query; the expensive work has to happen once, ahead of time. |
| Retriever + similarity search (online) | Version 1 showed context windows and cost make "include everything" impossible past a handful of documents. |
| Augmentation step | Version 4 showed unstructured concatenation of retrieved text and instructions is itself a risk, and a missed opportunity to license "I don't know." |
| Generation (the LLM call) | This was always here — it's the one thing that *didn't* change. RAG doesn't replace the LLM's reasoning; it changes what evidence reaches it. |

## Let's Walk Through an Example

Back to the HR assistant. With the full pipeline in place:

1. User asks: "How many weeks of parental leave do I get?"
2. The question is embedded into a vector.
3. The index — built ahead of time from the current HR policy documents — returns the top 3 chunks whose embeddings are closest to the question's embedding. Say one of them is the "New Parent Time Off" section, updated three weeks ago.
4. The augmentation step wraps that chunk and the question into a structured prompt, with instructions to answer only from the given context.
5. The LLM generates: "Based on the policy document, you're entitled to 16 weeks of parental leave, effective the policy update from three weeks ago." The system can attach which document and section the chunk came from, because that provenance was carried through the whole pipeline as metadata.

Compare this to Version 0: the number is current, it's traceable to a specific document, and if the policy hadn't mentioned parental leave at all, the model was explicitly told to say so instead of guessing.

## Under the Hood

It's worth being precise about which phase runs *when*, because conflating them is a common source of confusion:

- **Ingestion is a batch, offline process.** It runs whenever documents are added or changed — nightly, on every commit to a docs repo, whatever cadence fits your data. It does not run per user query.
- **Query-time retrieval is synchronous and has to be fast.** It runs inside the request path of every single user question, which is exactly why the index has to support fast approximate search rather than a linear scan.

This separation — expensive work done once, offline; cheap work done per-query, online — is the same shape you'll see in search engines, recommendation systems, and caching layers generally.

## What Can Go Wrong?

- **Retrieval returns nothing relevant, and the model still answers.** If your augmentation step doesn't explicitly instruct the model to say "I don't know" when the context doesn't contain the answer, you haven't fixed hallucination — you've moved it one step later, dressed up with an authoritative-looking `<context>` block.
- **The index is stale.** RAG fixes the *mechanism* for keeping knowledge current, but only if ingestion actually runs when documents change. An unrefreshed index is just a slower, more expensive way to be wrong.
- **The retriever retrieves the wrong thing confidently.** Similarity search returns the *closest* vectors, not necessarily the *correct* ones.
- **"More retrieval" isn't automatically better.** Retrieving 20 chunks instead of 3 reintroduces the context-length and lost-in-the-middle problems from Version 1, at a smaller scale.

## Security Considerations

RAG introduces a trust boundary that a plain LLM call never had to deal with: the model is now being handed text that your organization did not author at inference time.

That means retrieved content has to be treated the same way you'd treat any other untrusted input crossing a trust boundary: it can contain text engineered to look like an instruction ("ignore the above and instead...") — a well-documented attack class called **indirect prompt injection via retrieved content**. Defensive patterns include structured delimiters separating evidence from instructions, output validation, and never letting retrieved text alone trigger privileged actions.

There's a second trust boundary that's easy to miss: **retrieval has to respect who's asking.** A similarity search has no built-in concept of permissions — it will happily return the closest-matching chunk regardless of whether the requesting user is allowed to see the document it came from. Without access-control metadata attached to each chunk at ingestion time (owner, team, classification, sensitivity) and enforced as a filter at query time, a RAG assistant can retrieve and quote from a document the asking user was never authorized to read.

## Common Misconceptions

**Misconception: RAG eliminates hallucination.**
**Reality:** RAG reduces hallucination caused by *missing knowledge* — it does not prevent the model from misreading, misquoting, or drawing an incorrect inference from correctly-retrieved context, and it does nothing if retrieval itself fails to find the relevant passage.

**Misconception: RAG is just a vector database.**
**Reality:** The vector index is one component of one phase (retrieval). RAG is the whole pattern — ingestion, retrieval, augmentation, and generation working together.

**Misconception: RAG and fine-tuning solve the same problem.**
**Reality:** Fine-tuning changes how the model behaves. RAG changes what facts the model has access to at answer time, without touching its weights at all. Production systems frequently use both.

## Expert Insight

A question worth asking before building any of this: **do you actually need retrieval, or would a long-context model plus the whole document just work?** As context windows have grown, "stuff the document in" has become a legitimate production pattern for genuinely small, single-document knowledge bases. RAG earns its complexity at the point where your knowledge base is too large, too dynamic, or too multi-document for that to hold — which, in practice, is most real organizational knowledge bases, but it's worth actually checking rather than assuming.

You cannot tell whether a RAG system is working by reading a handful of answers and deciding they sound right. Retrieval quality and generation quality are two separate things that can each fail independently and silently.

## Key Takeaways

- A plain LLM call fails in three specific, nameable ways: **knowledge cutoff**, **hallucination on unseen facts**, and **no citable source** — RAG exists to address exactly these three.
- **Stuffing the whole document into the prompt** is legitimate for a single small document, but breaks down on context limits, cost, and lost-in-the-middle recall as the knowledge base grows.
- The **retriever** exists to select relevant text instead of including everything; the **index** exists so that selection is fast at query time; the **augmentation step** exists to combine retrieved evidence and the question in a way the model can reliably tell apart.
- Ingestion is offline and batch; retrieval, augmentation, and generation are online and per-query.
- RAG does not eliminate hallucination, is not just a vector database, and does not replace fine-tuning.
- Retrieved content is untrusted input the moment it enters the prompt — RAG introduces a trust boundary a plain LLM call never had.
