---
title: "AI Agents for Refactoring Legacy Systems"
slug: "ai-agents-refactoring-legacy-systems"
category: "AI Software Engineering"
subcategory: "Legacy System Modernization"
domain: "Software Engineering"
level: "Advanced"

prerequisites:
  - "How AI Coding Agents Understand an Entire Codebase"
  - "How AI Agents Read, Modify, Test, and Commit Code"
  - "The Architecture of an AI Coding Agent"
  - "Agentic Software Engineering: From Prompt to Production"

learning_outcomes:
  - "Explain why refactoring legacy code is a fundamentally different problem for an AI agent than generating new code"
  - "Scope a large refactor into small, independently verifiable units with a bounded blast radius"
  - "Build a behavior-preservation safety net using characterization tests, golden-master testing, and coverage gates before letting an agent touch legacy code"
  - "Identify the specific failure modes of agentic refactoring on code nobody fully understands, including Hyrum's Law violations and silent behavior drift"
  - "Apply staged-rollout patterns (strangler fig, branch by abstraction, feature flags) to de-risk agent-driven modernization work"

related:
  - "Why AI-Generated Code Still Needs Senior Engineers"
  - "How AI Coding Agents Understand an Entire Codebase"
  - "Designing Reliable AI Agents: Fallbacks, Validation, and Backoff"
  - "Why AI Agents Fail: A Deep Dive into Agentic Failure Modes"
  - "Testing AI Agents Like Software: Evaluators, Judges, and Deterministic Mocks"

next:
  - "AI Agents for Automated Testing"

tags:
  - ai-agents
  - refactoring
  - legacy-systems
  - technical-debt
  - characterization-testing
  - software-modernization
  - ai-native-engineering

content_status: "draft"
last_reviewed: "2026-09-17"
---

# AI Agents for Refactoring Legacy Systems

> By the end of this article you'll be able to scope a legacy refactor so an AI agent can attempt it safely, build the test safety net that actually proves behavior didn't change, and name the specific ways this goes wrong when the code predates everyone currently reading it.

## The Problem

Every engineering org has at least one system like this: a billing engine, a claims processor, a pricing calculator, an order-routing service. It's been running in production for six, eight, twelve years. It works — mostly. Nobody fully trusts it, and nobody fully understands it either. The original authors left years ago. The comments are wrong or absent. The test suite covers maybe 30% of the code, and the 30% it does cover is the easy part, not the part that scares anyone.

Now someone proposes: "let's point an AI coding agent at it and clean it up." Extract the tangled 800-line function into something readable. Remove the dead feature-flag branches nobody has toggled since 2019. Replace the hand-rolled retry loop with something sane. The agent is good at exactly this kind of mechanical transformation — it can read the whole file, hold the whole function in context, and produce a cleaner version in seconds.

That's exactly where the danger starts. An agent that generates *new* code fails safely: if the generated function is wrong, it usually just doesn't work, and you find out in a code review or a failing test before it ships. An agent that *refactors existing production code* can produce something that compiles, passes the tests that exist, looks cleaner, and quietly changes what the system actually does — and the failure doesn't show up until three weeks later when a downstream batch job that depended on the old (undocumented, unintended) behavior breaks in a way nobody connects back to the refactor.

Refactoring, by definition, is supposed to change the code's structure without changing its observable behavior. The entire discipline exists because "clean up the code" and "change what the code does" are different operations that look identical in a diff. An AI agent applying that discipline to code it has never seen before, on a system whose behavior isn't fully specified anywhere, is the hardest version of this problem — and it's the version most teams will actually ask an agent to do first, because legacy cleanup is exactly the tedious, high-volume work agents are pitched as good at.

## Why This Problem Is Uniquely Hard for Agents

Three things make legacy refactoring different from — and harder than — the greenfield coding tasks covered in earlier articles in this series.

**1. The specification lives in the code, not above it.** For a new feature, there's usually a ticket, a design doc, or at minimum a conversation that describes the intended behavior. An agent generating that feature can be checked against that intent. Legacy code often has no such document. The *only* description of what the system is supposed to do is what it currently does — bugs, quirks, and all. This inverts the normal correctness question. You're no longer asking "does this match the spec?" You're asking "does this match itself?" — and an agent has no way to know which parts of "itself" are the actual contract and which are accidents nobody noticed.

**2. Legacy code is legacy code precisely because it lacks a trustworthy test suite.** Michael Feathers' well-known definition in *Working Effectively with Legacy Code* is blunt about this: legacy code is simply code without tests. That's not a moral judgment — it's an operational one. Without tests, you have no fast, mechanical way to know whether a change preserved behavior. An agent's usual feedback loop — make a change, run the tests, see green, keep going — degrades badly when the tests it can run don't actually cover the paths it's touching. Green tests on an undertested system are weak evidence, and an agent that treats them as strong evidence will refactor with false confidence.

**3. Other systems depend on behavior nobody intended to promise.** This is formalized as **Hyrum's Law**: with a sufficient number of users of an API (or a system, or a function), it does not matter what you promised in the contract — all observable behaviors of your system will eventually be depended on by somebody. A legacy function that silently swallows a particular exception, returns `null` instead of raising on a specific edge case, or rounds a number a certain way is not "buggy" from the point of view of whatever downstream job started relying on that exact behavior years ago. An agent reading the function in isolation has every reason to "fix" that behavior — it looks like a bug. It has no way to know a nightly reconciliation job encodes that exact quirk as an assumption.

Put together: the agent is working from an incomplete spec (the code itself), validating against an incomplete safety net (a thin test suite), inside a system where "incorrect-looking" behavior may be load-bearing for consumers it can't see. This is a fundamentally different risk profile from "write me a new REST endpoint."

## Before We Continue

This article assumes you're already comfortable with how a coding agent reads a codebase and executes multi-step changes — covered in **How AI Coding Agents Understand an Entire Codebase** and **How AI Agents Read, Modify, Test, and Commit Code**. It also assumes the basic agent loop (context → plan → tool call → observation → next action) from **The Architecture of an AI Coding Agent**. What follows builds on that foundation for one specific, high-risk task: taking code an agent (and often the team) doesn't fully understand, and changing its shape without changing its behavior.

## The Core Idea: Refactoring Is Not Rewriting

It's worth being precise about vocabulary, because the whole safety strategy depends on it.

- **Refactoring** changes internal structure while preserving external behavior. Extracting a method, renaming a variable, replacing a hand-rolled cache with a library, splitting a class — all refactors, *if* nothing observable changes.
- **Rewriting** replaces a component's implementation and accepts that behavior may change, ideally deliberately and reviewed.
- **Modernization** is the umbrella business goal (reduce technical debt, move off a deprecated framework, improve maintainability) that gets accomplished through some mix of the two.

An AI agent should be pointed at *refactoring* far more often than at *rewriting*, because refactoring has a testable success criterion — behavior preservation — that a rewrite doesn't. "Does the output match the old output for the same inputs" is a question you can automate. "Is the new design correct" is a design review, not a test run. Most of the value (and most of the safety) in agent-driven legacy work comes from staying inside the refactoring definition as long as possible and treating any behavior change as a deliberate, separately-reviewed decision — never a side effect the agent introduced while "cleaning up."

## How It Actually Works: Scoping a Safe Refactor

The single most important decision in an agentic refactor happens before the agent writes a line of code: **how big is the unit of change, and what is its blast radius?**

A safe scope has three properties:

1. **It has a clear input/output boundary.** A pure function, a class with a narrow public interface, a module with few callers — something you can pin down at the edges. A refactor whose boundary is "half of this class and some of its private helpers" has no clean edge to test against.
2. **Its blast radius is small and known.** Before touching anything, find every caller. If a function is called from 3 places in one service, that's a scoped refactor. If it's called from 40 places across 6 services, some of which are jobs that only run monthly, the blast radius is not actually known until you've traced it — and an agent should not proceed past that discovery step until a human has seen the caller list.
3. **It can be verified without touching production.** You need a way to run the old and new versions side by side, or against recorded/replayed inputs, without the refactor itself being the first time it's exercised against real traffic.

```
                    Legacy System
                          │
                          ▼
        ┌───────────────────────────────────┐
        │   Step 1: Find candidate unit      │
        │   (function / class / module with  │
        │   a definable boundary)            │
        └────────────────┬────────────────────┘
                          ▼
        ┌───────────────────────────────────┐
        │   Step 2: Trace every caller and   │
        │   every caller of THAT, until the  │
        │   blast radius stops growing       │
        └────────────────┬────────────────────┘
                          ▼
                 Blast radius acceptable?
                  ┌───────┴────────┐
                 No                Yes
                  │                 │
                  ▼                 ▼
        Shrink the unit,     Step 3: Build the
        or stop and get      verification harness
        a human to map        (see next section)
        the wider system            │
                                    ▼
                          Step 4: Let the agent
                          refactor inside the
                          verified boundary only
```

This is the opposite instinct from how agents are usually pitched — "give it the whole file, the whole module, the whole repo." For legacy refactoring, bigger context does not mean a safer change. It means a bigger, less-verifiable diff. Scope down until you can actually prove nothing changed; expand only after that first unit is verified and shipped.

## Verifying Behavior Preservation: The Test Safety Net

If the code had a trustworthy test suite, it wouldn't be legacy code in the meaningful sense used here. So the first job — before any refactor — is building a safety net that doesn't assume the tests you inherited are sufficient.

### Characterization tests

A characterization test doesn't assert what the code *should* do — it asserts what the code *currently* does, recorded mechanically rather than reasoned about. You feed the unit a representative range of inputs (including the weird ones: empty strings, nulls, negative numbers, the oldest and newest records in the database, malformed input that somehow doesn't crash it), capture its actual output for each, and pin those input/output pairs down as the new test suite. You are not verifying correctness — you're photographing current behavior so any future change (agent-made or human-made) can be checked against that photograph.

```python
# characterization_test.py
# These are NOT "expected" outputs based on a spec.
# They are RECORDED outputs from the current legacy function,
# captured before any refactor begins.

from legacy.pricing import calculate_discount

CASES = [
    # (input_kwargs, recorded_output) — captured by running the
    # existing function, not derived from any requirements doc.
    ({"price": 100.0, "tier": "gold", "qty": 1}, 90.0),
    ({"price": 100.0, "tier": "gold", "qty": 0}, 100.0),      # qty=0: no discount applied — quirky, but current behavior
    ({"price": 0.0, "tier": "gold", "qty": 5}, 0.0),
    ({"price": 100.0, "tier": "unknown_tier", "qty": 1}, 100.0),  # unknown tier silently falls back — undocumented, but real
    ({"price": -50.0, "tier": "gold", "qty": 1}, -45.0),      # negative price isn't rejected — nobody guards against it
]

def test_characterization_matches_recorded_behavior():
    for kwargs, recorded_output in CASES:
        assert calculate_discount(**kwargs) == recorded_output, (
            f"Behavior changed for input {kwargs}: "
            f"expected recorded output {recorded_output}"
        )
```

Notice the `qty=0` and `unknown_tier` cases: they look like bugs. They might *be* bugs. But fixing them is a product decision made by a human who understands the downstream impact — not something an agent should do silently while "just refactoring." The characterization suite exists to catch exactly this: if the refactored version handles `qty=0` differently, the test fails, and now a human has to decide whether that's an intended fix or an accidental regression, instead of finding out from a customer.

### Golden-master (approval) testing for larger units

For a unit too large or too stateful to enumerate by hand — a report generator, a full request handler, a batch job — capture whole outputs (a generated file, a full JSON response, a database snapshot after the job runs) against a corpus of real or realistic inputs, and diff the new version's output against that "golden master" byte-for-byte or structurally. Any difference has to be explained, not just approved because the diff "looks fine."

### The coverage gate, not the coverage vanity metric

Line coverage on the *unit being refactored* — not the whole repo — is the number that matters here. If characterization testing gets you to, say, 90%+ line and branch coverage on the specific function or class in scope, an agent's refactor of that unit is well-guarded. Repo-wide coverage percentages are close to meaningless for this purpose; they hide exactly the kind of unevenly-tested legacy hotspot this whole exercise is about.

### Mutation testing as a sanity check on the safety net itself

A subtlety worth knowing: passing characterization tests only tells you the refactor didn't change what those specific tests measure — it says nothing about whether the tests are strong enough to catch a real behavior change in the first place. Mutation testing (deliberately introducing small bugs — flipping a comparison operator, off-by-one an index — into the code and checking whether the test suite actually fails) is the standard way to measure whether your safety net has holes. Running it on the *original* legacy unit before the agent touches anything tells you how much to trust a "tests still pass" result later.

> **Verification Note**
> Specific mutation-testing tool names and their exact operator sets vary by language and ecosystem and change over time; confirm current tooling (and its supported languages) against that tool's own documentation before adopting it in a pipeline.

## Let's Walk Through an Example

Say the candidate unit is a legacy Python function with no tests, called from three places, that computes a shipping surcharge.

```python
# legacy/shipping.py — before
def surcharge(weight, zone, express, member):
    if zone == 1:
        s = weight * 0.5
    elif zone == 2:
        s = weight * 0.8
    else:
        s = weight * 1.2
    if express:
        s = s + 5
        if weight > 20:
            s = s + 10
    if member:
        s = s * 0.9
    if s < 2:
        s = 2
    return round(s, 2)
```

It works. It's also unreadable six months from now, and every new "and also handle case X" has been bolted on as another `if`. This is a good refactor candidate: small, few callers, pure function (no I/O, no shared state) — a genuinely low blast-radius unit.

**Step 1 — characterization tests first, refactor second.** Before the agent touches the function, generate a wide input matrix (each zone, express on/off, member on/off, boundary weights like `0`, `20`, `20.01`, negative weight) and record the current outputs, exactly as shown in the earlier example. This is non-negotiable — it's the only thing standing between "refactor" and "silent behavior change."

**Step 2 — the agent proposes the refactor**, constrained to the file and explicitly instructed to preserve every branch's behavior, including the ones that look like bugs (`weight < 0` is not rejected; the function doesn't validate `zone` is `1`, `2`, or anything else — it just falls into the `else` for `zone == 3`, `zone == 99`, or `zone == "gold"` alike):

```python
# legacy/shipping.py — after (agent-proposed)
ZONE_RATES = {1: 0.5, 2: 0.8}
DEFAULT_RATE = 1.2
EXPRESS_FLAT_FEE = 5
EXPRESS_HEAVY_FEE = 10
EXPRESS_HEAVY_THRESHOLD = 20
MEMBER_DISCOUNT = 0.9
MINIMUM_SURCHARGE = 2

def surcharge(weight, zone, express, member):
    rate = ZONE_RATES.get(zone, DEFAULT_RATE)
    total = weight * rate

    if express:
        total += EXPRESS_FLAT_FEE
        if weight > EXPRESS_HEAVY_THRESHOLD:
            total += EXPRESS_HEAVY_FEE

    if member:
        total *= MEMBER_DISCOUNT

    return round(max(total, MINIMUM_SURCHARGE), 2)
```

This is a real improvement: named constants instead of magic numbers, a dict lookup replacing a chain of `if/elif`, and the "minimum charge" logic expressed as `max()` instead of a conditional mutation. Structurally cleaner. Nothing about *what it computes* has changed.

**Step 3 — run the characterization suite, not just "the tests."** Every recorded case must still match, including `zone=3` falling through to `DEFAULT_RATE` via `.get()`'s fallback (equivalent to the old `else` branch) and negative weight still producing whatever the arithmetic produces rather than being rejected. If any case disagrees, the refactor is rejected and sent back — not "fixed forward" by updating the expected value, which would quietly turn a caught regression into an accepted one.

**Step 4 — only after the characterization suite is green does a human reviewer look at the diff**, and specifically looks for two things the tests can't fully catch on their own: did the agent introduce any input validation, rounding, or type coercion the tests didn't happen to exercise, and does the new structure make the *next* bug easier to introduce or harder (a dict lookup silently swallowing an unexpected key type is a common one to watch for here).

## Under the Hood: The Agent's Refactor Loop

Mapped onto the general agent loop from earlier articles, a legacy refactor task looks like this:

1. **Goal**: "Refactor `surcharge()` in `legacy/shipping.py` for readability. Do not change any input/output behavior, including behavior that looks unintended."
2. **Context**: the function's source, its existing (thin or absent) tests, the characterization test file generated in the scoping step, and the caller list from the blast-radius trace.
3. **Reasoning/Planning**: identify the transformation (magic numbers → constants, if/elif chain → lookup table) without altering branch semantics.
4. **Tool Selection & Execution**: edit the file; this is the only step that resembles ordinary code generation.
5. **Observation**: run the characterization suite (and any pre-existing tests) as a tool call, capture pass/fail per case, not just an aggregate.
6. **Updated State**: on any failure, the agent's next action must be "revert and reconsider the transformation" — not "adjust the test to match the new output." An agent with write access to the test files can "fix" a failing characterization test by editing the recorded expectation instead of the code, which silently defeats the entire safety net. This is worth calling out explicitly in the agent's instructions and, ideally, enforcing structurally (see Security Considerations below).
7. **Next Action**: on success, propose the diff for human review rather than committing directly — the loop's terminal state for this task class is "ready for review," not "merged."

## What Can Go Wrong?

- **Hyrum's Law regressions.** The agent "fixes" a quirk — an off-by-one, a swallowed exception, a rounding direction — that looks like an obvious bug and turns out to be exactly the behavior a downstream consumer depends on. Characterization tests catch this only if the weird case was included in the recorded corpus; this is why the input matrix needs to deliberately include edge cases and "wrong-looking" inputs, not just the happy path.
- **The safety net grading its own homework.** An agent that can edit both the implementation and the test file can make a failing refactor pass by changing the recorded expectation rather than the code. Every regression this enables looks, from the outside, like "tests are green." Mitigate this by keeping characterization/golden-master fixtures outside the agent's normal write scope, or requiring a separate review step specifically for any diff that touches both implementation and expected-output fixtures in the same change.
- **Scope creep past the verified blast radius.** The agent, mid-task, notices a "related" issue two callers away and fixes that too, outside the boundary the verification harness actually covers. Constrain the agent's file-edit permissions to the scoped unit for this task, and treat any expansion request as a new task requiring its own blast-radius trace and its own safety net — not an in-flight scope change.
- **False confidence from a shallow test corpus.** Green characterization tests only mean "the cases we thought to record didn't change." A thin corpus (all happy-path values, no boundary or error cases) gives a false sense of safety. This is exactly what mutation testing on the pre-refactor code is meant to surface before you trust the suite at all.
- **Silent behavior change in what the code *calls*, not just what it contains.** A refactor that replaces a hand-rolled retry loop with a library call, or a manual date-parsing routine with a standard library function, can change behavior at the edges — different timeout defaults, different locale handling, different exception types on malformed input — even when the surrounding logic is untouched. Treat any change in the *libraries or APIs* a function depends on as behavior-affecting by default, not merely structural, and verify it with the same rigor as a hand-written change.
- **Long-horizon context loss on multi-file refactors.** For a refactor that legitimately spans several files (splitting a class, introducing an interface), an agent operating over many tool calls can lose track of an earlier constraint stated at the start of the task — for instance, forgetting that one specific caller passes a value that the "cleaner" version no longer handles. This is the same context-management failure mode covered in **Why AI Agents Fail**, and it's a strong argument for keeping legacy refactor units small enough to fit inside one bounded task rather than one sprawling one.
- **Flaky pre-existing tests masking a real regression.** Legacy suites often include tests that were already intermittently failing before the agent touched anything — timing-dependent, order-dependent, or dependent on an external service. An agent (or a human under deadline pressure) that's used to seeing that flakiness will wave off a real regression as "oh, that test is just flaky." Quarantine known-flaky tests before starting the refactor, so a failure during the refactor is unambiguous signal.

## Security Considerations

Legacy code that nobody fully understands is disproportionately likely to be exactly the code that handles something sensitive: an old authentication check, a hand-rolled encryption routine, a hard-coded credential someone meant to move to a secrets manager years ago, an access-control branch that "looks redundant" but exists because of an incident five years back. Two things follow from that:

- **Treat security-sensitive files as a separate, higher-scrutiny class**, not just another refactor candidate. Anything touching authentication, authorization, cryptography, or secret handling should require mandatory human review of the diff regardless of test results, and ideally should be excluded from an agent's default write scope until a human has explicitly opted that specific file in. A characterization test proves output equivalence for the recorded inputs; it does not prove a rewritten authorization check still fails closed for an input nobody thought to record. For the deeper mechanics of scoping what an agent can read and touch, see **MCP Security: What Happens When an AI Agent Gets Access to Your APIs?** and **Building a Secure MCP Server** — the same least-privilege reasoning applies to file-system and repo access during a refactor, not just to external tool calls.
- **An agent refactoring legacy code often needs read access to a wide swath of the codebase to trace callers and dependencies** — which means the blast-radius-tracing step itself can expose the agent to files well outside its intended write scope, including ones with embedded secrets that predate a secrets-manager migration. Read access for tracing and write access for editing are not the same permission, and legacy repos are exactly where that distinction tends to have been ignored the longest.

## Common Misconceptions

**Misconception:** "If the tests pass after the agent's refactor, the refactor is safe."
**Reality:** Tests passing only proves the refactor didn't change what those specific tests check. On legacy code, that safety net is usually thin by definition — passing tests is necessary, not sufficient, and it says nothing about coverage quality unless you've measured that separately (mutation testing, deliberate edge-case inclusion).

**Misconception:** "A bigger context window means the agent can safely refactor a bigger chunk of legacy code at once."
**Reality:** Context window size determines how much code the agent can *read*, not how much of that code's behavior has been *verified*. A larger unit of change without a correspondingly larger verification harness is a bigger unverified diff, not a bigger safe one.

**Misconception:** "Refactoring legacy code is lower-risk than writing new code, because you're not adding new logic."
**Reality:** It's the opposite for exactly the reason this article exists: new code fails against a spec you can check it against; legacy refactors fail against a spec that doesn't exist anywhere except the current behavior, some of which is depended on by systems the agent (and often the team) can't see.

## Real-World Architecture

Large-scale legacy modernization efforts — inside individual companies and as documented patterns in vendor architecture guidance — tend to converge on a small set of staged-rollout patterns precisely because "refactor everything, then flip over" is too risky to verify in one step, agent-assisted or not:

- **Strangler fig pattern**: new (or newly refactored) functionality is routed to incrementally, behind a facade, while the legacy implementation keeps serving traffic for everything not yet migrated. This lets an agent-refactored unit go live for a slice of real traffic without betting the whole system on it at once.
- **Branch by abstraction**: introduce an abstraction layer in front of the component being refactored, implement the new version behind that abstraction, and switch callers over once verified — without a long-lived feature branch that has to be merged all at once.
- **Feature flags / dark launching**: run the refactored unit alongside the original in production, on real traffic, comparing outputs without the new version's result actually being used yet (a live extension of golden-master testing). Divergence gets caught before the new code is trusted with real decisions.
- **Canary rollout**: once a refactored unit is trusted enough to serve real traffic, route a small percentage first and watch error rates, latency, and business metrics before expanding.

None of these patterns are specific to AI-assisted refactoring — they predate coding agents by a long way — but they matter more, not less, once an agent is doing the mechanical work, because they provide exactly the staged, reversible verification that a characterization-test suite alone can't give you against real production traffic and real edge cases nobody thought to record.

## Expert Insight

In practice, the limiting factor on agent-driven legacy refactoring is rarely the agent's ability to produce a cleaner version of the code — it's usually good at that. The limiting factor is the cost and speed of the verification loop around it. A characterization or golden-master suite that takes twenty minutes to run turns each agent iteration into a twenty-minute round trip, which either slows the whole effort to a crawl or creates pressure to skip verification on "small" changes — exactly the changes most likely to hide a Hyrum's Law regression. Teams that get this right tend to invest upfront in making the safety net fast (parallelized test runs, a scoped subset that covers just the unit in flight) before turning an agent loose on volume, rather than treating verification speed as an afterthought to optimize later.

The other recurring lesson is organizational, not technical: agentic refactors succeed when there's a human who owns the decision of *what counts as an intentional behavior change* versus *what counts as a regression* — because the agent cannot make that call from the code alone, and treating every diff as equally low-risk because "the tests passed" is how a legitimate bug fix and an accidental regression end up shipped through the exact same review process.

## Try It Yourself

**Goal**: Practice scoping and safety-netting a refactor the way described in this article, on a small, low-stakes function.

**Starting Point**: Take any function in a personal or sandbox project that has grown a few too many conditional branches over time and currently has no tests (or thin ones).

**Task**:
1. Trace every caller of the function. Stop and write down the actual blast radius — don't estimate it.
2. Write a characterization test suite by running the function against at least 10 inputs, including boundary and "wrong-looking" values, and recording its actual current output for each — not what you think it *should* output.
3. Ask a coding agent to refactor the function for readability, explicitly instructing it to preserve every branch's behavior, including ones that look like bugs.
4. Run the characterization suite against the refactored version before looking at the diff yourself.
5. Only after it's green, review the diff and check specifically for any change in library calls, rounding, or type handling that the recorded cases might not have exercised.

**Expected Result**: Either a verified, behavior-preserving refactor with a diff you can defend line by line — or a caught regression that shows you exactly which recorded case exposed it.

**What You Learned**: The verification step, not the refactor step, is where the real engineering work is. The agent did the easy part.

## Pause and Think

If a legacy function has been silently returning `0` instead of raising an exception for a particular malformed input for the past four years, and a downstream job has come to depend on that `0` (say, it treats it as "no adjustment needed" and moves on), is fixing that behavior — making it raise properly — a refactor or a rewrite? And who should be the one to decide that, the agent or a human?

### Answer

It's a rewrite disguised as a bugfix, not a refactor — refactoring is defined as preserving observable behavior, and this deliberately changes it. That doesn't make it wrong to do; silently-wrong behavior often *should* be fixed. But it means the decision belongs to a human who can weigh the downstream impact (What does that job actually do with the `0`? Who owns it? What breaks if it stops seeing that value?), and it should ship as its own separately reviewed, separately tested change — never bundled invisibly inside a "cleanup" refactor where nobody thinks to look for a behavior change because the commit message says "refactor."

## Key Takeaways

- Legacy refactoring is a harder problem for an agent than new-code generation because the specification is the current behavior, not a document describing intended behavior — including behavior nobody intended.
- Scope every agentic refactor to a unit with a clear boundary and a traced, accepted blast radius before any code changes; bigger context does not mean a safer refactor.
- Build behavior-preservation proof — characterization tests, golden-master diffing, a coverage gate scoped to the unit in question — before the agent touches the code, and keep the recorded expectations out of the agent's normal write scope so it can't "fix" a failing test by editing the fixture.
- Hyrum's Law is the central risk: code that looks like a bug from the inside is often a promise to someone outside, and an agent has no visibility into who's depending on what.
- Use staged-rollout patterns (strangler fig, branch by abstraction, feature flags, canaries) to verify agent-refactored code against real traffic before it fully replaces the legacy path, and route any actual behavior change — however small, however clearly a "fix" — through separate, deliberate human review rather than letting it ride inside a refactor.

## What to Learn Next

The verification harness described here — characterization tests, golden masters, coverage gates — is really a specialized case of a broader question: how do you test AI-driven code changes with the same rigor you'd demand of a human's, and how far can an agent go in writing and maintaining those tests itself? That's the subject of **AI Agents for Automated Testing**.
