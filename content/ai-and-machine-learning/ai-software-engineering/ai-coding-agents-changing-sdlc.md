---
title: "How AI Coding Agents Are Changing the Software Development Lifecycle"
description: "A phase-by-phase map of where AI coding agents insert themselves into the seven SDLC phases today, what changes at each phase's inputs, outputs, and human checkpoints, and where the gates must stay human."
categorySlug: "ai-software-engineering"
articleType: "DEEP_DIVE"
tags:
  - "sdlc"
  - "ai-coding-agents"
  - "software-engineering"
  - "devops"
  - "ci-cd"
  - "code-review"
  - "deployment"
  - "ai-native-development"
---

# How AI Coding Agents Are Changing the Software Development Lifecycle

> By the end of this article you'll be able to walk any of your team's tickets through all seven SDLC phases and say, precisely, where an agent could act today, what it would need to be trusted to act there, and where a human still has to sign.

## The Problem: The SDLC Was Designed Around a Scarce Resource That No Longer Behaves the Same Way

Every SDLC model you've ever worked under — waterfall, Scrum, Kanban, SAFe, whatever your org calls it — was built around one assumption: the thing being scheduled, reviewed, and gated is *human attention*. Requirements meetings exist because gathering intent from a human takes a human. Code review exists because a human wrote the diff and another human needs to catch what they missed. Release gates exist because deploying wrong code costs money and a human has to be accountable for the decision to ship.

None of that assumption disappears when you add an AI coding agent to the picture. What disappears is the *coupling* between "a phase happens" and "a human is the one doing the work in that phase." An agent can draft a technical spec from a Jira ticket in the time it takes you to read this sentence. It can open a pull request against three services at 2 a.m. It can watch a canary deployment's error rate and decide, on its own, whether to roll back — and, in some organizations, recommend whether to promote.

That's not a faster developer. It's a new kind of participant showing up inside a process that was never built to expect a participant like this. The interesting question isn't "can AI write code" — you already know it can. The question this article answers is narrower and more useful day to day: **phase by phase, where exactly does an agent insert itself into the SDLC, and what changes about that phase when it does?**

## The Seven Phases, Refreshed

You've likely lived this cycle for years, so this is a refresher, not a lesson — just enough shared vocabulary to make the rest of the article precise.

| Phase | Traditional Question It Answers | Traditional Artifact |
|---|---|---|
| Requirements | What are we building and why? | Ticket, PRD, user story, acceptance criteria |
| Design | How will it be structured? | ADR, API contract, schema, sequence diagram |
| Implementation | Who writes the code? | Source diff, commit |
| Review | Is this diff correct and safe to merge? | PR comments, approval |
| Testing | Does it behave correctly under conditions we defined? | Test suite, coverage report |
| Deployment | How does it reach production safely? | Release, rollout plan, canary |
| Maintenance | How does it stay correct as the world changes? | Patch, dependency bump, incident postmortem |

This article walks each row in order, focusing not on *how an agent executes a task* but on *how the presence of agents reshapes each phase's inputs, outputs, and human checkpoints*.

## A Mental Model: The SDLC as a Row of Gates, Not a Conveyor Belt

Picture the SDLC not as a straight conveyor belt (requirements flow to design flow to code flow to test flow to deploy) but as a row of gates, each with an owner who decides "does this pass to the next gate?" Before agents, every gate's owner was a human, and the work *between* gates was also done by a human.

What's changing is that agents are taking over the work *between* gates — drafting the spec, writing the diff, generating the tests, watching the metrics — while the *gate decisions themselves* are, for now, staying stubbornly human in every organization doing this responsibly.

```text
   Human: intent          Human: intent           Human: intent
        │                      │                       │
        ▼                      ▼                       ▼
  REQUIREMENTS ────► DESIGN ────► IMPLEMENTATION ────► REVIEW ────► TESTING ────► DEPLOYMENT ────► MAINTENANCE
        ▲                      ▲                       ▲             ▲             ▲                ▲              ▲
   Agent: draft           Agent: draft            Agent: draft   Agent: pre-  Agent: draft    Agent: monitor  Agent: draft
   spec/subtasks          ADR/contract options    diff + tests   screen        + triage        + propose       patch/PR
                                                                                                 rollback
        │                      │                       │             │             │                │              │
        └──────────────────────┴───────────────────────┴─────────────┴─────────────┴────────────────┴──────────────┘
                                    GATE = human approval, every time
```

The analogy breaks down in one important way: gates aren't binary humans-only forever. Some organizations already let agents pass certain low-risk gates autonomously (a dependency patch that only bumps a patch version and passes all tests, for example). We'll come back to exactly where that line is being drawn, phase by phase.

## Phase 1: Requirements and Planning

**What used to happen.** A product manager or engineer writes a ticket. A team discusses it in refinement. Someone breaks it into subtasks. Acceptance criteria get argued over, usually informally, often incompletely.

**Where the agent inserts itself.** Given a ticket, a linked design doc, and read access to the relevant part of the codebase, an agent can now draft a technical breakdown before a human ever opens the ticket: proposed subtasks, an initial acceptance-criteria list, and a list of open questions where the ticket is ambiguous or contradicts existing code behavior. Some coding-agent platforms will open a **draft PR with a plan attached** the moment a ticket is assigned to them, rather than waiting for a human to hand off a fully-specified task.

**What actually changes.**
- The starting artifact for a human's planning conversation is no longer a blank ticket — it's a draft breakdown the human edits, which shifts the human's role from *author* to *editor and challenger*.
- Ambiguity that used to surface slowly, in a stand-up three days later, now surfaces immediately as a list of "the agent couldn't determine X" flags — assuming the agent is built to surface uncertainty rather than silently guess.
- The failure mode this introduces is subtle: an agent that fills gaps with a *plausible-sounding* assumption instead of flagging the gap produces a plan that reads as complete but encodes a wrong guess about intent. This is the same context-fragmentation and hallucination-under-ambiguity problem that shows up in code generation — it just now happens one phase earlier, to *requirements*, not code.

> **Verification Note**
> Specific claims about which commercial coding-agent products currently support automatic ticket-to-plan drafting (and exactly what triggers it) are vendor-specific and change quickly. Verify current behavior against the vendor's own documentation before citing a specific product's workflow as fact.

**What stays human.** Deciding *what problem is worth solving* and *why* is a business judgment, not a text-completion task. An agent can compress the distance between "ticket exists" and "structured plan exists," but it cannot supply the organizational context for why this ticket matters more than the twenty others in the backlog.

## Phase 2: Design

**What used to happen.** An engineer (or a small group) sketches an approach — an API contract, a schema change, a sequence of service calls — often in a design doc or an Architecture Decision Record (ADR), and gets it reviewed before a line of implementation code is written.

**Where the agent inserts itself.** Given the requirements draft from Phase 1 and read access to the existing codebase, an agent can generate **design alternatives with trade-offs already sketched out**: "Option A adds a new column to the `orders` table (fast, but requires a backfill migration); Option B introduces a separate `order_limits` table (slower to query, no backfill needed)." It can draft the OpenAPI spec for a new endpoint, or a first-pass ADR, directly from the acceptance criteria.

**What actually changes.**
- Design review shifts from "does this design exist and make sense" to "does this design correctly reflect constraints the agent didn't have visibility into" — data volume, an SLA the ticket didn't mention, an org policy against a particular pattern. The agent's design is only as good as the context it was given, and unlike a senior engineer, it won't reliably know what it *doesn't* know about tribal, undocumented constraints.
- This is exactly where human-in-the-loop approval gates matter most, because a design decision is expensive to reverse once implementation starts.

**What stays human.** Architectural judgment that trades off *organizational* concerns — team ownership boundaries, migration risk appetite, long-term maintainability versus short-term velocity — is not something an agent can weigh correctly without being told the weights, and those weights are rarely written down anywhere the agent can read them.

## Phase 3: Implementation

What's new at the SDLC level, rather than the mechanical level, is *where implementation now sits relative to the rest of the process*.

**What actually changes.**
- Implementation used to be the longest phase, bottlenecking everything after it. For a well-scoped, well-specified change, it is now frequently the *shortest* phase — a draft PR can exist minutes after the ticket is picked up. The bottleneck moves downstream, to review and testing, which is why those two phases are under the most active tooling investment right now.
- A single ticket can spawn multiple implementation attempts in parallel — one agent tries the schema-migration approach, another tries the separate-table approach from Phase 2 — and a human picks the better result instead of committing to one approach up front. This is a genuinely new capability the SDLC never had: cheap, parallel, disposable implementation drafts.

A minimal illustration of how this shows up in a CI pipeline definition — note that the agent step produces a *draft* PR, not a merge:

```yaml
# .github/workflows/agent-implementation.yml
name: agent-implementation
on:
  issues:
    types: [labeled]

jobs:
  draft-implementation:
    if: github.event.label.name == 'agent:implement'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run coding agent against the issue
        run: |
          agent-cli run \
            --task-source "issue:${{ github.event.issue.number }}" \
            --mode draft-pr \
            --sandbox true
      # The agent's own commit/PR step runs inside the sandbox above.
      # Nothing here merges anything — it only opens a PR for a human gate.
```

The line that matters in that file is `--mode draft-pr` combined with `--sandbox true`: implementation output lands as a reviewable artifact inside an isolated environment, never as a direct commit to a protected branch. That constraint — sandboxed execution feeding a human-gated artifact — is the load-bearing safety property of this whole phase.

**What stays human.** Merging. Every organization doing this responsibly still requires a human approval before code reaches a shared or production branch, regardless of how fast or clean the agent's draft looks.

## Phase 4: Code Review

**What used to happen.** A human reads a diff, checks it against style and architecture expectations, tests it mentally or by pulling the branch, and leaves comments or approves.

**Where the agent inserts itself.** This is the phase seeing the most active change right now, precisely because it's the new bottleneck described above. A pre-review agent runs against every PR — human-authored or agent-authored — checking style, obvious bugs, security anti-patterns, and whether the diff matches the linked ticket's acceptance criteria, and leaves inline comments *before* a human reviewer opens the PR.

**What actually changes.**
- Review becomes two-stage: a fast, automated first pass that catches mechanical issues (an unhandled error path, a missing null check, a secret accidentally hardcoded), followed by a human pass that focuses on what automation genuinely can't judge well — does this change actually solve the right problem, does it fit the codebase's conventions, is this the right level of abstraction.
- The real risk this introduces is **reviewer complacency**: if every PR arrives with a green "agent review: no issues found" badge, human reviewers start trusting the badge more than they should, especially under deadline pressure. A clean automated pass is evidence of the *absence of the specific things it checks for* — it is not evidence of correctness. Treating it as the latter is how subtly wrong logic slips past both the agent and a rushed human reviewer.
- Volume also changes qualitatively, not just quantitatively: when implementation is cheap (Phase 3), more PRs get opened, including exploratory ones that used to never make it past a developer's local branch. Review capacity, not implementation capacity, becomes the throughput ceiling for the whole team.

**What stays human.** Final approval on anything that touches production data handling, security boundaries, or a decision with business consequences. Most engineering orgs treat an agent's review as *additional signal*, not a substitute reviewer — a distinction worth making explicit in your own branch-protection rules rather than leaving implicit.

## Phase 5: Testing and QA

**What used to happen.** Developers write unit tests alongside (or, honestly, sometimes well after) their code. QA writes integration and end-to-end tests separately. Coverage tools flag untested branches, and someone eventually gets around to writing tests for them, or doesn't.

**Where the agent inserts itself.** Given a diff, an agent can generate unit tests targeting the specific branches the diff introduces or touches, run a coverage delta against the pre-diff baseline, and fail the build if new code isn't covered — closing a gap that, historically, relied entirely on developer discipline. For legacy code with little or no existing coverage, an agent can be pointed at an untested module specifically to backfill a characterization test suite (tests that pin down *current* behavior, useful before a risky refactor, even if that current behavior isn't obviously "correct").

**What actually changes.**
- Test-writing shifts from something a developer does from memory to something generated *from the diff itself*, which changes the failure mode: a test an agent writes by inspecting the diff will faithfully test what the code *does*, which is not the same as testing what the code was *supposed to do*. A test suite that only mirrors implementation will pass even when the implementation itself is wrong — it just certifies "the code does what the code does," which is worthless as a correctness signal. Someone still has to check the generated tests against the actual requirement, not just skim them for syntax.
- Flaky-test triage — historically a tedious, low-glory task — is a good current fit for agent assistance: given a test's failure history and the code paths it touches, an agent can often distinguish "genuinely flaky due to timing/ordering" from "intermittently exposing a real race condition," and propose which.

**What stays human.** Deciding what "correct" means for a given feature. No amount of coverage percentage substitutes for a human confirming the tests assert the *intended* behavior, not just the *observed* one.

## Phase 6: Deployment and Release

**What used to happen.** A build passes CI, gets deployed to staging, then production, usually behind a progressive rollout (canary or blue-green), with a human watching dashboards and manually deciding to promote or roll back.

**Where the agent inserts itself.** An agent with read access to metrics (error rate, latency percentiles, resource saturation) can watch a canary's telemetry continuously and make — or recommend — the promote/rollback decision faster and more consistently than a human glancing at a dashboard between other tasks. This is the phase where automated agent *action* (not just drafting) is furthest along, because the decision is comparatively well-bounded: a small number of metrics, a clear threshold, a fast and cheap reversal (rollback) if wrong.

```text
CI/CD Pipeline          Canary Deployment      Release Agent        Metrics Store        On-Call Engineer
      │                        │                     │                    │                     │
      │── Deploy new version ─▶│                     │                    │                     │
      │   to 5% of traffic     │                     │                    │                     │
      │                        │                     │                    │                     │
      │                        │        every 30s:   │                    │                     │
      │                        │        ┌────────────┼─── query error ───▶│                     │
      │                        │        │            │  rate, p99 latency,│                     │
      │                        │        │            │◀── current vs. ────│                     │
      │                        │        │            │    baseline        │                     │
      │                        │        │            │                    │                     │
      │                        │   within thresholds: continue observing  │                     │
      │                        │        │            │                    │                     │
      │                        │   threshold breached:                    │                     │
      │                        │◀── trigger automatic rollback ───────────│                     │
      │                        │        │            ├──────── page: rollback reason + ────────▶│
      │                        │        │            │         evidence                          │
      │                        │        │            │                                            │
      │                        │        │            ├──── recommend promotion (if healthy) ─────▶│
      │                        │        │            │◀─────────── approve full rollout ──────────│
```

**What actually changes.**
- Rollback — the *safe* direction — is increasingly delegated to agents outright, because a wrong automatic rollback costs a few minutes of a canary at reduced traffic, which is cheap. Promotion — the *riskier* direction, since it commits the change to 100% of production traffic — is far more commonly left as an agent *recommendation* requiring human approval, because a wrong promotion costs a full incident.
- This asymmetry (automate the reversible, gate the irreversible) is one of the more reliable design heuristics showing up across teams doing this in practice, and it's worth applying deliberately rather than by accident: ask, for any agent action you're considering, "if this decision is wrong, how expensive is undoing it?" The cheaper the undo, the safer it is to let an agent decide without waiting on a human.
- Release-notes generation from the merged PR set is a comparatively low-stakes, high-adoption use here — summarizing "what changed" for a release is exactly the kind of well-scoped text-generation task agents already handle reliably.

**What stays human.** Full production promotion for anything with meaningful blast radius, and the incident-command decision during an active outage. Accountability for a production incident does not transfer to an agent no matter how much of the detection and even the rollback trigger it handled.

## Phase 7: Maintenance and Evolution

**What used to happen.** Dependency updates, security patches, small refactors, and "someone should really clean this up" technical debt accumulate in a backlog that competes for attention against feature work — and usually loses, until a CVE or an outage forces the issue.

**Where the agent inserts itself.** This is arguably the phase with the *least* controversial agent adoption today, because the work is high-volume, low-glamour, and well-bounded: an agent opens a PR bumping a dependency version, runs the full test suite against the bump, and — if everything passes and the version delta is a patch or minor bump with no breaking-change notes — some teams let this merge with no human review at all. For CVE remediation specifically, an agent can be pointed at a vulnerability report, identify every affected call site across the codebase (not just the vulnerable package's declaration), and draft the fix everywhere it's needed in one pass.

**What actually changes.**
- The backlog itself changes shape: work that used to sit for months because no one wanted to spend a sprint on a dependency bump now gets triaged continuously, which measurably reduces the "dependency debt" that tends to cause the worst kind of security incident — the one where the CVE was public for months before anyone acted on it.
- Legacy migrations (a framework upgrade, a language-version bump across a large codebase) are a harder case: an agent can mechanically apply a known transformation across thousands of call sites faster than any human, but it still needs a human to validate the *edge cases* the mechanical transformation doesn't cover cleanly — which is usually where all the actual risk in a migration lives.

**What stays human.** Deciding *when* a dependency or framework has drifted far enough behind to justify the migration risk, and owning the outcome if an automated patch introduces a subtle regression that passes tests but breaks a real workflow the tests didn't cover.

## Under the Hood: One Ticket Through All Seven Phases

To make this concrete rather than abstract, walk through a single ticket end to end: **"Add rate limiting to the checkout API."**

1. **Requirements.** The agent reads the ticket, the checkout service's existing code, and a linked incident report about a checkout-abuse spike. It drafts acceptance criteria: "limit to N requests per user per minute, return 429 with a `Retry-After` header, exempt internal service-to-service calls." It flags one open question: the ticket doesn't say what N should be. A human answers that in one comment instead of a meeting.
2. **Design.** The agent proposes two options: a Redis-backed sliding-window counter (fast, needs a new Redis dependency for this service) versus reusing the API gateway's existing rate-limiting middleware (no new infra, less granular). A senior engineer picks the gateway option because the team is trying to reduce, not add, infrastructure surface area — a constraint the agent had no way of knowing from the code alone.
3. **Implementation.** The agent drafts the gateway configuration change and the service-side header handling as a PR, sandboxed, with the ticket's acceptance criteria linked in the PR description.
4. **Review.** An automated pass flags that the exemption for internal service-to-service calls isn't actually implemented — the config only checks a header that's easy to spoof from outside. A human reviewer, prompted by that flag, requests a real service-identity check instead.
5. **Testing.** The agent generates tests for the 429 path, the header, and the exemption path, and reports a coverage delta showing the new branches are covered. A human confirms the *limit value* asserted in the tests actually matches the acceptance criteria from step 1, not just whatever number the agent happened to pick as a placeholder.
6. **Deployment.** The change ships behind a canary. The release agent watches checkout-endpoint error rates for false-positive 429s (legitimate users getting rate-limited); nothing breaches threshold, and the agent recommends promotion, which an on-call engineer approves.
7. **Maintenance.** Two months later, the Redis client library the *gateway* depends on gets a CVE. Because the team chose the gateway-middleware option in step 2, this specific service was already unaffected — a benefit of the design decision the agent surfaced options for, but a human chose.

Notice what happened across all seven phases: the agent did a meaningful share of the *drafting* work at every single phase, and a human made a load-bearing decision at every single phase too — the rate limit value, the infrastructure trade-off, the spoofable-header catch, the test's asserted value, and the promotion approval. That pattern — agent drafts, human decides — is the practical shape of "AI-native software engineering" right now, not "agents replace phases."

## Common Misconceptions

**Misconception:** AI coding agents collapse the SDLC into a single "describe it, ship it" step.
**Reality:** Every phase still exists; what changes is who authors the *draft* at each gate. The gates themselves — design approval, merge approval, promotion approval — remain, and in regulated or high-stakes environments they remain strictly human, often with an audit trail specifically because a human made the call.

**Misconception:** If code review has an automated pre-pass, human review time can be cut proportionally.
**Reality:** Human review time shifts from mechanical issues to judgment issues — often taking *longer per PR* even as the mechanical-issue rate drops, because the reviewer is now expected to catch the things automation structurally can't (whether this is the right problem to solve at all).

**Misconception:** Because an agent can act at a phase, it's safe to let it act autonomously there.
**Reality:** *Capability* and *appropriate autonomy* are different questions. The deployment example above shows a team giving an agent autonomy over rollback (cheap to undo) while withholding autonomy over promotion (expensive to undo) — the same agent, different authority, based on the cost of being wrong, not on what the agent is technically capable of doing.

## Security Considerations Across the Lifecycle

Every insertion point above is also a new trust boundary:

- **Requirements phase:** an agent that ingests ticket text, linked comments, or attached files is ingesting *untrusted input* the moment any of that content could have been written or edited by someone outside your trust boundary — a classic indirect prompt-injection surface, distinct from the direct-injection case for tool-using agents generally.
- **Implementation phase:** sandboxing and least-privilege execution during agent-driven code changes matter regardless of how good the output looks — an agent implementation step with unrestricted network or filesystem access is a supply-chain risk regardless of how good its code output is.
- **Deployment phase:** an agent with the authority to trigger a rollback or promotion needs its *own* scoped credentials to your deployment system, not a shared human's token.
- **Maintenance phase:** an agent auto-merging dependency bumps needs the same supply-chain scrutiny as a human doing the same thing — a patch-version bump can still pull in a compromised package.

## Expert Insight

The most common mistake teams make when introducing agents into the SDLC isn't technical — it's sequencing. Organizations that try to introduce agent participation at every phase simultaneously tend to lose the ability to tell *which* phase's automation caused a given problem when something goes wrong. The teams that scale this successfully tend to introduce agent participation one phase at a time, starting with the phase where being wrong is cheapest (usually maintenance — dependency bumps — or the automated-rollback half of deployment) and only expanding to a new phase once they have concrete evidence — not a vendor's marketing claim — that the current phase's agent output requires acceptably little correction from humans.

The second most common mistake is measuring the wrong thing. Cycle time from ticket-open to PR-open drops dramatically once implementation is agent-assisted — that's real, and it's the number most visible in a dashboard. But if review and testing don't scale proportionally, cycle time from ticket-open to *production* barely moves, because the bottleneck simply relocated. If you're evaluating whether agent adoption is actually helping your SDLC, measure the phase that's currently your bottleneck, not the phase that's easiest to demo.

## Try It Yourself

**Goal:** Apply the phase-by-phase framework to a real ticket from your own backlog, not a hypothetical one.

**Starting point:** Pick one ticket currently in your team's backlog — ideally a small, well-understood feature or bug fix, not an ambiguous epic.

**Task:** For each of the seven phases, write one sentence answering: "If an agent drafted this phase's output today, what would a human still need to check before trusting it?" Be specific — not "correctness," but the actual thing that could be silently wrong (a placeholder value, a missing edge case, an assumption about infrastructure the agent can't see).

**Expected result:** You should end up with seven short, concrete checkpoints — effectively a lightweight approval checklist tailored to that ticket.

**What you learned:** The checkpoints you just wrote are a smaller, more honest version of what a real AI-native development workflow needs at each gate — and doing this exercise on a real ticket usually surfaces at least one phase where your team currently has *no* explicit checkpoint at all, which is worth fixing before an agent (or a rushed human) fills that gap with a guess.

## Key Takeaways

- The SDLC's seven phases don't disappear or merge when agents participate — what changes at each phase is who drafts the phase's output and how quickly that draft is produced.
- The consistent, load-bearing pattern is **agent drafts, human decides** — visible in requirements (draft plan, human sets intent), design (draft alternatives, human picks constraints), implementation (draft PR, human merges), review (automated pass, human judgment), testing (generated tests, human validates intent), deployment (automated rollback, human-gated promotion), and maintenance (automated patch PRs, human owns migration risk).
- The reliable heuristic for how much autonomy to grant an agent at any given gate is the cost of being wrong: automate the cheaply-reversible (rollback), gate the expensive-to-reverse (promotion, merge, architecture).
- The SDLC bottleneck has moved. Implementation used to be the long pole; for many well-scoped changes, review and testing capacity are now the constraint on how fast a team actually ships.
- Every new insertion point is also a new trust boundary — untrusted ticket text reaching an agent, sandboxed execution during implementation, scoped credentials for deployment actions, supply-chain scrutiny for auto-merged dependency bumps — and each deserves the depth of treatment its risk warrants, not an afterthought.
