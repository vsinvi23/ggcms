---
title: "How to Build a Reliable AI-Assisted Development Workflow"
description: "A five-stage, team-level workflow — task scoping, context provisioning, agent execution, automated verification gates, human review checkpoints — for routing AI-agent-authored changes safely to production."
categorySlug: "ai-software-engineering"
articleType: "DEEP_DIVE"
tags:
  - "ai-assisted-development"
  - "developer-workflow"
  - "ci-cd"
  - "verification-gates"
  - "code-review"
  - "ai-coding-agents"
  - "context-engineering"
---

# How to Build a Reliable AI-Assisted Development Workflow

> By the end of this article you'll be able to design a concrete, end-to-end AI-assisted development workflow — task scoping, context provisioning, agent execution, automated verification gates, human review checkpoints — and name the specific ways such a workflow fails in practice, so you can build against those failures instead of discovering them in production.

## The Problem

Most teams that adopt AI coding agents go through the same three phases, in the same order, and the third phase is where the trouble starts.

Phase one: an engineer pastes something into a chat window, gets a suggestion, and manually decides whether to use it. This is slow but safe — a human reads every token before it touches the codebase.

Phase two: someone wires an agent into the editor or the CI pipeline so it can open a branch, write code, and raise a pull request on its own. Velocity jumps. The backlog starts moving faster than anyone expected. For a few weeks this looks like a clear win.

Phase three is where it usually goes wrong, and it goes wrong quietly. Volume keeps climbing — five agent-authored PRs a day becomes twenty — while the *process* around those PRs stays exactly what it was in phase one: an engineer reading a diff and clicking approve. Nobody made a decision to lower the bar. The bar simply didn't move while the number of things trying to clear it went up tenfold. A few months later, someone traces a production incident back to a merged PR that had a green CI run, a plausible commit message, and a reviewer who — reasonably, given the volume — gave it thirty seconds of attention instead of ten minutes.

This isn't a story about a bad model or a careless engineer. It's a story about the absence of a *workflow* — a designed, repeatable system with explicit gates, not an accumulation of individually reasonable habits that never got assembled into something that scales. Managing an agent well as an individual skill — scoping, context, verification, intervention — is a separate, prerequisite concern. This article is about the next level up: turning that individual skill into a team-level process with defined stages, defined gates, and defined failure points, the way continuous integration turned "write tests" from an individual habit into an enforced organizational property decades ago.

## Why This Problem Is Difficult

A reliable workflow is hard to build for reasons that have nothing to do with model capability, and everything to do with where the failure modes actually live.

**The failure surface is distributed, not concentrated.** A workflow can fail at the scoping stage (the task was never well-defined), the context stage (the agent didn't have what it needed), the execution stage (the agent drifted off track), the verification stage (the checks that ran didn't check the thing that mattered), or the review stage (a tired human rubber-stamped it). A workflow that hardens four of these five stages and leaves one weak doesn't get four-fifths of the reliability — it gets whatever reliability the weakest stage provides, because a single gap is enough for a defect to reach production.

**Green signals and real correctness have decoupled.** In a traditional pipeline, a passing test suite and clean static analysis are strong evidence the code is fine, because a human wrote the code with some understanding of what "fine" means and wrote (or at least read) the tests with the same understanding. When an agent writes the code *and* the tests in the same pass, from the same possibly-wrong understanding of the requirement, a green pipeline stops being independent evidence — it can just mean the agent successfully satisfied its own misunderstanding. A workflow has to treat "all checks passed" as necessary, not sufficient.

**Volume breaks review economics that used to work.** A human reviewer reading one PR a day can afford real scrutiny. A human reviewer facing fifteen agent-authored PRs a day, each individually clean-looking, cannot sustain the same scrutiny per PR without either burning out or quietly degrading into a skim. This isn't a discipline problem an individual can solve by trying harder — it's an arithmetic problem the workflow has to solve structurally, by routing volume away from unstructured human attention and toward things that don't get tired: automated gates, risk-based routing, and sampling.

**The workflow has to survive being followed loosely, not just followed perfectly.** A process that only works if every engineer executes every step with full attention every time is not a reliable process — it's a policy document. The workflow has to fail *safely* when a step gets skipped or rushed, which means the gates need to be structural (a merge that's blocked by a failing check) rather than purely cultural (a step someone is supposed to remember to do).

## A Simple Mental Model

Think of the workflow as an assembly line with quality inspectors at fixed stations, not as a single inspector who eyeballs the finished product at the end.

```text
  TASK           CONTEXT          AGENT            VERIFICATION        HUMAN
  SCOPING   -->  PROVISIONING --> EXECUTION   -->  GATES         -->   REVIEW    --> MERGE
  +------+       +------+         +------+         +------+            +------+
  |station|  ->  |station|   ->   |station|   ->   |station|    ->     |station|
  |  1   |       |   2   |        |   3   |        |   4   |           |   5   |
  +------+       +------+         +------+         +------+            +------+
   reject           reject          stop/            reject              reject
   here if          here if         intervene         here if             here if
   ill-defined      missing         here if           checks              intent
                    constraints     drifting          fail                mismatch
```

Each station has one job and a clear reject condition. A defect caught at station 1 (a vague task) costs a rewritten ticket. The same underlying defect, caught at station 5 after full execution and a full verification run, costs the entire pipeline's worth of wasted compute and reviewer time — and if it's *not* caught at station 5, it costs whatever the production incident costs. The mental model's core lesson: **cost of a defect grows with how far downstream it travels before getting caught**, so a well-designed workflow pushes as much rejection as possible to the earliest station that can actually detect it.

The limit of this model: an assembly line implies a strictly linear, one-directional flow, but real workflows loop — a verification-gate failure often sends the task back to station 3 (re-execution) or even station 1 (the scope was wrong), not forward to station 5. Treat the stations as checkpoints a task passes through, possibly more than once, not a straight conveyor belt.

## The Core Idea

A reliable AI-assisted development workflow is not "an agent, plus a CI pipeline, plus code review." It's five deliberately designed stages, each with an explicit acceptance criterion and an explicit reject path, wired together so that a defect gets caught at the cheapest possible station:

1. **Task scoping** — before any agent runs, decide whether this task is well-defined enough to attempt, and if not, fix that first.
2. **Context provisioning** — assemble exactly the context the agent needs, from trusted sources, scoped to what's relevant.
3. **Agent execution** — run the agent in a sandboxed, observable environment with the ability to stop it mid-task.
4. **Automated verification gates** — a graduated stack of checks proportional to the task's actual blast radius, that must pass before a human ever sees the diff.
5. **Human review checkpoints** — reviewer attention allocated by risk, not by diff size or arrival order, with the review protocol built for agent-specific failure modes.

The stages aren't independent options to pick and choose from — each one exists specifically to catch what the stage before it structurally cannot catch. Skipping one doesn't remove risk, it just relocates the risk to whichever stage is left holding it, usually the last one: human review, which is exactly the stage volume makes least reliable.

## How It Actually Works

### Stage 1 — Task Scoping

The individual judgment involved is already familiar: a checkable definition of done, a bounded blast radius, available precedent, and cheap-to-reverse failure. At the workflow level, this judgment needs a gate, not just a habit — a lightweight scoping checklist attached to the ticket or issue template itself, so a task can't enter the pipeline without it being answered.

A practical scoping gate asks, in the ticket itself, before an agent is ever invoked:

- What observable condition defines "done"? (Not a sentence of prose — an assertion, a test, a metric threshold.)
- What files, services, or systems are in scope, and what's explicitly out of scope?
- Does precedent exist in this codebase or an adjacent one that the agent can pattern-match against?
- If the agent's first attempt is wrong, how expensive is detecting that and rolling it back?

A task that can't answer these — "make the checkout flow better," with no acceptance criteria and no bounded scope — gets rejected at this station and sent back for refinement, exactly the way a well-run team already rejects an under-specified ticket before a human starts working it. The only change is that the bar for "well-specified enough" gets stricter, because a human working an ambiguous ticket will ask a clarifying question in Slack; an agent working the same ticket will silently pick an interpretation and run with it.

### Stage 2 — Context Provisioning

This is where the workflow decides, systematically, what the agent gets to see — and this is also the stage with the sharpest security implication, covered below. A repeatable context-provisioning step for a given task class typically assembles:

- The specific files or modules the task touches, retrieved deliberately rather than dumped as "the whole repo."
- The existing pattern to match, pointed to explicitly rather than left for the agent to discover.
- Non-negotiable constraints that live outside the code — compliance rules, performance budgets, an approach the team already tried and rejected — captured somewhere durable (a coding-standards document, a system prompt, a retrieved policy file) rather than re-explained from scratch every time.
- The acceptance test from Stage 1, so "done" is something the agent can check against itself before declaring success.

A workflow-level improvement over ad hoc context assembly is standardizing this into a template per task class — "bug fix," "new endpoint," "dependency bump" — so the context an agent receives doesn't depend on which engineer happened to write today's prompt. Teams that get this right treat their context template the way they'd treat a CI config: version-controlled, reviewed when it changes, and consistent across the team.

### Stage 3 — Agent Execution

Execution happens in an environment built for two properties: containment and observability.

**Containment** means the agent runs in a sandbox — an ephemeral container or isolated workspace — with access scoped to what the task actually needs: the relevant repository, a scratch branch, and only the tool permissions required (a database credential for a task that reads schema, not one that also has write access to production data, regardless of whether the task needs it). This is the execution-time expression of least privilege, and it matters independently of how good the model is, because containment is what limits the damage from *any* failure mode — a bad prompt, a hallucinated destructive command, or a genuine prompt-injection attack riding in through a retrieved document.

**Observability** means the workflow can see what the agent is doing while it's doing it, not just the final diff. Instrumenting the agent's reasoning loop with structured traces is a prerequisite here; at the workflow level, the practical requirement is that someone (or some automated watchdog) can detect, in real time, the intervention signals from the individual-skill layer — repeated identical tool calls, scope visibly expanding beyond the task's stated files, a claim of success that doesn't match an observable check. A workflow without execution-time observability only ever finds out about a runaway agent after it has already finished running away.

```text
+---------------------------+     +------------------------+
| Scoped task + provisioned | --> | Sandboxed agent        |
| context                   |     | execution               |
+---------------------------+     +-----------+------------+
                                               |
                                               v
                                   +------------------------+
                                   | Live signal check       |
                                   +-----+--------------+---+
                                         |              |
                          Runaway loop, scope creep, |   | Progressing normally
                          unverified claim           |   |
                                         v            v
                          +----------------+   +------------------------+
                          | Stop / re-scope|   | Agent declares         |
                          | (back to Stage |   | completion             |
                          | 1 context)     |   +-----------+------------+
                          +----------------+               |
                                                            v
                                              +------------------------+
                                              | Diff + tests + trace   |
                                              | -> verification gates  |
                                              +------------------------+
```

### Stage 4 — Automated Verification Gates

This is the stage that has to do the most work, because it's the only one positioned to catch defects before they consume a human reviewer's time — and it's the stage most teams under-invest in relative to how much they lean on it.

A graduated gate stack, run in order so cheap checks fail fast before expensive ones run:

| Gate | What it checks | Catches |
|---|---|---|
| Static analysis / linting | Syntax, style, known anti-patterns | Superficial errors, obvious anti-patterns |
| Type checking / build | Does it compile / type-check at all | Hallucinated APIs and signature mismatches |
| Unit and integration tests | Behavior against known cases | Regressions against existing behavior — but only as good as the tests, see the caveat below |
| Dependency and secret scanning | New packages, exposed credentials, known-vulnerable versions | Supply-chain and credential-exposure risk introduced incidentally |
| Security-focused static analysis (SAST) | Injection patterns, auth bypass shapes, unsafe deserialization | Security regressions that functional tests don't exercise |
| Blast-radius / diff-scope check | Does the changed file list match the task's declared scope from Stage 1 | Unrequested scope creep — a task scoped to one file touching five |
| Property or fuzz checks (where applicable) | Invariants across a wider input space than example-based tests cover | Edge cases the agent's own example-based tests didn't think to include |

The caveat that matters most here: **a test suite the agent wrote in the same session it wrote the implementation is not independent evidence.** If nothing in the gate stack was written or reviewed independently of the agent's own pass, a self-consistent-but-wrong implementation and its self-consistent-but-wrong tests can sail through every automated gate together. Two workflow-level mitigations address this directly: requiring acceptance tests to originate from Stage 1 (written against the requirement, before the agent runs, ideally by a human or a separate agent that never sees the implementation) rather than solely from the agent's own output; and running an independent LLM-as-a-judge pass that evaluates the diff against the original requirement text rather than against the agent's own tests.

A gate stack that passes everything above is a strong signal a change is *safe to route to a human reviewer* — it is deliberately not treated as a signal the change is *correct*. That distinction is what keeps Stage 5 necessary instead of ceremonial.

### Stage 5 — Human Review Checkpoints

By the time a diff reaches a human, the workflow has already done everything a human is bad at doing repeatedly and well at scale (running the same checks a thousand times without fatigue) and has deliberately preserved for the human everything a human is good at that automation structurally isn't: judging whether the change matches *intent*, not just passing tests; recognizing an architecturally poor decision that's individually correct; and catching failure modes that require actual domain understanding — a plausible-but-wrong pattern, an over-confident comment asserting a property the code doesn't guarantee.

The workflow-level change from ad hoc review is **risk-based routing of reviewer attention**, instead of first-in-first-out review of everything at equal depth:

- Low-blast-radius, well-covered-by-tests changes get a lighter, faster human pass — the automated gates already carried most of the weight.
- Medium-blast-radius changes get a full read, with particular attention to the tests (agent-written tests need scrutiny as a first-class review target, not a checkbox).
- High-blast-radius changes — anything touching authentication, payments, data migrations, or a system with unclear ownership — get the full line-by-line pass plus a dedicated security-focused reviewer, regardless of how clean the diff looks, because a clean-looking diff is evidence of fluency, not evidence of low risk.

A workflow that routes review attention this way, backed by the blast-radius classification captured back in Stage 1, gets more real defect-catching out of the same total reviewer-hours than a workflow that spreads uniform, shallow attention across everything in arrival order.

## Let's Walk Through an Example

A team adopts this workflow for a recurring task class: adding a new field to an internal API response and propagating it through the data layer.

**Scoping (Stage 1):** The ticket template forces the requester to name the exact endpoint, the exact field, its type and validation rules, and an acceptance test: "GET /v1/accounts/{id} returns the new `risk_tier` field, populated from the `accounts.risk_tier` column, for at least one seeded test account." Blast radius is declared as "this endpoint and its serializer only — do not touch the request path or other endpoints."

**Context (Stage 2):** The provisioning step retrieves the serializer file, the existing similar field (`account_status`) as the pattern to match, the acceptance test from Stage 1, and an explicit non-goal: "do not modify the database migration tooling; assume the column already exists."

**Execution (Stage 3):** The agent runs in a sandbox with read/write access limited to the API service repository — no database credentials, no access to the deployment pipeline. Midway through, it opens a file in the request-validation module that wasn't part of the declared scope. The observability layer flags this as a scope-expansion signal; the run is paused, and a check confirms the agent was trying to add validation for the new field there rather than in the serializer. The task is not what's wrong — validating the field is reasonable — but it's outside the declared blast radius, so the run is stopped and the scope is explicitly widened by one file rather than letting the agent expand it unilaterally.

**Verification gates (Stage 4):** Static analysis and type checking pass. The acceptance test from Stage 1 passes. The blast-radius check confirms the final diff touches exactly the two files now in scope (the serializer and, per the widened scope, the validator) and nothing else. SAST finds nothing. A property check on the serializer confirms the new field is omitted gracefully (not a crash) for accounts where the underlying column is null — something the single example-based acceptance test didn't cover but the gate stack's broader check did.

**Review (Stage 5):** Blast radius is classified low-to-medium — a new read-only field on an existing endpoint, well covered by both the declared acceptance test and the gate stack's null-handling check. The reviewer gives it a real but fast pass: confirms the field name and type match the ticket exactly, confirms the widened scope was legitimate and not further expanded, and approves.

Nothing about this example depended on a smarter model. What made it reliable was that each stage had an explicit acceptance criterion, the scope-expansion signal was caught live instead of discovered in the final diff, and reviewer attention was calibrated to a blast radius that had been declared up front — not discovered by the reviewer from scratch.

## Common Misconceptions

**Misconception:** A strong CI/CD pipeline with good test coverage is already a reliable AI-assisted workflow.
**Reality:** CI/CD is Stage 4 alone. Without scoping (a task can enter the pipeline underspecified), context provisioning (the agent can be set up to fail before it starts), execution-time observability (a runaway agent isn't caught until the final diff), and risk-based review routing, a strong test suite catches regressions against what it already checks — and says nothing about a self-serving test, a plausible hallucination that happens to compile, or a change that quietly widened scope past what CI's diff-agnostic checks would ever notice.

**Misconception:** More automated gates always means more reliability.
**Reality:** A gate stack that's uniformly heavy on every task slows down low-risk work without meaningfully improving safety on it, and — just as importantly — a long, slow gate sequence creates pressure to bypass it "just this once" for an urgent task, which is exactly when the discipline matters most. Gates should be graduated to blast radius the same way review attention is; a one-size-fits-all stack that takes twenty minutes for a one-line low-risk change trains people to route around it.

**Misconception:** The goal of this workflow is to remove humans from the loop as much as possible.
**Reality:** The goal is to remove humans from the parts of the loop that don't need human judgment — repetitive, mechanically checkable verification — so the human attention that remains is concentrated on the parts that structurally require it: judging intent, architectural fit, and genuinely novel risk. A workflow that succeeds at this usually has humans reviewing *fewer total diffs at full depth* than before, not zero.

**Misconception:** This workflow only matters once you're running agents at high volume.
**Reality:** The stages matter even at low volume, because the failure modes (vague scope, missing context, unverified claims, review fatigue) aren't caused by volume — volume just makes them visible faster and more often. A team running one agent-authored PR a week that skips Stage 1 scoping will eventually ship a defect from an underspecified task; it just takes longer to happen than it would at twenty PRs a day.

## What Can Go Wrong?

Reliability failures in a workflow like this rarely come from any single dramatic breakdown. They come from small, specific gaps compounding.

- **Verification theater.** The gate stack exists, runs, and shows green — but the checks don't actually exercise the thing that matters (tests that only cover the happy path, a SAST rule set that doesn't cover the framework in use, a blast-radius check that only counts files, not the actual behavioral surface changed). This is worse than having no gates, because it produces false confidence that suppresses the manual scrutiny that would otherwise have caught the gap.
- **Scope creep at Stage 1, not caught until Stage 5.** A task enters the pipeline with a scoping gate that was filled in perfunctorily — vague acceptance criteria, an unbounded blast-radius field left blank — because the ticket template exists but isn't actually enforced. The workflow's structure is only as strong as its weakest enforced gate; an optional field that's routinely skipped is not a gate.
- **Context rot across a task class.** A context-provisioning template that was accurate when written drifts out of date as the codebase changes — pointing to a pattern file that's since been refactored, or referencing a constraint that's no longer true. Nobody notices until an agent produces a plausible diff built on a stale assumption, and the failure looks like an agent problem when it's actually a stale-template problem.
- **Reviewer fatigue reclassifying itself as calibration.** A team that adopts risk-based review routing can slide, over months, into labeling more and more tasks "low risk" not because the tasks changed but because the reviewers are tired of doing full passes — the routing logic itself becomes a way to rationalize less scrutiny rather than a genuine risk assessment. Periodically auditing whether the risk classifications still match actual incident history is the check against this drift.
- **The workflow becomes the compliance artifact, not the actual practice.** A documented five-stage process that exists in a wiki but is routinely bypassed under deadline pressure — "just this once, skip the scoping ticket and let the agent go" — provides zero actual reliability while still looking, on paper, like a mature process. The gates that matter are the ones enforced structurally (a merge blocked by a failing check, a PR template that requires the blast-radius field before it can be filed) not the ones enforced by asking people to remember.

## Security Considerations

Each stage of this workflow is also a place security either gets designed in or quietly falls through, and the two stages worth calling out specifically are context provisioning and execution.

**Context provisioning is an injection surface.** If the context assembled for a task includes untrusted content — a customer-submitted ticket description, a scraped external document, a comment already sitting in the codebase from an unverified contributor — that content becomes part of the agent's working context and can carry adversarial instructions, the indirect prompt-injection pattern. A workflow-level control here is treating the provenance of every piece of context explicitly: content from a trusted, reviewed source (the codebase itself, an approved design doc) can be handed to the agent close to verbatim; content from an untrusted source (an external ticket, a scraped page) should be treated as data to be summarized and sanitized by a separate step before it enters the agent's instructions, never concatenated directly into the prompt the agent treats as authoritative.

**Execution containment is a least-privilege control, not a convenience.** The sandbox described in Stage 3 should grant the agent exactly the credentials and network reach its declared scope requires — nothing scoped "just in case it needs it." This matters independent of model quality: even a perfectly aligned agent following a poisoned instruction (from a compromised dependency, a malicious ticket, or a supply-chain attack somewhere in its tool chain) can only do damage within the blast radius its actual permissions allow. A task scoped to "read this table and generate a report" that's granted broad write access to the production database has a large attack surface regardless of how well-behaved the agent is expected to be.

**Verification gates need a security-specific check that functional correctness doesn't imply.** A diff that satisfies every functional test can still introduce a SQL injection, a disabled certificate check, or a hardcoded credential — nothing about "the tests pass" independently verifies "this is secure," because the agent optimized for the former and has no innate signal pointing it toward the latter unless the gate stack (or the training/fine-tuning behind the model) explicitly checks for it. This is why the gate table above lists dependency/secret scanning and SAST as separate rows from unit tests, not folded into "run the test suite."

**Human review checkpoints should never skip the security pass on the theory that automated gates already covered it.** Automated security scanning catches known patterns; it doesn't reliably catch a novel logic flaw that happens to have security consequences (a race condition in an authorization check, a business-logic bypass that no signature-based scanner recognizes as a security issue at all). High-blast-radius review, per Stage 5, keeps a human security-aware pass in the loop specifically because this gap is structural, not a current-tooling limitation likely to close soon.

## Real-World Architecture

The shape of this workflow generalizes a pattern that predates AI agents by decades: continuous integration and continuous delivery pipelines that gate a human merge decision behind a graduated stack of automated checks, so that by the time a human looks at a change, most of the mechanically verifiable risk has already been resolved one way or the other. What's genuinely new in the AI-assisted version isn't the shape — it's that two additional stages (task scoping and context provisioning) now have to happen *before* the pipeline even starts, because a traditional CI/CD pipeline could always assume a human had already scoped their own task and assembled their own understanding before writing a line of code. An agent can't be assumed to have done either, so those steps move from being implicit and free to being explicit and designed.

Vendor architecture guidance on agentic and AI-assisted software delivery converges on similar structural recommendations — sandboxed execution environments, staged verification before human review, and explicit context-scoping for autonomous or semi-autonomous systems — though the specific terminology and reference architectures differ by vendor and evolve quickly.

> **Verification Note**
> Specific product names, feature sets, and reference-architecture diagrams for agentic CI/CD tooling (from cloud providers, CI platform vendors, or AI-coding-agent vendors) change fast and should be verified against that vendor's current documentation rather than treated as fixed. The five-stage structure described in this article is a framework, not a citation of any single vendor's published pipeline.

## Expert Insight

Teams that get real, durable reliability out of AI-assisted development tend to share one habit that's easy to describe and hard to sustain: they measure the workflow's failure points, not just its throughput. Throughput — PRs merged per week, tickets closed per sprint — is the number that's easy to report and easy to celebrate, and it's also the number that keeps climbing right up until a workflow with a hidden gap in Stage 4 or Stage 5 lets something serious through. The teams that catch problems early instead track things like: how often does a task get bounced back from Stage 4 or Stage 5 to Stage 1 for re-scoping (a high rate means the scoping gate itself is too weak); what fraction of merged agent PRs later needed a follow-up fix within a week (a rising trend means verification gates or review depth are eroding); and how often does the "low blast radius, light review" bucket actually correspond to changes that later turned out to be low-risk (a mismatch means the risk classification has drifted, often from the reviewer-fatigue pattern described above).

The other durable habit: treating the workflow itself as something that gets reviewed and revised, the same way a codebase does. A context-provisioning template that was right six months ago can be stale today; a verification gate that made sense before the team adopted a new framework can be a false sense of security now. A workflow that's never revisited after it's first built degrades in exactly the ways this article's "What Can Go Wrong" section describes, quietly and without anyone deciding it should.

## Try It Yourself

**Goal:** Design the five-stage workflow for one real, recurring task class your team already delegates to an agent, instead of relying on whatever process has accreted informally.

**Starting Point:** Pick a task class you delegate at least weekly — a bug-fix pattern, a recurring feature type, a maintenance chore like a dependency bump.

**Task:**
1. Write the Stage 1 scoping gate for this task class as a short checklist: what makes an instance of this task well-defined enough to delegate, and what would make you reject an instance back for refinement.
2. Write the Stage 2 context template: exactly what an agent needs to see for this task class, named specifically (which files, which pattern, which non-goals) rather than "give it the repo."
3. List which Stage 4 gates already exist for this task class (tests, linting, SAST, blast-radius checks) and which are missing. Be specific about what each existing gate would and wouldn't have caught for the last agent-authored PR of this class that needed a follow-up fix.
4. Classify this task class's typical blast radius (low/medium/high) and write the Stage 5 review depth that classification should trigger — and compare it honestly to the review depth these PRs actually get today.

**Expected Result:** A short, concrete five-stage spec for one task class, with at least one identified gap between what the workflow currently does and what this exercise says it should do.

**What You Learned:** If step 3 surfaced a gate you assumed existed but doesn't, that's the highest-value finding from this exercise — it's a gap that's been silently relying on Stage 5 (human review) to catch, which is exactly the stage volume makes least reliable. If step 4's honest comparison showed a mismatch between declared risk and actual review depth, that's worth raising with the team before it's discovered by an incident instead.

## Pause and Think

If every stage of this workflow were fully automated — including a hypothetical Stage 5 replaced by an extremely capable review agent — would the workflow still need a human anywhere in the loop, or would it have converged on being just a very good CI/CD pipeline?

### Answer

Even a hypothetically excellent automated reviewer only ever answers "does this diff satisfy the contract and patterns I was trained or instructed to check for" — it cannot answer "was this the right thing to build," "does this fit where the product and architecture are actually headed next year," or "should the organization even be automating this particular decision." Those are judgments about intent, direction, and risk appetite that don't reduce to checking a diff against a specification, however well that checking is automated — they require an accountable owner who can be asked "why did we build this" and give an answer that isn't itself generated by the system being reviewed. A workflow can automate an enormous amount of the *verification* that used to require human attention; it can't automate the *decision to trust this class of task at all*, which is a standing, ongoing organizational judgment, not a one-time engineering problem to solve and move past. That's also why this workflow keeps Stage 5 as a designed checkpoint with real authority to reject, rather than treating it as a formality on the way to full automation.

## Key Takeaways

- Reliability in AI-assisted development comes from a designed, five-stage workflow — task scoping, context provisioning, agent execution, automated verification gates, human review checkpoints — not from a better model or a cleverer prompt.
- Each stage exists to catch what the previous stage structurally cannot; skipping one doesn't reduce risk, it relocates it downstream, usually to human review, which volume makes least reliable.
- A green verification-gate stack is evidence a change is *safe to route to a human*, not evidence it's *correct* — especially when the same agent pass produced both the implementation and its own tests.
- Review attention should be routed by declared blast radius, not by arrival order or diff size; uniform review effort under-scrutinizes high-risk changes and over-scrutinizes low-risk ones.
- The workflow's most common real-world failures are quiet ones — verification theater, unenforced scoping gates, stale context templates, reviewer fatigue disguised as calibration — not dramatic single breakdowns.
- The workflow itself needs periodic review and revision, the same way the codebase it protects does; a template or gate that was correct when built can silently go stale.
