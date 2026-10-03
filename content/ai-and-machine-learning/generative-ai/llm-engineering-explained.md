---
title: "LLM Engineering Explained: From Prompting to Production Systems"
description: "Why LLM engineering is a distinct discipline from prompt engineering and classical ML engineering, the four-layer stack every production LLM system needs, and what breaks when a playground prompt meets real users, real load, and real cost budgets."
type: "ARTICLE"
categorySlug: "generative-ai"
articleType: "GUIDE"
tags:
  - "llm-engineering"
  - "prompt-engineering"
  - "evaluation"
  - "orchestration"
  - "production-ai"
  - "reliability"
  - "cost-optimization"
---

# LLM Engineering Explained: From Prompting to Production Systems

> By the end of this article you'll be able to explain what LLM engineering actually covers, why it's a distinct discipline from prompt engineering and classical ML engineering, and what changes once an LLM feature has to survive real users instead of a demo.

## The Problem

Here's a story that plays out in almost every team that ships an LLM feature.

An engineer opens a model provider's playground, writes a prompt, and it works beautifully. The model summarizes the document correctly, answers the support question politely, extracts the fields from the invoice exactly as asked. The demo gets shown in a planning meeting. Everyone is impressed. A ticket gets created: "wire this prompt into the product." A junior engineer copies the prompt string into an API call, ships it behind a feature flag, and a week later the feature is live.

Then reality arrives in pieces:

- A user pastes in a document twice as long as anything tested, and the model quietly truncates or ignores the second half.
- Another user's invoice has a slightly different layout, and the "extracted JSON" comes back with a trailing sentence of prose before the `{`, breaking the downstream parser.
- The bill from the model provider for the first week is ten times what anyone budgeted, because nobody accounted for the system prompt, the retrieved context, and the conversation history being resent on every single turn.
- Someone asks "did the new prompt version we shipped on Tuesday make things better or worse?" and there is no answer, because nobody has anything resembling a regression test for free-text output.
- The model provider ships a "minor" model update, and overnight, output formatting that used to be reliable becomes inconsistent — with no code change on the team's side at all.

None of this happened because the prompt was bad. It happened because "write a good prompt" was treated as the entire job, when it's actually one layer of a much larger engineering problem. That gap — between "a prompt that works once, for me, on my inputs" and "a system that reliably serves this behavior to thousands of users, within a cost and latency budget, safely, and provably better than last week's version" — is what **LLM engineering** exists to close.

## Why This Problem Is Difficult

Three properties of large language models make this genuinely harder than normal application engineering, not just "the same job with an extra API call":

1. **The output is not deterministic, and correctness is not a single boolean.** A traditional function either returns the right value or it doesn't, and you can write `assert result == expected`. An LLM's output is a probability distribution over token sequences — the same prompt can produce different phrasing on different calls, and "correctness" for a summary, a recommendation, or a conversational reply is a matter of degree, not an equality check. Standard unit-testing culture doesn't transfer cleanly.
2. **The component you're building on top of is a black box you don't fully control.** In classical ML engineering, the team that ships the model usually also trained it, chose its features, and can retrain it when behavior drifts. In most LLM engineering, the model itself is a third-party dependency — you can prompt it, sometimes fine-tune it, but you generally cannot inspect why it produced a specific output, and the provider can change its behavior underneath you with a model version bump you didn't request.
3. **Every request has a live cost and latency attached, proportional to how much text flows through it.** A cache miss on a normal API is cheap. A "cache miss" on an LLM call — a long system prompt, a large retrieved context, a long conversation history — is billed per token and takes real wall-clock time to generate, token by token. Get context construction wrong and you pay for it twice: once in the bill, once in how long the user waits.

Put together: you're building software around a probabilistic, third-party, metered component, and you need the resulting system to be predictable, safe, affordable, and fast anyway. That combination of requirements — not the act of writing a prompt — is what LLM engineering is actually about.

## A Simple Mental Model

Think of LLM engineering as the job of being a **systems integrator around a brilliant, inconsistent contractor**, not the job of writing the contractor's instructions.

Imagine you hire an extremely skilled freelance writer to produce content for your business. If your only job were "give the freelancer clear instructions," you'd be doing prompt engineering. But actually running a business around that freelancer means much more: you need a process to check their work before it ships (evaluation), a way to route different jobs to them versus a cheaper in-house intern depending on complexity (orchestration and model tiering), a plan for when they're slow or unavailable (fallbacks and reliability), a budget that doesn't blow up if they're paid per word (cost control), and a way to know, objectively, whether last month's new instructions actually produced better work than the old ones (regression evaluation).

Prompt engineering is writing good instructions for the freelancer. LLM engineering is running the department that depends on them — instructions included, but far from the whole job.

Where the analogy breaks down: a human freelancer has judgment, remembers past feedback, and asks clarifying questions when confused. An LLM call has none of that persistence by default — every request is stateless, and it will confidently produce a plausible-looking answer even when it's wrong, without any signal that it's unsure. That's precisely why the evaluation and guardrail layers below aren't optional polish; they're standing in for the judgment the "contractor" doesn't reliably have.

## Before We Continue

This article assumes you're already comfortable with:

- **What an LLM actually does, mechanically** — tokens, context windows, and autoregressive generation.
- **Decoding basics** — temperature, top-p, and why the same prompt can produce different outputs across calls.
- **Cloud, containers, and Kubernetes fundamentals** — you don't need to be a Kubernetes expert, but you should know what a deployment, a replica, and a load balancer are, since production LLM systems sit on the same infrastructure as everything else.
- **What happens underneath an LLM API call** — request routing, batching, and the prefill/decode split.

This article does not re-derive how transformers work or how a serving cluster batches requests. It treats "calling an LLM" as a building block and focuses on everything that has to be engineered around that call to make it into a real product feature.

## The Core Idea

**LLM engineering is the discipline of designing, evaluating, and operating systems that use a large language model as a component** — as distinct from training that model, and as distinct from only writing the text sent to it.

That definition is deliberately broader than "prompt engineering" and narrower than "machine learning engineering." It helps to place all three side by side, because people use them almost interchangeably and they aren't the same job:

| Discipline | Primary question it answers | What it produces | What it assumes |
|---|---|---|---|
| **Prompt engineering** | "What text should I send the model to get the behavior I want?" | A prompt (or prompt template) | A single call, usually tested manually or informally |
| **Classical ML engineering** | "How do I train, validate, and deploy a model that predicts X from data?" | A trained model artifact, a training/serving pipeline | You control the model's weights, features, and training data |
| **LLM engineering** | "How do I build a reliable, safe, affordable, evaluable *system* around a pre-trained model I mostly don't control?" | A production application: prompts, context pipeline, orchestration, evaluation harness, observability, cost/latency controls | The model is largely a black-box dependency (even when fine-tuned), called repeatedly under real load |

Prompt engineering is a real and necessary skill — it's the input layer of LLM engineering, the same way writing a good SQL query is a real skill and a subset of database engineering. But a team that only does prompt engineering has no answer for "did my last change make this better or worse," "what happens when the provider raises prices," or "what happens when a user tries to break this." LLM engineering is the discipline that has answers for those questions, because it treats the model call as one component inside a larger, engineered system — not as the entire system.

It also isn't classical ML engineering wearing a new hat. A classical ML engineer's core job is upstream of the model: feature pipelines, training loops, validation splits, model selection. Most LLM engineers never train the foundation model they use at all — their core job is *downstream* of it: constructing the right input, handling the output safely, measuring quality over time, and keeping the whole thing running affordably. (The line blurs when a team does fine-tune or continually train a model, but even then, everything covered in this article still has to exist around that model once it's serving traffic.)

## How It Actually Works

An LLM engineering stack has four layers. Each one exists because the layer above it, alone, can't produce a system that's reliable in production.

```
                         User request
                              |
                              v
              +-------------------------------+
              |   Prompt & Context Layer      |   builds the actual input:
              |                                |   system prompt, retrieved
              |                                |   context, conversation
              |                                |   history, tool schemas
              +---------------+----------------+
                              |
                              v
              +-------------------------------+
              |    Orchestration Layer        |   decides call sequence:
              |                                |   single call, chain,
              |                                |   tool-calling loop, agent,
              |                                |   retries, fallbacks
              +---------------+----------------+
                              |
                              v
              +-------------------------------+
              |     Model / Inference Call    |   the actual LLM API call
              |     (gateway, scheduler,       |   (own dedicated serving
              |      GPU cluster)              |    stack)
              +---------------+----------------+
                              |
                              v
              +-------------------------------+
              |  Output Handling & Guardrails |   parsing, schema validation,
              |                                |   safety checks, retries
              +---------------+----------------+
                              |
                              v
              +-------------------------------+
              |    Evaluation & Observability |   offline evals, online
              |                                |   monitoring, tracing,
              |                                |   regression detection
              +-------------------------------+
                              |
                              v
                         Response to user
```

Walking through why each layer earns its place:

**Prompt & context layer.** This is where prompt engineering lives, but it's more than the literal instruction text. It assembles everything the model needs to see: the system prompt, any retrieved documents or tool outputs, relevant conversation history, and — for tool-using systems — the schemas describing what tools are available. Getting this layer wrong (too little context, too much irrelevant context, an unclear instruction) is still the single most common cause of bad output, which is exactly why prompt engineering feels like "the whole job" from the outside.

**Orchestration layer.** Not every request is one call and done. This layer decides: is this a single LLM call, a multi-step chain (summarize, then classify, then draft a reply), a tool-calling loop (the model requests a function, the system executes it, feeds the result back), or a longer-running agent loop? It's also where retries, timeouts, and fallback-to-a-different-model logic live — the same reliability patterns any distributed system needs, applied to a component that happens to be an LLM call.

**Model / inference call.** The actual request to the model — this is its own serving stack (gateway, scheduler, GPU cluster). From the LLM engineer's point of view, this layer is mostly a dependency to call correctly (right parameters, right timeout, right retry policy), not something usually built in-house unless you're the team running the model-serving platform itself.

**Output handling & guardrails.** The model returns text (or structured output, if using a mode built for that). This layer parses it, validates it against an expected schema if one is required, checks it against safety and business-logic rules, and decides whether to accept it, retry with a corrected prompt, or fall back to a safe default. Skipping this layer is how one malformed response becomes a downstream crash instead of a handled, retried, or gracefully degraded case.

**Evaluation & observability.** This is the layer most naive prototypes skip entirely, and it's the one that turns "we think this got better" into "we can prove this got better." It covers offline evaluation (running a fixed test set through the system before shipping a change), online monitoring (tracking quality signals on live traffic), and tracing (recording exactly what prompt, context, and model version produced a given output, so a bad response is debuggable after the fact).

## Let's Walk Through an Example

Say a team is building an internal assistant that triages incoming customer support tickets: read the ticket, decide its category and priority, and draft a first-response suggestion for a human agent to approve.

**Version 1 (prompt engineering only).** A single prompt: "Here's a support ticket. Return its category, priority, and a suggested reply." This works in testing on ten hand-picked tickets. In production, it breaks on: tickets with attachments the model can't see, ticket text in a different language than the ten test cases, and — worst of all — tickets where the model confidently invents a policy the company doesn't actually have when drafting the reply.

**Version 2 (add structure and grounding).** The team switches the model call to a structured-output mode so category and priority come back as validated JSON instead of free text that occasionally includes a stray sentence before the `{`. They also add retrieval: before calling the model, the system fetches the company's actual current support policy documents and includes the relevant excerpt in the prompt, instead of relying on the model's own (out-of-date, sometimes wrong) training knowledge. This is the seam where LLM engineering meets retrieval-augmented generation, but the point for now is that *grounding the model in real, current data* is a context-layer engineering decision, not a prompting trick.

**Version 3 (add evaluation and orchestration).** Before this ships as a change to production, the team runs it against a held-out set of 50 real historical tickets with agent-approved correct answers, using an automated scoring pass (an "LLM-as-judge" comparing the new draft reply against the historical approved one) plus exact-match checks on category and priority. Only once the new version scores at least as well as the previous one on this set does it roll out. They also add a fallback: if the structured-output call fails validation twice, the ticket is routed to a human with no auto-suggestion rather than showing a broken or hallucinated draft.

Here's what a single request looks like moving through the resulting system:

```
+----------------------------------------------------------------------------+
|  Support Agent (UI)     Triage App     Context Builder    LLM API   Validator |
+----------------------------------------------------------------------------+
|                                                                              |
|  New ticket arrives ------>                                                 |
|                             Build prompt (ticket + retrieved policy excerpt) |
|                             --------------------------->                    |
|                                          system+user prompt, JSON schema     |
|                                          ------------------------> LLM      |
|                                          <------------------------          |
|                                          structured response (or malformed) |
|                             <---------------------------                    |
|                             ---------------------------------> Validator    |
|                                                                              |
|   if valid:                                                                 |
|      Validator -> log trace (prompt, output, model version)                 |
|      Validator -> show category, priority, draft reply to Agent             |
|                                                                              |
|   if invalid (1st failure):                                                 |
|      Validator -> retry with corrective instruction -> Context Builder      |
|      Context Builder -> retry call -> LLM                                   |
|                                                                              |
|   if invalid (2nd failure):                                                 |
|      Validator -> log failure trace                                        |
|      Validator -> route ticket to human, no auto-suggestion                 |
+----------------------------------------------------------------------------+
```

Notice what changed between Version 1 and Version 3: none of it is "a better prompt." It's context construction (retrieval), reliability engineering (retry-then-fallback), and a measurement discipline (the held-out eval set) applied around the same basic idea. That's the shape of almost every real LLM engineering project.

## Under the Hood

### Context engineering is a budget problem, not just a writing problem

Every model has a finite context window, and every token inside it costs money and adds latency (the model has to process it during prefill, and — for a conversation — carry it forward on every subsequent turn). Context engineering means deciding, under that budget, what actually goes into the prompt: the system instructions, how much conversation history to keep (a sliding window? a summary of older turns?), how many retrieved documents to include and in what order, and what to leave out entirely. A common, avoidable failure is unbounded context growth: a chat feature that resends the entire conversation history on every turn, so a long-running conversation gets slower and more expensive with every message, until it eventually exceeds the model's context window outright.

### Structured output and why free text isn't good enough for a pipeline

Early LLM integrations often asked the model to "return JSON" inside a free-text prompt and then parsed the response with regular expressions — a brittle pattern, because the model can (and eventually will) wrap the JSON in explanatory prose, use inconsistent field names, or omit a required field. Modern model APIs expose dedicated modes for this — structured output / JSON-schema-constrained generation, and tool/function calling. These modes constrain the model's output space directly rather than hoping a natural-language instruction is followed exactly, and they are the difference between a downstream parser that occasionally crashes and one that has a well-defined contract to validate against.

> **Verification Note**
> The exact mechanism (grammar-constrained decoding, fine-tuning for JSON reliability, or a hybrid) differs by model provider and version. Confirm the current guarantees ("guaranteed valid JSON" versus "usually valid JSON, validate anyway") against that provider's own API documentation before relying on it — and validate the output regardless, since even a "guaranteed" schema doesn't guarantee the *values* inside it are correct.

### Orchestration: chains, tool-calling loops, and agents are not the same thing

It's worth being precise here, because the terms get used loosely:

- A **single call** sends one prompt, gets one response. No orchestration needed.
- A **chain** runs a fixed sequence of calls where each step's output feeds the next (summarize -> classify -> draft) — the sequence itself is hardcoded by the engineer, not decided by the model.
- A **tool-calling loop** lets the model itself decide, at each step, whether to call a defined tool (a function, an API, a database query) or respond directly — the model participates in deciding what happens next, within a fixed set of options the system exposes to it.
- An **agent** generalizes this further: the model plans a sequence of actions toward a goal, potentially across many steps, adjusting its plan based on what each tool call returns (the ReAct pattern, and its state-machine formalization in graph-based orchestration frameworks like LangGraph, are two concrete implementations of this idea).

Choosing the least powerful pattern that solves the problem is usually the right call: a fixed chain is easier to test, debug, and reason about than an open-ended agent loop, and it fails in more predictable, bounded ways. Reach for agent-style orchestration when the sequence of steps genuinely can't be known in advance — not because it sounds more sophisticated.

### Evaluation: the layer that turns opinions into evidence

Because LLM output can't be checked with a simple equality assertion, evaluation has to use different tools:

- **Golden datasets** — a curated, versioned set of realistic inputs with known-good (or known-acceptable-range) outputs, run automatically whenever the prompt, model version, or pipeline changes.
- **LLM-as-judge** — using a separate (often stronger, or differently-configured) model call to score a candidate output against a rubric, since exact string matching is too strict for free-text quality.
- **Human-in-the-loop review** — for the highest-stakes changes, or to calibrate whether the automated judge is actually measuring what humans care about; automated evals are a force multiplier for human review, not a full replacement for it.
- **Online monitoring** — tracking live-traffic signals (user edits/rejects a suggested draft, thumbs-down rate, downstream task success) that no offline golden set can fully anticipate, because real traffic always contains cases the test set doesn't.

A useful rule of thumb: if you can't answer "did the last prompt change help or hurt," you don't yet have LLM engineering — you have LLM prompting with extra steps. The evaluation layer is what lets a team change a prompt with the same confidence a normal engineering team changes code covered by tests.

### Reliability patterns borrowed from distributed systems

Nearly every reliability technique that applies to calling any external, sometimes-slow, sometimes-failing service applies here too, with LLM-specific wrinkles:

- **Timeouts and retries with backoff** — an LLM call can be slow under load; a naive infinite-retry loop on a struggling provider is exactly the kind of retry storm that makes an outage worse for everyone calling that provider, not just you.
- **Fallback models** — routing to a smaller, cheaper, or different-provider model when the primary is unavailable, over quota, or too slow, accepting a quality trade-off in exchange for availability.
- **Circuit breakers** — if a downstream dependency (the model API, a retrieval index) is failing consistently, stop hammering it and fail fast (or fall back) instead of queuing requests that will just time out anyway.
- **Idempotency and caching** — identical or near-identical prompts (a common FAQ question, a repeated tool schema) are candidates for response caching, which directly reduces both cost and latency for the cases where it's safe to do (be careful: caching is only safe when the answer genuinely shouldn't vary per user or per moment in time).

### Cost and latency are the same lever, pulled from different directions

Cost in most LLM APIs is priced per token, in and out. Latency is dominated by how many tokens have to be generated (and, more subtly, how large the context is that the model has to process before it starts generating). That means the same engineering decision — trimming unnecessary context, capping response length, choosing a smaller model for a simpler sub-task — usually improves cost and latency together, not one at the expense of the other. This is why **model tiering** (routing easy requests to a small, fast, cheap model, and only escalating to a larger model when the task actually needs it) is one of the highest-leverage production optimizations in LLM engineering: it's a cost lever and a latency lever at the same time, and, done carefully with evaluation coverage, doesn't have to be a quality lever against you.

## Implementation

Here's a small, illustrative pipeline in Python that puts several of the layers above into code. It's deliberately minimal — a real system would have more validation, logging, and configuration — but every piece maps to a concept discussed above. It assumes an OpenAI-compatible chat completions API with a JSON-schema structured-output mode; adapt the client call for your actual provider. It also assumes **Python 3.10+**, which is what lets `TriageResult | None` below be evaluated directly — on 3.9 or earlier you'd need `from __future__ import annotations` (available since 3.7) for that syntax to not raise a `TypeError` at import time.

```python
import json
import time
from dataclasses import dataclass

import openai

client = openai.Client()

TICKET_SCHEMA = {
    "type": "object",
    "properties": {
        "category": {"type": "string", "enum": ["billing", "technical", "account", "other"]},
        "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]},
        "draft_reply": {"type": "string"},
    },
    "required": ["category", "priority", "draft_reply"],
}

SYSTEM_PROMPT = (
    "You triage customer support tickets. Use ONLY the policy excerpt provided "
    "as ground truth for any policy claims in your draft reply. If the policy "
    "excerpt doesn't cover the question, say so instead of guessing."
)


@dataclass
class TriageResult:
    category: str
    priority: str
    draft_reply: str
    model_version: str


def build_context(ticket_text: str, policy_excerpt: str) -> list[dict]:
    # Context layer: bounded, explicit inputs only -- no unbounded history here.
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Policy excerpt:\n{policy_excerpt}\n\nTicket:\n{ticket_text}"},
    ]


def call_model(messages: list[dict], model: str, timeout_s: float = 10.0) -> dict:
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        response_format={"type": "json_schema", "json_schema": {"name": "ticket_triage", "schema": TICKET_SCHEMA}},
        timeout=timeout_s,
    )
    return json.loads(response.choices[0].message.content), response.model


def triage_ticket(ticket_text: str, policy_excerpt: str) -> TriageResult | None:
    messages = build_context(ticket_text, policy_excerpt)

    # Orchestration layer: bounded retry, then a safe fallback -- never an
    # unbounded loop against a struggling dependency.
    for attempt in range(2):
        try:
            parsed, model_version = call_model(messages, model="primary-model")
            # Output handling: schema-shaped by the API, but we still validate
            # the *values*, since a well-formed JSON object can still be wrong.
            if parsed["category"] not in {"billing", "technical", "account", "other"}:
                raise ValueError("unexpected category value")
            log_trace(ticket_text, parsed, model_version)  # evaluation/observability layer
            return TriageResult(**parsed, model_version=model_version)
        except (json.JSONDecodeError, ValueError, TimeoutError, openai.APIError) as exc:
            log_failure(ticket_text, attempt, exc)
            time.sleep(0.5 * (attempt + 1))  # simple backoff before the one retry

    # Both attempts failed: degrade to a human, never to a guessed answer.
    return None


def log_trace(ticket_text: str, parsed: dict, model_version: str) -> None:
    ...  # write to your tracing/eval store: input, output, model version, timestamp


def log_failure(ticket_text: str, attempt: int, exc: Exception) -> None:
    ...  # structured failure logging, feeds your reliability dashboards
```

A few lines worth calling out, because each one is a concept from above made concrete:

- `response_format={"type": "json_schema", ...}` is the structured-output layer — it's why `json.loads` is a reasonable thing to call directly on the response instead of regex-scraping prose.
- The bounded `for attempt in range(2)` loop, with backoff and a hard stop, is the reliability layer — it retries once for a transient failure, then degrades safely rather than looping indefinitely or returning a bad answer.
- `log_trace` and `log_failure` are the evaluation/observability layer stub — in a real system, these feed the golden-dataset comparisons and the online monitoring dashboards described earlier; without them, nothing here is measurable over time.
- Returning `None` instead of any guessed `TriageResult` on repeated failure is a deliberate design choice: the system's fallback behavior is "hand off to a human," not "produce something that looks plausible."

## What Can Go Wrong?

- **Prompt drift after a silent model upgrade.** A provider updates the default model version behind an API alias, and formatting, tone, or instruction-following that used to be reliable shifts — with zero code change on your side. This is exactly why pinning explicit model versions and running your golden-dataset evaluation before adopting a new version matters, rather than trusting that "the same model name" means "the same behavior."
- **Unbounded context growth.** A chat feature that resends full history on every turn gets slower, more expensive, and eventually hits the context limit as conversations get longer — a problem that's invisible in a five-message demo and obvious in a fifty-message real conversation.
- **Retry storms.** Naive, unbounded retry logic against a degraded or rate-limited provider amplifies load exactly when the provider is least able to handle it, turning a partial outage into a full one for your traffic.
- **Structured output that's syntactically valid but semantically wrong.** A schema-conformant JSON object can still contain a hallucinated field value (a category that doesn't apply, a "policy fact" invented rather than retrieved). Schema validation catches malformed output; it does not catch confidently wrong output — that's what evaluation and grounding (retrieval) are for.
- **Cost blowup from context you didn't mean to send.** Retrieved documents, tool schemas, and conversation history are easy to over-include "just in case," and every extra token is billed and adds latency on every single call, not just once.
- **Shipping changes with no regression signal.** Without a golden dataset or evaluation harness, a prompt or model change that quietly makes 15% of responses worse can ship straight to production, because nothing measured the "before" to compare against the "after."

## Security Considerations

LLM engineering inherits every standard application-security concern, plus several that are specific to putting a language model in the request path:

- **Prompt injection.** If any part of the assembled context includes untrusted user input, retrieved documents, or tool output, an attacker can embed instructions in that content designed to override the system prompt ("ignore previous instructions and…"). This applies to both direct injection (the user typing it) and indirect injection (a malicious instruction hiding inside a retrieved web page or document the model reads). The short version for an LLM engineer is: never treat model output as a trusted instruction for a downstream system, and never treat retrieved/tool content as safe just because it came from "your own" pipeline.
- **Unsafe handling of model output.** Piping a model's output directly into a shell command, a SQL query, an `eval()`, or a rendered HTML page without validation and escaping turns any successful prompt injection (or plain hallucination) into a code-execution or injection vulnerability in your own system — the model becomes an attacker-influenceable input source, and needs to be treated with the same suspicion as any other untrusted input.
- **Least-privilege tool access.** In a tool-calling or agent system, the model decides *when* to call a tool, but the engineered system decides *what's possible* to call and with what permissions. A tool that can delete records, send money, or send emails should require the narrowest scope and, for high-impact actions, a human approval step — never "the model asked for it" as sufficient authorization on its own.
- **Sensitive data in prompts, logs, and traces.** Everything discussed in the evaluation and observability layer — logging prompts and completions for debugging and regression testing — is also a data-handling surface. Prompts and retrieved context routinely contain PII or confidential business data; trace storage needs the same access control, retention policy, and encryption treatment as any other store of sensitive data, not an exemption because it's "just logs for debugging AI stuff."
- **Vendor and model supply chain trust.** Calling a third-party model API means sending your prompts (and whatever data they contain) to that provider, subject to their data-handling and retention terms. Self-hosting an open-weights model shifts the risk instead of eliminating it — you now need to trust the provenance of the weights and the runtime that serves them, the same supply-chain concern that applies to any dependency you didn't write yourself.

## Common Misconceptions

**Misconception:** "LLM engineering is just prompt engineering with a fancier title."
**Reality:** Prompt and context construction is one layer of four. Most of the actual engineering effort in a mature LLM system lives in evaluation, orchestration, and production operations — the parts that don't show up in a playground demo at all.

**Misconception:** "If it works well in my manual testing, it's ready to ship."
**Reality:** Manual testing samples a handful of cases you thought of. Production traffic includes inputs, edge cases, and adversarial attempts you didn't think of, at a volume where "usually works" isn't good enough. That gap is exactly what a golden-dataset evaluation harness is meant to close before shipping, not after something breaks.

**Misconception:** "LLM engineering and machine learning engineering are the same skill set."
**Reality:** Classical ML engineering centers on training, feature pipelines, and model selection — you control what the model learns. Most LLM engineering treats the model as a fixed, external dependency and focuses on everything around the call: context construction, orchestration, evaluation, and operations. The skills overlap (both care about data quality and evaluation rigor) but the day-to-day work is different.

**Misconception:** "A newer or bigger model is always a safe upgrade."
**Reality:** A different model version can change formatting habits, instruction-following behavior, and failure modes in ways your existing prompts and validators weren't built for. Treat any model change — bigger, smaller, or "same name new version" — as a change that needs to pass your evaluation suite before it reaches production traffic, exactly like any other dependency upgrade.

## Real-World Architecture

The layered pattern described in this article — prompt/context construction, orchestration, guardrails, evaluation/observability, sitting on top of a model-serving layer — shows up repeatedly across the industry's published reference material for generative AI applications, which is a reasonable signal that it reflects the shape of the problem rather than one team's preference:

- Major cloud providers' architecture centers publish reference architectures for generative AI applications that separate an "application/orchestration" tier from the underlying model-serving tier, generally recommending dedicated evaluation and observability components rather than treating the model call as the whole system.
- The rise of dedicated **LLM observability and evaluation tooling** as its own product category (tracing prompts, tokens, and evaluation scores across model and prompt versions) is itself evidence that teams converged on needing this layer once they moved past prototypes — it mirrors how APM (application performance monitoring) emerged once web services outgrew "add some print statements."
- **Model gateways** — a routing layer that sits in front of multiple model providers and versions, handling fallback, cost tracking, and sometimes caching — have become a common architectural piece specifically because production systems need to swap or route between models without rewriting application code, which lines up directly with the orchestration and reliability patterns described above.

> **Verification Note**
> Specific product names, feature sets, and reference-architecture diagrams from any named cloud provider (Google Cloud Architecture Center, AWS Architecture Center, Microsoft Learn) change frequently. Confirm current guidance and specific service capabilities directly against that provider's own documentation before using them in a design decision.

## Expert Insight

The teams that move fastest on LLM features are, almost without exception, the ones that invested early in an evaluation harness — not the ones with the cleverest prompts. Once you can measure "did this change help or hurt" automatically, you can iterate on prompts, retrieval strategy, and even model choice with the same confidence a well-tested codebase gives a normal engineering team. Without that harness, every change is a leap of faith, reviewed by vibes, and teams predictably become afraid to touch a prompt that's "working," which is its own kind of technical debt — a system nobody dares improve.

The second lesson experienced teams learn, usually from a surprising invoice: **context is the actual cost lever, and it's mostly invisible until you measure it.** It's easy to reason about model choice ("we use the cheaper model") and completely miss that the system prompt grew by 30% over six months of small "just add this instruction" edits, that retrieved context includes three documents when one would do, and that conversation history is resent in full every turn. None of those decisions look expensive individually. Summed across every request, they usually dwarf the difference between model tiers. Treating prompt and context length as a metric worth tracking over time — the same way you'd track query latency or payload size in any other system — catches this long before the monthly bill does.

## Try It Yourself

**Goal:** Build a minimal evaluation harness and use it to make an evidence-based decision about a prompt change, instead of a gut-feel one.

**Starting Point:** Access to any LLM API (a hosted provider, or a locally-run open-weights model through a tool like Ollama), and a simple task you can define — for example, "classify a short piece of text into one of three categories."

**Task:**
1. Write down 8-10 realistic example inputs for your task, along with what you consider the correct output for each. This is your golden dataset — keep it small but honest; use real or realistic edge cases, not only easy ones.
2. Write a "Version A" prompt and run it against every example, recording pass/fail against your expected outputs (exact match is fine for a classification task; for free-text tasks, score each output yourself as acceptable/not-acceptable).
3. Compute Version A's pass rate as a single number.
4. Write a "Version B" prompt that changes something specific (a clearer instruction, an added example, a different structured-output schema) and run it against the *same* golden dataset.
5. Compare the two pass rates.

**Expected Result:** You should be able to say, with a number attached, whether Version B is actually better than Version A on your test set — not just "it feels better based on the last response I read."

**What You Learned:** This is a miniature version of exactly the evaluation discipline described in the article: a fixed, versioned test set, an automated (or at least systematic) scoring pass, and a comparison across prompt versions. The same pattern scales up to LLM-as-judge scoring, larger datasets, and CI-integrated regression checks — the mechanics don't change, only the scale.

## Pause and Think

Why can't you unit-test an LLM-backed feature the same way you unit-test a normal function?

### Answer

A normal function is (usually) deterministic: given the same input, `add(2, 3)` always returns `5`, so `assert add(2, 3) == 5` is a complete and correct test. An LLM call is not deterministic in the same sense — even at low temperature, wording, phrasing, and sometimes substantive content can vary between calls to the same prompt, and "correctness" for a summary or a conversational reply is often a matter of degree rather than an exact match. A single `assert output == expected_string` would fail constantly on perfectly good outputs that are merely phrased differently, or would need to be so loose it stops catching real regressions. That's why LLM evaluation uses different tools instead: golden datasets scored against a rubric (often by another LLM acting as judge), statistical pass rates across many examples rather than pass/fail on one, and human review calibrating whether the automated scoring actually tracks what matters. You're still testing — you're just measuring a distribution of quality instead of asserting a single exact value.

## Key Takeaways

- LLM engineering is a distinct discipline from prompt engineering (writing the input) and from classical ML engineering (training the model) — it's the engineering of a *system* around a mostly-black-box model component.
- The stack has four layers: prompt/context construction, orchestration, output handling and guardrails, and evaluation/observability — each exists because the layer above it alone can't produce a reliable production system.
- A prompt that works in a playground fails in production for predictable reasons: unbounded context growth, non-deterministic output breaking rigid parsers, cost and latency scaling with every token sent, and silent model upgrades changing behavior underneath you.
- Reliability patterns from distributed systems (timeouts, bounded retries with backoff, fallback models, circuit breakers) apply directly to LLM calls, because an LLM API is, mechanically, just another external service dependency with its own failure modes.
- Evaluation — golden datasets, LLM-as-judge scoring, and online monitoring — is what turns "we think this got better" into evidence, and it's the single biggest unlock for teams that need to iterate on prompts and models with confidence.
- Security here includes prompt injection, unsafe handling of model output, least-privilege tool access, and sensitive data in prompts/logs — on top of whatever standard application security the rest of the system already needs.

## What to Learn Next

This article stayed at the level of the general stack and its production concerns. Natural next steps: going deep into the context-construction problem touched on above — how retrieval actually grounds a model in real, current data instead of relying on what it memorized during training (this knowledge base's RAG architecture articles) — and building out the evaluation layer introduced here into a full methodology, including how to design golden datasets and interpret LLM-as-judge scores without fooling yourself.
