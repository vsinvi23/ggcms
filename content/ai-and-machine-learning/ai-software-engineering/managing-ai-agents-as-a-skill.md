---
title: "The New Software Engineering Skill: Managing AI Agents"
description: "Why managing an AI coding agent is a distinct engineering skill made of four sub-skills — scoping, context, verification, and intervention — not a rebrand of coding or people-management skill."
categorySlug: "ai-software-engineering"
articleType: "DEEP_DIVE"
tags:
  - "managing-ai-agents"
  - "ai-agents"
  - "task-scoping"
  - "context-engineering"
  - "verification"
  - "ai-native-engineering"
  - "delegation"
---

# The New Software Engineering Skill: Managing AI Agents

> By the end of this article you'll be able to name the four sub-skills that make up "managing an AI agent" — scoping, context, verification, and intervention — and explain precisely why none of them reduces to either writing code yourself or managing a person.

## The Problem

Here's a scene that's already ordinary in a lot of engineering orgs: a senior engineer opens a ticket, writes three paragraphs describing what needs to change, points an agent at the repository, and walks away to do something else. Twenty minutes later there's a pull request. It has tests. It passes CI. It even has a reasonable-sounding commit message.

Now the question that actually matters: was that a good use of the engineer's time, or did they just outsource the *appearance* of progress while quietly increasing the amount of unverified risk sitting in the codebase?

The honest answer is "it depends entirely on what the engineer did in the twenty minutes before and the five minutes after" — and that's the whole subject of this article. An agent's architecture — its tool-calling loop, its context window — is a separate topic from what's covered here. What isn't a property of the agent at all is the skill the *human* needs to get a good outcome out of that loop, repeatedly, across dozens of tasks a week, without either babysitting every step or rubber-stamping everything that comes back green.

That skill doesn't have a settled name yet, but it has a shape: knowing which tasks to hand to an agent in the first place, knowing what it needs to know to succeed, knowing how to check what it hands back without re-doing the work yourself, and knowing when to stop it before it wanders somewhere expensive. Call it agent management. It is quietly becoming as core to the job as knowing your language's standard library used to be — and it is genuinely a *new* skill, not a repackaging of two skills engineers already have.

## Why This Problem Is Difficult

The difficulty is that agent management sits in an uncomfortable middle ground between two skills every experienced engineer already has some version of, and it's tempting to just apply one of them wholesale. Both attempts fail, for specific, instructive reasons.

**The temptation to treat it like coding.** An engineer who's spent fifteen years writing code has a deeply trained instinct: if you want something done right, you look at exactly what was produced and reason about it the way you'd reason about your own code. Applied to agents, this produces the "read every line" reviewer — the person who treats an agent-authored 400-line diff exactly like a diff a junior engineer wrote, and reviews it with the same line-by-line scrutiny. This doesn't scale. An agent can produce that diff in the time it takes to review one function of it, and doing full line-by-line review on every agent output either becomes the engineer's entire job (defeating the point of delegating) or gets abandoned under time pressure into a skim-and-approve that provides none of the safety it pretends to.

**The temptation to treat it like managing a person.** The opposite instinct — informed by years of onboarding junior engineers — says: give it a reasonable task, trust it to ask clarifying questions if confused, check in periodically, and give feedback it will internalize for next time. This also fails, for reasons that are worth naming precisely because they're not obvious:

- A junior engineer who's confused *usually* says so, or produces something visibly half-finished. An agent that's confused frequently produces something fluent, complete-looking, and confidently wrong — it doesn't have the same signal of hesitation a human shows when they're out of their depth. This "hallucination spiral" is a documented failure shape: the agent doesn't pause to ask, it fills the gap with something plausible and keeps going.
- Feedback doesn't accumulate. Tell a junior engineer "we don't do it that way here" once and it usually sticks for the rest of their tenure. Tell an agent the same thing in one session and, depending on how memory is architected for that system, it may have zero persistence into the next task unless that correction is captured somewhere the agent will actually read again — a coding standard, a system prompt, a retrieved document.
- An agent has no career incentive, reputational stake, or fear of being wrong. A junior engineer's caution is partly trained by consequences they care about. An agent optimizes for whatever its training and immediate context reward, which is usually "produce something that looks like it satisfies the request" — not "flag genuine uncertainty," unless the system has been specifically built to reward that.

Both failure modes come from the same root cause: agent management borrows real structure from each skill but isn't reducible to either one, and treating it as a simple analogy to something already familiar produces confident, systematic mistakes rather than random ones.

## A Simple Mental Model

Think of the four sub-skills as stations an engineer moves through for every task they delegate to an agent, in order — and think of the two adjacent skills (coding, people management) as neighboring circles that overlap this one without containing it.

```text
                 +-------------------------+
                 |   TRADITIONAL CODING     |
                 |   SKILL                  |
                 |   (write it yourself,    |
                 |    reason about your     |
                 |    own logic directly)   |
                 +-----------+-------------+
                             | overlaps on:
                             | reading code, judging
                             | correctness & design
        +--------------------v--------------------+
        |        MANAGING AI AGENTS              |
        |                                         |
        |  1. SCOPE   -> is this task agent-shaped?|
        |  2. CONTEXT -> what must it know to try? |
        |  3. VERIFY  -> proportional to risk      |
        |  4. INTERVENE -> stop it before it drifts|
        +--------------------^--------------------+
                             | overlaps on:
                             | delegation, defining
                             | done, giving feedback
                 +-----------+-------------+
                 |   TRADITIONAL PEOPLE     |
                 |   MANAGEMENT SKILL       |
                 |   (delegate, trust,      |
                 |    develop, motivate)    |
                 +-------------------------+
```

The overlaps are real — you do need to be able to read code well to verify agent output, and you do need real delegation instincts to scope a task correctly — but the center circle has content that belongs to neither neighbor: a task-scoping judgment specific to what LLM-based agents are actually good and bad at, a context-assembly discipline that has no analogue in managing a person (you don't hand a colleague a curated context window), and an intervention timing built around failure signatures — infinite tool loops, confident hallucination, silent scope creep — that don't show up when managing humans at all.

The limit of this model: it implies four clean sequential stages, but in practice they loop. Verification often reveals that the scope was wrong, sending you back to station 1 for the next attempt. Treat it as a checklist of concerns to hold simultaneously, not a waterfall.

## The Core Idea

Managing an AI agent well means making four judgment calls that traditional software engineering never required anyone to make explicitly, because a human collaborator used to make them implicitly, for free, as part of just being a competent adult colleague:

1. **Scoping** — deciding whether this specific task, at this specific size and ambiguity level, is one an agent is likely to succeed at, versus one that needs to be broken down further or kept with a human.
2. **Context** — deciding exactly what the agent needs to know to attempt the task well, and getting that into its working context without drowning the signal in noise.
3. **Verification** — deciding how much and what kind of checking this particular output needs, calibrated to what happens if it's wrong, not applied uniformly to everything.
4. **Intervention** — noticing, while the agent is still working, that something has gone wrong enough to warrant stopping it rather than waiting for the final output.

None of these is optional, and skipping one doesn't make the task safer — it just moves the risk somewhere less visible. Skip scoping and you get an agent confidently attempting something it can't actually do. Skip context and you get plausible-looking output built on wrong assumptions. Skip verification and defects reach production wearing a green CI checkmark. Skip intervention and a five-minute problem becomes a five-hour cleanup, because nobody was watching for the moment it went off the rails.

## How It Actually Works

### 1. Scoping: Is This Task Agent-Shaped?

Not every task that *can* be described in a paragraph is one an agent can reliably execute. The skill is recognizing, before you delegate, which properties predict success and which predict failure.

Tasks that tend to go well share these properties:

- **A checkable definition of done.** "Add pagination to this endpoint, matching the pattern in `customers.py`, and pass these three new tests" is checkable. "Make the API nicer to use" is not — there's no way for the agent, or anyone, to know when it's finished, so it will stop when it feels finished, which is a different thing entirely.
- **A bounded blast radius.** Refactoring one well-tested module is bounded. Touching a piece of code with no tests, ambiguous ownership, and three downstream consumers no one has fully mapped is not — and an agent has no organizational instinct to be extra careful there the way a tenured engineer would.
- **Precedent somewhere in reachable context.** Agents are strong at pattern-matching to something similar that already exists in the codebase, the spec, or their training. A genuinely novel design decision — "should we adopt event sourcing for this domain" — is a judgment call, not a pattern-match, and handing it to an agent produces a confident-sounding answer that's really just the median opinion from its training data dressed as analysis.
- **Failure that's cheap to detect and reverse.** A task behind a feature flag, with a fast rollback path, tolerates a wrong agent attempt far better than a one-way database migration does.

Tasks that predict trouble share the inverse properties: fuzzy success criteria, wide or unknown blast radius, no precedent to match against, and expensive-to-reverse failure. The scoping skill isn't "never give an agent an ambiguous task" — it's recognizing ambiguity and either resolving it before delegating (turn "make it nicer" into concrete acceptance criteria) or keeping that specific decision with a human and delegating only the well-scoped parts around it.

> **Pause and Think**
>
> A task like "upgrade this dependency to the latest major version" sounds well-scoped — there's a clear target state. What makes it, in practice, one of the riskier tasks to hand an agent unsupervised?
>
> ### Answer
> The target state is clear, but the *path* usually isn't: a major version bump can silently change function signatures, default behaviors, or error-handling semantics in ways that pass a test suite written against the old behavior but break something the tests never exercised. The task looks bounded by its description but is actually unbounded in blast radius, because "latest major version" is really shorthand for "everything that library's changelog says changed, plus everything it didn't bother to mention." This is exactly the kind of task where the scoping skill means breaking it down — read the changelog first, list the breaking changes, then delegate the mechanical fix-ups — rather than delegating the whole upgrade as one unit.

### 2. Context: What Does It Actually Need to Know?

Handing an agent a task without the right context produces the same failure a competent new hire would have if dropped into a codebase with zero onboarding and told to "fix the bug" — except the agent won't ask around, it will just proceed on whatever assumptions its training and immediate prompt supply.

The skill here has two failure directions, and engineers new to it usually overcorrect toward one or the other:

- **Under-context.** The task description alone, with no pointer to the relevant files, the existing pattern to follow, the constraints that aren't visible in the code (a compliance rule, a performance budget, a deprecated approach the team already tried and rejected). The agent fills every gap with a plausible guess, and plausible guesses are exactly what produce confidently wrong output.
- **Over-context.** Dumping the entire repository, every related ticket, and three unrelated design docs into the prompt "just in case." This doesn't make the agent safer — most agent architectures show measurably degraded attention to specific details as irrelevant volume grows (a "context ceiling" problem), so excess context can actively bury the one constraint that mattered under noise the agent has to attend past.

The practical version of the skill is closer to writing a good, tight onboarding note than either extreme: point directly at the reference implementation to match, state the non-negotiable constraints explicitly rather than assuming they're implied by "good practice," name what's explicitly out of scope, and trust the agent's own tool-calling loop (reading files, running tests) to fill in the rest rather than trying to pre-digest the whole codebase into the prompt yourself.

| Context ingredient | Why it matters | What happens if it's missing |
|---|---|---|
| The pattern to match | Agents pattern-match reliably; a pointer to precedent narrows the solution space fast | Agent invents its own approach, possibly inconsistent with the rest of the codebase |
| Explicit non-goals | Agents have no instinct for "don't touch the public API" the way a tenured engineer does | Scope creep into files or interfaces nobody asked to change |
| The actual acceptance test | Turns "done" into something checkable instead of a vibe | Agent declares success on its own judgment, which may not match yours |
| Known dead ends | Saves the agent from confidently re-proposing something already tried and rejected | Wasted cycles, or worse, a quietly reverted approach reintroduced |

### 3. Verification: Proportional, Not Uniform

The single biggest calibration error engineers make when they start delegating to agents is applying one verification strategy to everything — either always doing a full manual line-by-line read (which doesn't scale and produces reviewer fatigue that degrades the review's actual quality), or always trusting a green CI run (which only catches what the test suite happens to check).

The skill is matching verification effort to the specific task's blast radius and the specific gaps in what your automated checks actually cover:

- **Low-stakes, well-covered by tests** (a small, reversible refactor in a module with strong test coverage): a quick diff skim plus a green test run is proportional. Spending twenty minutes reading every line here is a poor use of the time you were trying to save.
- **Medium-stakes, partially covered** (a new feature with tests the agent wrote itself): read the tests as carefully as the implementation, maybe more carefully — a test suite is only as trustworthy as its own design, and an agent grading its own homework by writing weak tests that happen to pass is a real failure mode, not a hypothetical one.
- **High-stakes, hard to test** (anything touching auth, payments, data migrations, or anything with a large or unclear blast radius): this is where the line-by-line instinct from traditional coding skill is actually the right tool, plus a security-focused pass specifically because agents reproduce insecure patterns fluently when nothing in their context tells them not to (see Security Considerations below).

A genuinely useful habit: before delegating, decide out loud (or in the ticket) what level of scrutiny this specific task will get *and why*, rather than deciding reactively once the PR shows up looking clean. A clean-looking diff is not evidence of low risk — it's evidence the agent is fluent, which was never in question.

### 4. Intervention: Knowing When to Stop It Mid-Task

The first three sub-skills are mostly exercised before and after an agent runs. Intervention is exercised *during* — and it's the sub-skill with the least analogue in either neighboring discipline, because neither writing your own code nor managing a person involves watching a live execution trace for specific failure signatures in real time.

Concrete signals worth stopping for, rather than waiting to see what the final output looks like:

- **Repeated identical tool calls** — the agent calling the same tool with the same arguments multiple times in a row, an infinite-tool-loop pattern. This rarely self-resolves; letting it keep running mostly burns tokens and time.
- **Scope visibly expanding** — the agent starts touching files well outside what the task described, often while narrating a plausible-sounding justification for why. This is the moment to stop and re-scope, not the moment to let it "finish the thought."
- **Confident claims that don't match observable state** — the agent asserts a test passed, a file was created, or an API behaves a certain way, and that claim is checkable and wrong. This is a strong signal the agent's internal state has drifted from reality (context loss, a stale tool result it didn't re-verify), and continuing to trust its subsequent reasoning compounds the error.
- **A task that keeps needing "just one more attempt"** — three or more failed self-corrected attempts at the same sub-problem usually means the task was under-scoped or under-contexted, not that the fourth attempt will suddenly succeed.

Intervention is uncomfortable for engineers used to either letting code run to completion or letting a colleague finish their thought without interruption — both instincts say "wait and see." With an agent, waiting and seeing is frequently the more expensive choice, because the failure modes above don't self-correct the way a human's momentary confusion usually does.

## Let's Walk Through an Example

A concrete task: "The `/v1/invoices` export endpoint times out for accounts with more than ~50,000 invoices. Fix it."

**Scoping:** This is a reasonable candidate — the failure is reproducible and the fix likely follows an existing pattern (pagination or streaming, probably already used elsewhere in the codebase for similar exports). It's not a task to keep entirely with a human, but it's not "delegate blindly" either, because "fix it" alone has no checkable definition of done yet.

**Context:** Before delegating, the engineer tightens the task: points at the `/v1/customers/export` endpoint, which already streams results instead of loading them all into memory, as the pattern to match; states the non-goal explicitly ("don't change the response schema, downstream consumers depend on the current shape"); and attaches the specific reproduction case (an account with 60,000 invoices) as the acceptance test the fix has to pass.

**Verification, calibrated:** This touches a customer-facing export endpoint with real but moderate blast radius — not "auth system" stakes, but not "internal refactor" stakes either. The engineer plans a proportional check: read the streaming implementation itself closely (this is where a subtle bug — like buffering everything anyway despite calling it "streaming" — would hide), skim the rest, and specifically verify the reproduction case actually exercises 60,000+ records rather than trusting a smaller test fixture that wouldn't have caught the original bug.

**Intervention, if needed:** While the agent works, it reports running the reproduction test and getting a timeout on its first three attempts, each time adjusting batch size. On the fourth attempt it claims success without re-running the full 60,000-record case — it ran a smaller sample instead and generalized. That's a stop-and-check moment: the claim ("this fixes the timeout") doesn't match what was actually verified. The engineer asks it to re-run against the original reproduction case before going further, rather than accepting the claim at face value.

Nothing about this example required a better model. What made it go well was scoping the task tightly enough to have a real definition of done, giving it the one piece of context (the existing streaming pattern) that mattered most, calibrating scrutiny to where the actual risk was, and catching one specific overclaim before it became a merged "fix" that still times out at scale.

## Common Misconceptions

**Misconception:** Managing AI agents well is basically the same skill as managing junior engineers, just applied to a different kind of "employee."
**Reality:** The overlap is real but partial. The differences that matter — no persistent learning from feedback across sessions unless captured somewhere the agent will read again, no self-reported confusion when out of its depth, no reputational stake in being right — mean techniques that work on people (trust and check in periodically, give verbal feedback and expect it to stick) actively mislead when applied unmodified to agents.

**Misconception:** If you're already a strong senior engineer, you're already good at managing agents.
**Reality:** Strong coding skill makes verification easier but doesn't teach scoping, context assembly, or mid-task intervention — those are exercised in a completely different rhythm (deciding what to delegate and when to interrupt) than writing or reviewing code yourself. Plenty of excellent individual-contributor engineers are, at first, bad at this specific skill, precisely because their instinct is to just do the work themselves rather than to structure it for delegation.

**Misconception:** More verification is always safer.
**Reality:** Uniform, maximal verification on every task is a real cost — it consumes exactly the time delegation was supposed to save, and it produces reviewer fatigue that degrades scrutiny on the tasks that actually need it. Calibrated verification, spending real attention where blast radius is high and light attention where it's low, catches more real defects than uniform effort spread thin.

**Misconception:** This skill is really just "prompt engineering" under a new name.
**Reality:** Prompt engineering is a piece of the context sub-skill — how you phrase and structure what you give the agent. It says nothing about scoping (which tasks to even attempt), verification strategy (what to check and how much), or intervention (when to stop a task already in flight). Reducing agent management to prompting is like reducing engineering management to "writing clear tickets" — true as far as it goes, and missing most of the job.

## What Can Go Wrong?

- **Scope creep treated as thoroughness.** An agent that expands a task's boundaries and produces more changes than asked for can look like it's being helpful and diligent. Left unchecked, this is how a "fix this one timeout" task quietly becomes a partial, unreviewed refactor of adjacent code nobody asked to touch.
- **Verification fatigue.** An engineer who starts out doing careful, calibrated review on every agent PR gradually drifts toward rubber-stamping as volume increases, especially once a long streak of PRs has looked fine. This is a people problem, not a tooling problem, and it's the single most common way "we review everything" quietly becomes "we review nothing that matters."
- **Escalation blindness.** Not noticing the specific signals (repeated identical tool calls, claims that don't match observable state) that call for intervention, because the engineer is doing something else while the agent runs and only looks at the final diff. The cost of a five-minute problem compounds the longer it runs unnoticed.
- **Over-scoping tasks to avoid the scoping work.** Handing an agent one enormous, vaguely-defined task ("modernize this module") because breaking it into well-scoped pieces takes real upfront thought, then being surprised the output doesn't match what was actually needed. The scoping effort doesn't disappear when skipped — it reappears later as rework.
- **Under-trusting agents on tasks they're actually good at.** The mirror-image failure: an engineer burned once by a bad agent output starts doing full manual review on everything, including small, well-tested, low-stakes changes — which erases the productivity benefit that made delegation worth doing in the first place.

## Security Considerations

Agent management has direct security stakes, because the four sub-skills are exactly where security either gets baked in or quietly skipped.

- **Scoping is a security control.** A task scoped tightly to "modify this endpoint's pagination" that an agent is given repository-wide file access to complete has a much larger attack surface — for prompt injection, for accidental credential exposure, for touching security-relevant code it wasn't asked to touch — than the same task scoped with least-privilege tool access limited to the relevant files. Scoping the task and scoping the agent's actual permissions should happen together, not as separate afterthoughts.
- **Context can be an injection vector.** If the context assembled for a task includes untrusted input — a customer-filed ticket description, a scraped external document, comments already in the codebase — that content is part of the agent's working context and can carry adversarial instructions (indirect prompt injection). The context-assembly skill includes deciding what's trusted enough to hand to the agent verbatim versus what needs to be sanitized or summarized first.
- **Verification has to include a security pass specifically, not just a correctness pass.** An agent optimizing for "make the tests pass" has no independent instinct to avoid, say, string-concatenated SQL or an overly permissive CORS header, if nothing in its context or training signals that this specific codebase forbids it. Functional tests passing is not evidence a change is secure; the verification sub-skill needs a distinct check for that, proportional to the task's exposure.
- **Intervention includes noticing credential or secret exposure early.** An agent that starts reading environment files, printing configuration values into its reasoning trace, or attempting to call an API it wasn't given credentials for is exhibiting exactly the kind of mid-task signal that warrants an immediate stop, not a wait-and-see.

## Real-World Architecture

The shape of this skill mirrors a pattern the industry has already validated in a narrower context: the shift from "review every commit yourself" to "trust a pipeline, review its gaps" that continuous integration already forced on teams decades before coding agents existed. CI didn't remove human judgment from software delivery — it moved that judgment to deciding what the pipeline checks, and to reviewing what the pipeline structurally can't check. Managing AI agents generalizes the same move to a bigger slice of the job: judgment moves from "did I write this line correctly" to "did I scope this task, context it, and check it well enough that a wrong output would actually get caught."

> **Verification Note**
> Whether "AI agent manager," "agent orchestrator," or a similar title becomes a formally recognized job role — as opposed to a skill folded into existing senior/staff engineering responsibilities — is an organizational and labor-market question this article does not attempt to answer. Treat any specific claim about job-title prevalence or a named company's team structure as something to verify against that organization's own published material, not as established fact.

## Expert Insight

The engineers who get the most leverage out of agents aren't the ones who trust them the most or the ones who trust them the least — they're the ones who've built an accurate, task-specific model of where a given agent, on a given codebase, with a given amount of context, is reliable versus where it confidently guesses. That model isn't static; it's built the same way any calibration is built, by paying close attention to outcomes over many tasks and updating rather than applying a fixed policy ("always trust it" or "always double-check everything") regardless of what's actually happened.

A useful tell for whether someone has genuinely developed this skill versus is just going through the motions: ask them to describe, for a task they're about to delegate, what specifically would make them intervene before it finishes — not generically, but for *that* task. If the honest answer is "I'll just look at the diff at the end," they're skipping the intervention sub-skill entirely and hoping the other three cover for it. If the answer names a specific signal ("if it starts touching the auth middleware, I want to know immediately"), that's someone who has actually scoped the task's risk and built a real intervention plan around it — not just a hope that things will turn out fine.

## Try It Yourself

**Goal:** Practice the scoping and context sub-skills on a real task before you delegate it, instead of writing the prompt and seeing what happens.

**Starting Point:** Pick a real, upcoming task from your backlog that you were planning to hand to an agent — or one you already handed to an agent and weren't fully happy with the result.

**Task:**
1. Write down the task's checkable definition of done as a list of assertions, not a sentence of prose. If you can't do this without ambiguity remaining, the task isn't scoped yet — narrow it before going further.
2. List the blast radius: what files, systems, or users could plausibly be affected if the agent's attempt is wrong in a way your test suite doesn't catch.
3. Based on that blast radius, decide *in advance* what verification this task gets — a skim, a focused read of specific parts, or a full line-by-line pass — and write down why.
4. Name one concrete signal that, if you saw it mid-task, would make you stop the agent immediately rather than wait for the final output.

**Expected Result:** A short, concrete plan — definition of done, blast radius, verification level, and an intervention trigger — that took a few minutes to write and that you can compare against what you'd have done by default (write a vague prompt, wait, skim the diff).

**What You Learned:** If step 1 was hard, the task wasn't ready to delegate — that difficulty is diagnostic, not a formality to get through. If step 4 felt artificial or you couldn't come up with a real answer, that's worth noticing too: it usually means you're planning to review only the final output, which is exactly the gap where the failures in this article's "What Can Go Wrong" section live.

## Pause and Think

If an organization eventually builds verification tooling good enough to catch every functional and security defect an agent might introduce automatically, does the skill of "managing AI agents" described here become unnecessary — collapsing back into either pure coding skill (since verification is automated) or pure task delegation (since it's "just management" at that point)?

### Answer

Even a perfect verification gate only answers "does this output satisfy the contract I gave it" — it can't answer "was this the right task to give it in the first place," "did I give it enough of the right context to attempt this well," or "should I have stopped it three tool calls ago instead of letting it run to completion and then checking the result." Scoping, context assembly, and intervention timing are upstream and during-the-fact judgment calls that a downstream verification gate, however good, structurally cannot make for you — the gate only ever gets to grade what already happened. Better automated verification shrinks how much manual checking a given task needs, which is genuinely valuable, but it doesn't shrink the need for the other three sub-skills; if anything, as verification gets more automated and delegation happens at higher volume, scoping tasks well and catching problems early — before they reach the gate at all — becomes the more valuable half of the skill, not the less valuable half.

## Key Takeaways

- Managing AI agents is a distinct engineering skill made of four sub-skills — scoping, context, verification, and intervention — not a rebrand of coding skill or people-management skill, though it overlaps meaningfully with both.
- Scoping means recognizing which tasks have a checkable definition of done, a bounded blast radius, available precedent, and cheap-to-reverse failure — and breaking down or holding back the tasks that don't.
- Context assembly has two failure directions: too little (the agent fills gaps with plausible guesses) and too much (relevant signal gets buried in noise); the skill is a tight, targeted onboarding note, not either extreme.
- Verification should be proportional to blast radius and to specific gaps in automated checks, not applied uniformly — uniform maximal review doesn't scale, and uniform minimal review misses exactly the tasks where it matters most.
- Intervention is exercised live, during execution, on concrete signals (repeated identical tool calls, expanding scope, claims that don't match observable state) — waiting for the final output to judge it is usually the more expensive choice.
- Both easy analogies fail for specific, nameable reasons: agents don't self-report confusion or retain feedback the way people do, and they don't scale to review-by-reading the way traditional code review does.
