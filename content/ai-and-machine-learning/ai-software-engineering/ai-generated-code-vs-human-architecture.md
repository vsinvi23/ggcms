---
title: "AI-Generated Code vs Human-Designed Software Architecture"
description: "Why generating correct-looking code and designing sound software architecture are structurally different tasks, and how ADRs plus machine-checkable fitness functions let humans own structural decisions while agents safely implement inside them."
categorySlug: "ai-software-engineering"
articleType: "DEEP_DIVE"
tags:
  - "ai-generated-code"
  - "software-architecture"
  - "ai-coding-agents"
  - "architecture-decision-records"
  - "fitness-functions"
  - "human-ai-collaboration"
---

# AI-Generated Code vs Human-Designed Software Architecture

> By the end of this article you'll be able to explain, in structural terms, why an AI agent can write a correct function faster than any human alive yet still make a genuinely bad call about where a service boundary should sit — and you'll be able to turn that gap into a concrete division of labor for a real project.

## The Problem

A team is building a SaaS product and needs to support multiple customers ("tenants") on shared infrastructure. Someone opens an AI coding agent and types: "Add support for multiple customers to this app." The agent reads the codebase, adds a `tenant_id` column to every table, threads a `WHERE tenant_id = ?` clause into every query, adds a `tenant_id` claim to the JWT, writes tests that confirm one tenant's request doesn't return another tenant's rows, and opens a pull request. Every test passes. The PR looks clean, idiomatic, and complete. It merges.

Eight months later, three things have gone wrong in ways nobody wrote a test for: a new endpoint written in a rush forgot the `tenant_id` filter and leaked one customer's invoices to another; a single noisy tenant running a heavy batch job started degrading response times for every other tenant on the same database; and a large enterprise prospect's procurement team requires contractual proof of physical data isolation that a shared-schema, filter-based design cannot provide at any price. None of these are bugs in the code the agent wrote. The code does exactly what it was asked to do, correctly. The problem is one level up: nobody decided how tenant isolation should actually work — what failure modes it needed to survive, what a compliance auditor would need to see, what happens when one tenant misbehaves — before code started getting written to implement *a* version of it.

That's the gap this article is about. A senior architect handed the same one-line request would not have opened an editor first. They'd have asked: how many tenants, how big, how sensitive is the data, what does the sales team's biggest deal need contractually, what's the team's operational maturity for running per-tenant infrastructure, what's the migration cost if we guess wrong. Those questions don't have answers in the codebase, and an agent reading the codebase — however capable — has no way to conjure them. It did the only thing available to it: it pattern-matched to the most common shape of "multi-tenant SaaS" in its training distribution and implemented that, competently, without knowing it was answering a question nobody had actually decided.

## Why This Problem Is Difficult

The difficulty isn't that AI models are "bad at architecture" in some fixable, temporary sense — like a bug that gets patched in the next release. It's that code generation and architecture design are different kinds of problems, with different shapes, and the properties that make LLM-based agents extraordinarily good at one are largely absent from the other.

Three things make this genuinely hard to see clearly, especially from inside a team that's already impressed by how well an agent writes code:

1. **The output looks the same either way.** A pull request that correctly implements a well-chosen architecture and a pull request that correctly implements a poorly-chosen one can be equally clean, equally well-tested, and equally idiomatic. Code quality and architectural soundness are different axes, and a fast, competent implementation of the wrong structure is not a smaller problem than a slow one — it's often a bigger one, because it ships faster and gets built on top of sooner.
2. **The failure shows up on a different clock than the request did.** A bad function call fails a test in seconds. A bad architectural decision — the wrong tenant-isolation model, a service boundary drawn along the wrong seam, a synchronous call chain that should have been asynchronous — tends to surface in production incidents, cost overruns, or a re-architecture project six, twelve, or twenty-four months later. Nothing in the immediate feedback loop that an agent (or an impatient human) uses to judge "did that work" catches this.
3. **The information architecture actually depends on often doesn't exist as text anywhere the agent can read it.** Team size and skill mix, this quarter's budget, a contractual SLA with one large customer, a compliance regime the company is trying to get certified under, a VP's opinion about which vendor the company will consolidate on next year — none of that lives in the repository. A human architect absorbs it through meetings, hallway conversations, and organizational memory. An agent's context window, however large, is a window onto artifacts that exist; it cannot see decisions that were never written down.

## A Simple Mental Model

Think of the difference as **framing a wall versus deciding where the load-bearing walls go**.

A skilled framing contractor, handed a blueprint, can frame a wall fast, straight, and to code — measure, cut, nail, plumb, repeat, at a speed and consistency a novice can't match. That's code generation: given a sufficiently clear local specification, produce a correct, well-formed implementation quickly. An architect deciding where the load-bearing walls go is solving a completely different problem: given a budget, a site, a building code, a client's needs today and probably five years from now, and physics, decide a structure that the building's entire life depends on — and that is expensive, sometimes impossible, to change once the concrete is poured. Get the framing wrong on one wall and you fix that wall. Get the load-bearing decision wrong and you may need to gut the building.

This analogy has a limit worth naming: software is *more* reversible than a poured foundation — you can, in principle, refactor a monolith into services or migrate a database schema. But "more reversible than concrete" is not the same as "cheap to reverse." A tenant-isolation model chosen at month one and discovered to be wrong at month twelve, with real customer data and real contracts built on top of it, costs real engineering-months and real calendar time to unwind — the reversibility is theoretical until someone actually has to do it under a deadline.

## The Core Idea

Start with a working definition, because "architecture" gets used loosely enough that the word itself causes confusion. Software architecture is commonly understood — informally, across the industry, not as a single canonical definition — as **the set of structural decisions that are hardest and most expensive to change later**, together with the reasoning that connects those decisions to the system's actual requirements and constraints. Which service owns which data. Where the trust boundaries sit. Synchronous or asynchronous. One database or several. Monolith or services, and along which seams. These are decisions *about* the system, made in advance of most of the code that will implement them, and they constrain everything written afterward.

**Code** is what implements a decision once it's been made. Given "tenant isolation is enforced by row-level security policies scoped by a `tenant_id` claim validated at the database layer, not the application layer," writing the migration, the policy, and the application code that relies on it is an implementation task — bounded, checkable against tests, and exactly the kind of work an agent's read-modify-test-commit loop is built for. Given "add support for multiple customers," with no decision made yet about *how* isolation should work, an agent doesn't have an implementation task. It has an architecture task disguised as one, and it will answer it the only way it can: by generating the statistically most common pattern for "multi-tenant SaaS" it has seen, which may or may not be the right one for this business.

That distinction — a decided structure to implement, versus an undecided structure to invent — is the whole article.

## How It Actually Works: The Structural Reasons for the Gap

It's worth being precise about *why* this gap exists, because "AI isn't good at architecture yet" invites the (currently unverifiable) assumption that a bigger model fixes it. The reasons below are largely structural properties of the two problems, not just a current capability ceiling.

### 1. Code has a fast, checkable oracle. Architecture doesn't.

A generated function either compiles, type-checks, and passes its tests, or it doesn't — usually within seconds, always within a CI run. That tight, unambiguous feedback loop is exactly what agent frameworks are built around: generate, run, observe the failure, retry. Architecture has no equivalent oracle. "Is this the right service boundary" doesn't resolve in a test run — it resolves, if at all, over months, as the system evolves and either accommodates change gracefully along that boundary or fights it at every turn. An agent optimized to converge quickly against a checkable signal has nothing to converge against here, because the signal that matters arrives on a completely different timescale than the one it operates in.

### 2. Code generation is local. Architecture is global.

Implementing a function is mostly a local problem: given the signature, the immediate call site, and nearby code for style and convention, produce a correct body. Architecture is defined by relationships between things that are *far apart* — a decision in the payments service affects a decision in the reporting service two teams over; a data-ownership choice made in month one constrains every feature request for years. Holding that kind of long-range, cross-cutting structure in view is exactly what context windows struggle with at scale, and it's compounded by something context alone can't fix: a lot of the relevant structure was never fully written down anywhere retrievable — it lives in tribal knowledge, in why a previous migration failed, in a Slack thread from eighteen months ago that nobody indexed.

### 3. Code generation is cheap to retry. Architecture is expensive to retry.

An agent that generates a wrong function pays almost nothing to regenerate it — that's the entire premise behind self-correction loops and fallback tiers. Cheap iteration is a feature when the cost of being wrong is low. It becomes a liability when applied, by habit, to decisions where being wrong is *not* cheap: choosing a database, drawing a service boundary, picking a tenancy model. An agent's default operating mode — produce a plausible answer fast, let the feedback loop correct it — is tuned for the wrong cost function when the question is architectural rather than implementational.

### 4. Architecture runs on inputs that aren't in the repository.

Budget, headcount and team skill mix, a contractual SLA, a compliance deadline, next quarter's roadmap, a vendor relationship the company is trying to wind down — these are the actual inputs to most real architectural decisions, and none of them are code. A senior architect carries this context because they sit in the planning meetings, read the contracts, and remember the last three times a similar decision went wrong. An agent, however large its context window, is reading artifacts that exist. It has no channel to information that was never captured as text, and a great deal of what architecture actually optimizes for falls into exactly that category.

### 5. Nobody is accountable for an agent's architectural call.

A human architect who chooses a tenancy model owns that choice — defends it in a design review, gets paged when it breaks, and carries the institutional memory of why it was made into the next decision. An agent has no persistent stake across projects, no incentive structure, and nothing resembling institutional scar tissue. That's not a moral failing of the technology — it's simply a different kind of accountability than the one architecture decisions actually need, which is a specific person whose judgment can be questioned and whose reasoning can be interrogated years later when the decision is revisited.

| Dimension | Code generation | Architecture design |
|---|---|---|
| Feedback loop | Seconds to minutes (compile, test, lint) | Months to years (production behavior, cost, incident history) |
| Scope | Local — the function, the file, the immediate context | Global — cross-service, cross-team, cross-time |
| Cost of being wrong | Low — regenerate, retry, patch | High — migrations, re-platforming, contractual exposure |
| Required inputs | Mostly present in the codebase and the task description | Frequently absent from any machine-readable artifact |
| Verifiable by | Tests, type checkers, static analysis | Long-horizon production outcomes, judgment, review |
| Accountability | Diffuse — a PR author, reviewed and merged | Concentrated — a named decision-maker who owns the trade-off |

> **Verification Note**
> Claims about *current* model capability at architecture-style tasks are moving quickly and benchmark-specific as of this writing (September 2026). Treat any specific number (e.g., "models are now X% as good as senior architects at Y benchmark") as something to verify against the model vendor's own published evaluation results before repeating it — none is asserted here. The structural argument above (oracle, locality, reversibility, missing inputs, accountability) is the durable claim; specific capability comparisons are not.

## Let's Walk Through an Example

Return to the multi-tenancy scenario and make the contrast concrete.

**What the agent produced, given "add support for multiple customers":**

```
+-----------------------------------------------------------+
|  Shared schema, filter-based isolation (what got built)   |
|                                                             |
|  orders table:   [id | tenant_id | customer | amount ...]  |
|  invoices table: [id | tenant_id | ... ]                   |
|                                                             |
|  Enforcement: WHERE tenant_id = :current_tenant            |
|  added to each query, by hand, in each new endpoint.       |
+-----------------------------------------------------------+
```

This is a real, common, and often perfectly reasonable pattern — it's not "wrong" in the abstract. It's wrong *here* because nobody checked it against this business's actual constraints before code got written against it. Enforcement lives in application code, repeated at every call site, with no structural guarantee that a new endpoint won't forget the filter. There's no mechanism to give one tenant a dedicated database for compliance. There's no isolation between tenants' resource consumption at the database layer.

**What a human architect, asked the same question, would have produced first — a decision, not code:**

```markdown
## ADR-014: Tenant Isolation Model

**Context:** Supporting multiple customers on shared infrastructure.
Constraints: (1) two enterprise prospects require contractual proof of
data isolation; (2) team has no operational experience running
per-tenant infrastructure at scale; (3) current tenant count is small
but a top-3 sales opportunity requires isolation guarantees within two
quarters.

**Decision:** Shared database, isolation enforced by PostgreSQL
row-level security (RLS) policies at the database layer — not
per-query filters in application code. Tenants requiring contractual
physical isolation are provisioned a dedicated schema via the same
RLS-based migration path, reusing the same code paths.

**Consequences:** Every new table must ship with an RLS policy before
merge (enforced by a CI check, not developer memory). The application's
database connection role must not own the tables and must not carry the
`BYPASSRLS` attribute — PostgreSQL skips RLS enforcement entirely for a
table's owner and for any `BYPASSRLS` role, regardless of which policies
are defined, so this is a hard requirement on how the app's database
credentials are provisioned, not just on the migration file. Cross-tenant
queries for internal analytics require an explicit, audited bypass
role. Noisy-neighbor risk is mitigated by per-tenant connection pool
limits, revisited if a single tenant's usage crosses a defined
threshold.
```

The decision itself isn't necessarily "better" in some universal sense than what the agent generated — RLS-based isolation has its own trade-offs and failure modes. The point is that it was made by weighing inputs — the sales contract, the team's operational maturity, the compliance timeline — that never appeared in the one-line prompt the agent was given, and it produces a **checkable constraint** ("every table must ship with an RLS policy") that can now be handed to an agent as an implementation task with a real oracle: did this migration include a policy, yes or no. That's the shift this article is building toward — not "agents can't help with tenancy," but "the decision has to happen before the implementation task is handed over, and it has to happen somewhere an agent's context window can't manufacture it."

## Under the Hood: Turning Architecture Into Something an Agent Can Safely Implement Inside

This is the practical core of the article: how do humans and agents actually divide responsibility on a real project, given everything above?

The working model is: **humans own decisions with non-local, hard-to-reverse consequences and the inputs those decisions depend on; agents own implementation within the boundaries those decisions establish — and the boundary between the two is made of artifacts an agent can actually check itself against, not just prose a human hopes gets read.**

Concretely, that means three things exist on a well-run AI-native project:

**1. Architecture Decision Records (ADRs) as the source of truth for structural decisions.**
An ADR captures a decision, its context, and its consequences — the format shown above is a common lightweight one, not a strict standard. The important property isn't the template; it's that the decision exists as a written artifact *before* implementation work is delegated, so an agent implementing against it is executing a decision, not making one by default.

**2. Fitness functions that turn an ADR into a check a machine can run.**
An ADR that only lives in a wiki page is advisory — an agent (and, honestly, a busy human) can violate it without anyone noticing until much later. A **fitness function** is an automated check that verifies a specific architectural property holds, run in CI alongside the tests. Here's one shape, checking the RLS constraint from the ADR above:

```python
"""
Fitness function: every table migration must define a row-level
security policy before it can merge. This encodes ADR-014 as a
machine-checkable gate rather than a convention someone has to remember.

Scope note: this checks that the migration *defines* RLS and a policy.
It cannot verify that the application's runtime database role is a
non-owner, non-BYPASSRLS role — PostgreSQL silently skips RLS for a
table's owner and for any BYPASSRLS role regardless of the policies
defined on the table. That has to be enforced separately, e.g. in the
infrastructure/IAM provisioning for the app's database credentials.
"""
import re
import sys
from pathlib import Path

def check_migration_has_rls_policy(migration_path: Path) -> list[str]:
    violations = []
    text = migration_path.read_text(encoding="utf-8")

    creates_table = re.search(
        r"CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)", text, re.IGNORECASE
    )
    if not creates_table:
        return violations  # not a table-creating migration; not in scope

    table_name = creates_table.group(1)
    has_rls_enable = re.search(
        rf"ALTER TABLE\s+{table_name}\s+ENABLE ROW LEVEL SECURITY",
        text, re.IGNORECASE,
    )
    has_policy = re.search(r"CREATE POLICY", text, re.IGNORECASE)

    if not (has_rls_enable and has_policy):
        violations.append(
            f"ADR-014 violation in {migration_path.name}: table "
            f"'{table_name}' is created without an RLS policy. "
            f"Every tenant-scoped table must enforce isolation at the "
            f"database layer, not in application-level query filters."
        )
    return violations

if __name__ == "__main__":
    migrations_dir = Path("db/migrations")
    all_violations = []
    for migration_file in migrations_dir.glob("*.sql"):
        all_violations.extend(check_migration_has_rls_policy(migration_file))

    if all_violations:
        for v in all_violations:
            print(v)
        sys.exit(1)
    print("All migrations satisfy the tenant isolation fitness function.")
```

Whatever the decision, the pattern is the same: write the ADR, then write the smallest automated check that would have caught the specific violation you're worried about.

**3. Task boundaries scoped to implementation, not invention.**
When an agent is handed a task, the task description should point at the ADR and the fitness function it must satisfy, not just describe the desired end-user behavior. "Add an `invoices` table for the billing feature, following ADR-014's tenant isolation model" is an implementation task with a checkable contract. "Add multi-tenant billing" is an invitation for the agent to invent an architecture, because nothing in the prompt tells it one already exists.

```
+-------------------+       +--------------------+       +--------------------+
|  Human decides:   |  -->  |  Agent implements:  |  -->  |  Fitness function  |
|  ADR-014, tenant   |       |  new table + code   |       |  + tests verify     |
|  isolation model    |       |  within that model  |       |  the decision was   |
+-------------------+       +--------------------+       |  actually followed  |
                                                          +--------------------+
```

Notice what this does *not* claim: it doesn't claim an agent can never contribute to an architectural decision. An agent can be genuinely useful for enumerating candidate options, listing known trade-offs for a pattern (shared-schema vs. schema-per-tenant vs. database-per-tenant, say), or drafting a first-pass ADR for a human to critique and correct. That's a legitimate, valuable use — closer to a research assistant surfacing options than to an accountable decision-maker choosing between them. The line isn't "agents contribute zero value to architecture." It's "the decision, and the accountability for it, stays with a human who can weigh inputs the agent structurally cannot see."

## What Can Go Wrong?

- **Delegating an underspecified request as if it were a bounded task.** "Make the backend scalable" or "add multi-tenancy" handed directly to an agent, with no ADR and no fitness function, produces *an* architecture — just not necessarily the one the business needs — and it will look exactly as clean and well-tested as one that was.
- **Treating a green test suite as proof the architecture is sound.** Tests verify behavior against the cases someone thought to write. They cannot verify that a chosen service boundary will age well, that a tenancy model survives a specific enterprise contract's audit, or that a synchronous call chain won't buckle under next year's traffic. Passing tests are necessary evidence of correctness at the implementation level; they are not evidence at the architecture level at all.
- **Architectural drift through many individually-reasonable agent PRs.** Each change looks locally sensible — a new endpoint here, a new table there — but without a human-owned structure and a fitness function catching violations, the aggregate drifts away from any coherent design.
- **Asking an agent to "review the architecture" and trusting the answer as if it came from someone accountable.** An agent can list plausible risks in a design — genuinely useful as a checklist generator — but it has no stake in the outcome and no visibility into the organizational inputs that would make one risk matter more than another for this specific business. Treat its output as a draft to interrogate, not a review to rely on.
- **Assuming the gap closes automatically as models improve.** Some of the gap is a current capability ceiling that may narrow. The oracle problem, the missing non-code inputs, and the accountability question are not benchmark scores — they're properties of what architecture decisions actually are. Don't build a process that bets the whole gap disappears next model generation.

## Security Considerations

Architecture is very often where an application's security posture is actually decided — trust boundaries, where authentication and authorization checks live, how secrets flow, how services are network-segmented — and the code-vs-architecture gap shows up here in a specific, recurring shape.

An agent implementing a feature without an architecturally-decided trust boundary tends to reproduce whatever pattern is most common in its training distribution and in the surrounding codebase: an inline auth check inside each new handler, a validation function copy-pasted at each new entry point, a secret read directly from an environment variable inside the function that needs it. Each of those, in isolation, might be fine. What's missing is the *decision* that authorization should be enforced at one place — a gateway, a middleware, a policy engine — rather than reimplemented, correctly or not, at every call site an agent happens to touch. That decision is architecture. The individual `if not user.has_permission(...)` check the agent writes inside a handler is code, and it can be perfectly correct at the point it's written while still being the wrong place for the check to live.

This is why the fitness-function pattern from the previous section matters as much for security as it does for anything else: a rule that fails CI when a new route handler doesn't route through the shared authorization middleware — instead of trusting every future agent-authored (or human-authored) PR to remember to call it — converts a security-relevant architectural decision into something that gets enforced whether or not the person or agent writing the next feature was thinking about it. The asset-threat-vulnerability chain used elsewhere for security analysis applies just as well here: the asset is the enforcement point's centrality, the threat is a new code path bypassing it, the vulnerability is "nothing checks for this," and the mitigation is a fitness function, not a code review comment asking someone to remember next time.

## Common Misconceptions

**Misconception:** A large enough context window will eventually let an agent design good architecture on its own.
**Reality:** A bigger context window helps an agent see more of what already exists in the repository. It does not give the agent access to information that was never written down — budget, contracts, team skill, political constraints — which is where a large share of real architectural trade-offs actually live. This is a different problem than retrieval, and scaling context doesn't touch it.

**Misconception:** If the AI-generated code passes tests and runs correctly in production, the underlying architecture must be sound.
**Reality:** Correctness and architectural soundness are different axes measured on different timescales. A test suite verifies the code does what it was written to do; it says nothing about whether the structure it's built on will hold up to next year's scale, next quarter's compliance audit, or a team twice the current size.

**Misconception:** Agents contribute nothing useful to architecture, so keep them entirely out of the conversation.
**Reality:** Agents can be genuinely useful for enumerating known trade-offs of established patterns, drafting a first-pass ADR, or surfacing risks in a proposed design for a human to critique. The distinction isn't "agents are useless here" — it's that the accountable decision, and the judgment about which inputs matter most for this specific business, stays with a human.

**Misconception:** This gap is a temporary capability ceiling that the next generation of models will close.
**Reality:** Some of it may narrow with better models. The parts rooted in missing non-code inputs, delayed feedback loops, and accountability are structural properties of what an architectural decision *is*, not a score on a benchmark.

## Real-World Architecture

This isn't a novel insight invented for the AI era — it's a generalization of a practice most mature engineering organizations already run for a narrower reason. Design review processes, architecture review boards, and formal frameworks like AWS's Well-Architected Framework all exist because organizations learned, the expensive way, that structural decisions need a deliberate human checkpoint *before* large amounts of implementation work get built on top of them — long before AI coding agents existed to make the implementation side faster. The AI-native version of this practice doesn't invent a new checkpoint; it makes the existing one more load-bearing, because the volume of implementation work that can now be produced against a bad decision, before anyone notices, is much higher than it used to be.

The fitness-function pattern shown above is likewise a generalization of an idea that predates agentic coding: automated architecture conformance checks — sometimes discussed in the industry under the umbrella of "evolutionary architecture" — have been used to keep large codebases structurally honest for years, independent of who or what is writing the code. What's new isn't the technique; it's how much more necessary it becomes once a meaningful share of the pull requests hitting that check were authored by something that can generate a plausible-looking violation of an unwritten rule in seconds, at any hour, without the hesitation a human might feel about touching an area they don't fully understand.

> **Verification Note**
> Specific claims about how any named organization structures its architecture review process, or which fitness-function tooling a specific company uses in production, should be sourced to that organization's own published engineering blog post rather than assumed from this description.

## Expert Insight

The engineers who get the most leverage out of AI coding agents right now aren't the ones who've found a clever prompt for "design me a scalable architecture." They're the ones who've stopped asking agents architectural questions at all, and instead spend their own time writing the ADRs, drawing the boundaries, and building the fitness functions that turn those decisions into something an agent can implement inside safely and quickly. The work didn't disappear — it moved up a level of abstraction, from "review every line" to "decide the structure and encode it as a constraint the agent can't quietly violate."

There's a useful, slightly uncomfortable corollary here, worth sitting with: as code generation gets cheaper and faster, the *relative* value of the architecture-decision skill goes up, not down. When implementation was the bottleneck, a mediocre architecture decision implemented slowly by a small team had time to get noticed and corrected before too much got built on top of it. When implementation is nearly free, a mediocre architecture decision gets fully built out — completely, consistently, and fast — before anyone has a chance to question it. The cost of a wrong structural decision hasn't gone down in the AI-native era. It's gone up, because the blast radius of building on top of it arrives faster.

## Try It Yourself

**Goal:** Practice separating an architectural decision from the implementation task that follows it, using a real feature from your own backlog.

**Starting Point:** Pick a real or realistic feature request phrased the way a product manager would actually phrase it — something like "let users export their data" or "support webhooks for third-party integrations."

**Task:**
1. List the structural decisions hiding inside that one-line request that nobody has made yet — for "let users export their data": synchronous or async export, where the export file lives and for how long, what format, whether export triggers a rate limit, what happens if the account is deleted mid-export.
2. Pick one of those decisions and write a short ADR for it: context, decision, consequences — three or four sentences each is enough.
3. Write one automated check (pseudocode is fine) that would fail if a future implementation violated that decision.
4. Rewrite the original feature request as a task an agent could safely implement: pointing at the ADR and the check, not re-describing the end-user behavior from scratch.

**Expected Result:** A short ADR, a sketch of a fitness function, and a task description that reads like an implementation instruction rather than an open-ended design brief.

**What You Learned:** How much architectural ambiguity was hiding inside a request that sounded, on its surface, like a straightforward coding task — and how little of that ambiguity would have been visible to an agent (or, honestly, to a rushed human) working from the original one-liner alone.

## Pause and Think

Suppose an agent is given a fully-specified task and produces two candidate implementations. Both compile, both pass every test in the suite, and both satisfy the written spec to the letter. Has the agent solved the architecture problem for this task?

### Answer

Not necessarily — and the fact that there are *two* valid-looking candidates is itself the tell. If both options pass every check you wrote, the thing distinguishing them is exactly the kind of trade-off a spec and a test suite structurally cannot capture: which one is cheaper to run at ten times the load, which one a team unfamiliar with the codebase can maintain more easily, which one keeps a door open for a product direction the roadmap is heading toward but hasn't committed to yet. Choosing between two implementations that are equally correct by every automatable measure is precisely what architectural judgment is *for*. An agent passing every check it was given hasn't closed that gap — it's revealed it, by handing you the choice that only a human, with visibility into inputs the spec never contained, can actually make well.

## Key Takeaways

- Code generation and architecture design are structurally different tasks: one has a fast, checkable oracle and mostly local scope; the other has a slow, delayed signal and depends on inputs that often exist nowhere in machine-readable form.
- AI coding agents are currently much better at the former because their entire operating loop — generate, test, retry — is built around tight feedback, which architecture decisions don't provide on any useful timescale.
- Letting an agent answer an underspecified, architecturally-loaded request produces *an* architecture, competently implemented, that nobody actually chose — and the failure surfaces months later, not in code review.
- The practical fix is a division of labor: humans own decisions and the inputs behind them, captured as ADRs; those decisions get encoded as automated fitness functions; agents implement against that checkable boundary rather than inventing a structure from a vague prompt.
- Security posture is frequently an architectural decision (where enforcement lives) wearing a code-level disguise (the individual check an agent writes) — the fitness-function pattern applies just as directly to security boundaries as to any other structural constraint.
- As code generation gets cheaper, the cost of a wrong architectural decision goes up, not down, because the blast radius of building on top of it arrives faster than a team's ability to notice and correct it.
