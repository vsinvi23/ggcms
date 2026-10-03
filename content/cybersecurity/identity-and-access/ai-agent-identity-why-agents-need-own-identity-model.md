---
title: "AI Agent Identity: Why Agents Need Their Own Identity Model"
description: "Why a shared service account and raw user-token impersonation both fail as identity models for an AI agent, and how a composite delegation model (persistent agent identity + signed delegation chain + task-scoped grant) fixes the confused-deputy problem."
categorySlug: "identity-access"
articleType: "DEEP_DIVE"
tags:
  - "ai-agents"
  - "agent-identity"
  - "oauth"
  - "oidc"
  - "delegation"
  - "non-human-identity"
  - "zero-trust"
  - "confused-deputy"
  - "token-exchange"
---

# AI Agent Identity: Why Agents Need Their Own Identity Model

> By the end of this article you'll be able to explain, precisely, why "give the agent a service account" and "let the agent act as the user" both eventually break in production — and what a correct agent identity model has to represent instead.

## The Problem

Say you've just wired an AI agent into your support tooling. It reads a customer's ticket, decides it needs to check their subscription status, calls your billing API, and drafts a refund. Somewhere in that chain, a very old question resurfaces in a form your identity system was never built to answer: **when the billing API receives this request, who is it actually talking to?**

Three candidate answers exist, and every team that ships an agent picks one, usually without meaning to.

1. **"It's the agent."** You issue the agent a service account or an API key, the same way you would for a cron job or a backend microservice. The billing API sees a machine principal — `support-agent-prod` — and grants it whatever the automation needs.
2. **"It's the user."** The agent is handed the logged-in customer-service rep's session token or OAuth access token and calls the API exactly as that human would.
3. Something else — a model that captures *both* who authorized the action and what is actually executing it.

Most teams start at (1) or (2), because both feel like reusing infrastructure you already trust. Both work fine in a demo. Both fail in ways that are specific to what an agent actually is: a piece of software that decides its own next action based on unstructured input, at a speed and volume no human review process can keep up with, and — critically — whose "next action" can be manipulated by content it merely *reads*, via prompt injection. That last property is the one that breaks the two easy answers, and it's worth sitting with before we get to the fix.

## Why This Problem Is Difficult

**A service account can't say who asked for this, right now.** Traditional service accounts model a static trust relationship: "this batch job is allowed to write to this table," decided once, at deployment time, by a human who reviewed the code. An agent's actions aren't decided at deployment time — they're decided per request, by a model reacting to a prompt, a retrieved document, or a tool result. If the agent's entire identity is a shared `support-agent-prod` credential, every action it takes is indistinguishable from every other action it has ever taken or ever will take. You cannot answer "did the rep actually ask for a refund on this account, or did the model just decide to issue one after reading a cleverly worded ticket?" The credential doesn't carry that context, because it was never designed to.

**Impersonation solves that and breaks something else.** Handing the agent the human's own token looks like it fixes the traceability problem — every downstream call is now stamped with the real user's identity, so audit logs look normal. But this is exactly the **confused deputy** problem — a term coined by Norm Hardy in 1988, nearly four decades old and freshly relevant: a program with more authority than the entity actually asking of it, tricked into misusing that authority. The billing API can no longer distinguish "the rep clicked refund" from "a prompt-injected instruction inside the ticket text told the agent to issue one." Worse, the agent now holds everything the human's token holds — if the rep can also void invoices, escalate accounts, or export PII, so can anything that successfully manipulates the agent, for as long as that token stays valid. The blast radius of a single successful prompt injection stops being "whatever this one API call does" and becomes "whatever the impersonated human is allowed to do, anywhere."

**And an agent's own lifecycle doesn't look like a human's or a static service's.** A human logs in once and works for hours. A cron job boots with one fixed identity and does one fixed thing. An agent can spawn sub-agents mid-task, each needing to call different tools with different scopes; it can be paused and resumed; a single user request can fan out into a dozen tool calls executed in parallel, each of which should probably not be as powerful as the whole. Neither the human session model nor the static service-account model was built with that shape of work in mind.

None of this means agents need an entirely new protocol stack. OAuth 2.0, OIDC, and token exchange (RFC 8693) already have the vocabulary for delegation — `actor`, `subject`, scoped grants. What's missing in most systems isn't the protocol, it's the *decision* to actually model the agent as a first-class principal instead of squeezing it into "service account" or "the user" as an afterthought.

## A Simple Mental Model

Think of an employee who needs a physical work order to enter a restricted part of a building.

- Their **employee badge** proves who *they* are — issued once, tied to them personally, revocable if they leave the company. It doesn't, by itself, authorize them to enter the server room.
- A **work order**, signed by their manager, says: "Badge #4471 is authorized to enter Server Room B, today, between 2 and 4 PM, to replace disk 7." It names the specific badge, the specific authorizer, and a scope that expires.
- Security at the door checks both. The badge alone gets you nothing. A work order without a valid badge attached to it gets you nothing either.

An agent identity model needs the same two things, plus one more the badge analogy doesn't quite capture: the badge itself should usually be *narrower* than a full employee's badge — more like a **contractor's badge**, provisioned for this engagement, with its own expiry, that a full-time badge system was never designed to hand out.

This analogy breaks down in one place worth naming: a human employee is one continuous entity across every work order they ever execute. An agent is frequently *not* — it can be re-instantiated per task, spawn short-lived sub-agents, and hold no continuous "self" between requests at all. Keep that difference in mind; it's the reason agent identity has to be more granular than human identity, not just a copy of it.

## Before We Continue

This article assumes you're comfortable with:

- The four OAuth actors — resource owner, client, authorization server, resource server — and roughly how the client credentials grant works for machine-to-machine calls.
- The difference between authentication and authorization, and between an access token and a refresh token.
- What an AI agent is, as distinct from a chatbot or a fixed workflow: something that reasons over a goal, chooses tools, and acts on the results of those tools without a human approving every step.

## The Core Idea

A workable agent identity model has to represent three distinct things, and it has to represent all three *simultaneously*, on every request the agent makes:

1. **A persistent agent identity** — a credential that identifies *this agent* (or this class of agent), independent of any particular user or task. It has its own lifecycle: it can be issued, rotated, and revoked without touching any human's account. This is what lets you answer "which piece of software made this call" and "kill this agent's access without logging out every human who ever used it."
2. **A delegation chain back to whoever authorized this specific action** — a human user, another service, or (in a multi-agent system) a parent agent. This is what lets a downstream system tell "the rep asked for this refund" apart from "the model decided to issue one on its own." Crucially, this chain has to be *cryptographically carried with the request*, not just written to a log somewhere the agent could also tamper with.
3. **A scope that's bound to the task, not the agent's full capability set** — the permissions attached to this particular action should be the narrowest set that lets the task complete, valid for the shortest useful time. The agent's own identity might be *capable* of far more (it may be the same agent code used across a hundred different customer accounts), but any single execution should hold only what this one task needs.

Miss any one of the three and a specific class of failure reappears. Drop (1) and you can't tell which piece of software acted, or revoke it independently. Drop (2) and you've recreated the confused-deputy problem — a powerful actor with no record of who told it to act. Drop (3) and a single compromised or manipulated agent run inherits everything the agent could ever possibly do, instead of just what this task needed.

## How It Actually Works

Concretely, this usually looks like three credential-issuing steps chained together, not three parallel logins. Here's the shape of the flow when a human-initiated task reaches an agent that then calls a downstream API:

```
Human User        Application /      Identity Provider /      AI Agent          Downstream
                   Orchestrator       Auth Server                                Resource Server
    |                    |                    |                    |                    |
    |-- Authenticate,--->|                    |                    |                    |
    |   request task     |                    |                    |                    |
    |                    |-- Exchange user's ->|                    |                    |
    |                    |   token + agent's  |                    |                    |
    |                    |   client identity  |                    |                    |
    |                    |   for delegated,   |                    |                    |
    |                    |   downscoped token |                    |                    |
    |                    |                    |-- Verify agent's   |                    |
    |                    |                    |   own credential   |                    |
    |                    |                    |   (client auth)    |                    |
    |                    |                    |-- Verify user's    |                    |
    |                    |                    |   authenticated    |                    |
    |                    |                    |   session (subject)|                    |
    |                    |                    |-- Downscope to     |                    |
    |                    |                    |   task permissions |                    |
    |                    |<-- Issue token: ----|                    |                    |
    |                    |   sub=user,        |                    |                    |
    |                    |   actor=agent,     |                    |                    |
    |                    |   scope=task       |                    |                    |
    |                    |-- Hand agent the ------------------------>|                    |
    |                    |   delegated token  |                    |                    |
    |                    |   for this task    |                    |                    |
    |                    |                    |                    |-- Call API, ------->|
    |                    |                    |                    |   present token     |
    |                    |                    |                    |                    |-- Validate
    |                    |                    |                    |                    |   signature,
    |                    |                    |                    |                    |   subject,
    |                    |                    |                    |                    |   actor,
    |                    |                    |                    |                    |   scope, exp
    |                    |                    |                    |<-- Return result --|
    |                    |                    |                    |   (or deny + log    |
    |                    |                    |                    |    if insufficient) |
    |                    |<-- Report result --------------------------|                    |
```

Walk through what each hop is actually proving:

- The agent's own client credential — a client secret, a signed JWT, or an mTLS certificate, anything that isn't "borrow the user's token" — is what authenticates it to the identity provider **as itself**, whether the agent presents that credential directly or the application/orchestrator performs the token-exchange call on its behalf using it (the diagram above shows the latter, which is the more common shape in practice: the orchestrator hosts the agent runtime and holds its client credential). Either way, this is what establishes identity element (1).
- The identity provider also has the user's authenticated context available — because the user started this task through an application the IdP already trusts. The token it issues carries *both*: a `sub` (subject) claim identifying the human on whose behalf this is happening, and an `act` (actor) claim identifying the agent that is actually going to make the call. This satisfies (2) — the delegation chain is baked into the token itself, not reconstructed from separate logs after the fact.
- The scope on that issued token isn't the union of everything the user can do and everything the agent can do. It's deliberately narrower — restricted to what *this task* requires. That's (3).
- The downstream API validates all three at once: is the signature valid, is the actor a recognized agent identity, is the subject a real delegating user, and is the requested operation inside the granted scope? If a prompt-injected instruction tries to make the agent call an endpoint outside that scope, the resource server rejects it — not because the agent "decided" not to, but because the token it's holding literally doesn't grant it.

This maps directly onto OAuth 2.0 Token Exchange (RFC 8693)'s vocabulary: `subject_token`, `actor_token`, and a downscoped result. Agent identity isn't a new protocol — it's an application of delegation semantics that already existed, applied deliberately instead of skipped.

## Let's Walk Through an Example

A procurement agent is asked by an employee, Maria, to "reorder the office coffee supplies from our usual vendor." To do that it needs to call an internal purchasing API that can place orders up to a configured dollar limit.

**With the service-account model:** the agent authenticates as `procurement-agent-prod`, a static identity with a standing grant to place orders up to $5,000 (set generously, because nobody wants to redeploy config every time a new use case comes up). Every order this agent has ever placed, for every employee who has ever asked it to, looks identical in the purchasing system's logs — one principal. If a manipulated document (say, a vendor invoice the agent was asked to summarize) contains a hidden instruction to "also reorder 200 units of X from vendor Y," the agent has every bit as much standing authority to do that as it does to fill Maria's actual request.

**With the impersonation model:** the agent uses Maria's own SSO token. If Maria happens to also have approval authority for capital purchases well above $5,000 — a permission she has for an unrelated part of her job — the agent now holds that too, for this task, because it's simply presenting her token. A successful prompt injection here doesn't just place an unwanted coffee order; it can approve anything Maria personally could.

**With the composite model:** the agent authenticates as itself (its own client identity, `procurement-agent`), the token issued for this task carries `sub: maria@company.com`, `act: procurement-agent`, and `scope: purchase:office-supplies:<=250`. The purchasing API can see exactly who asked, exactly what executed the request, and exactly how far that specific request is allowed to reach — a scope that doesn't extend to capital purchases even though Maria personally could approve those in a different context. An injected instruction to reorder something outside `office-supplies` or over the dollar cap simply doesn't have a valid grant to act on — the resource server rejects it regardless of what the model "decided."

The difference isn't that the third model is unhackable. It's that the *blast radius* of a successful manipulation is bounded by the task's scope instead of by everything the agent or the human could ever do.

## Under the Hood

None of the three elements above require inventing new cryptography. They map onto familiar primitives:

| Requirement | Familiar primitive |
|---|---|
| Persistent agent identity | A distinct OAuth client (its own `client_id`/credential — client secret, private-key JWT, or mTLS cert), or a SPIFFE/SPIRE workload identity (SVID) issued to the agent's runtime |
| Delegation chain | RFC 8693 Token Exchange's `subject_token` / `actor_token` pattern, surfaced as `sub` and `act` claims in the issued token |
| Task-scoped, short-lived grant | Ordinary OAuth scopes, deliberately narrowed per task, with a short `exp` — the same downscoping logic behind the client credentials grant, just applied per-request instead of per-deployment |

A minimal issued token for the procurement example might carry claims like this (illustrative, not a full implementation):

```json
{
  "iss": "https://idp.company.internal",
  "sub": "maria@company.com",
  "act": {
    "sub": "procurement-agent",
    "agent_instance_id": "run_7f2a9c",
    "attested_build_hash": "sha256:8f43...e1bb"
  },
  "aud": "https://api.company.internal/purchasing",
  "scope": "purchase:office-supplies",
  "purchase_limit_usd": 250,
  "exp": 1751234567
}
```

Notice what each field is doing: `sub` is the human who is accountable for having triggered this; `act` is the machine that executed it, plus optional attestation data (a hash of the running agent build — this is the "prove the workload wasn't tampered with" piece that SPIFFE-style workload identity contributes); `scope` and `purchase_limit_usd` are the task-bound ceiling; `exp` keeps the whole thing short-lived so a leaked token doesn't stay dangerous for long. A resource server that only checks `scope` and ignores `act` has quietly reverted to the impersonation model without anyone deciding that on purpose — which is a real and common implementation mistake, not a hypothetical one.

## What Can Go Wrong?

- **The "service account" trap re-emerges by omission.** A team adopts token exchange correctly for the main agent, but a sub-agent or background retry path falls back to a long-lived static credential "just for this one internal call." Now there's a second, unscoped identity model living inside the same system, and it's the one an attacker will find first.
- **Delegation claims are trusted without verifying the chain is intact.** If a resource server checks that an `act` claim exists but never verifies it was signed by a trusted issuer, an attacker can forge a plausible-looking actor claim and get all the appearance of accountability with none of the substance.
- **Scopes get union'd instead of narrowed.** Under time pressure, it's tempting to grant an agent "everything the union of its possible tasks might need" once, rather than issuing a fresh downscoped token per task. This quietly turns model (3) back into model (1).
- **Sub-agent explosion outruns identity provisioning.** A swarm architecture spawns dozens of short-lived sub-agents per request. If each needs a manually provisioned client identity, teams under-provision and share credentials across sub-agents "temporarily" — which becomes permanent.
- **Revocation isn't actually tested.** Teams build the issuance path (agent gets a token) far more carefully than the revocation path (kill this one agent's ability to get new tokens, right now, without touching the human's account). The first outage or compromised-agent incident is usually when someone discovers revocation was never wired up.

## Security Considerations

Map this back to the standard chain: **Asset** (downstream data and actions the agent can reach) → **Threat** (a prompt-injected or otherwise manipulated agent issuing unauthorized calls) → **Vulnerability** (an identity model that can't distinguish "the human asked for this" from "the model decided to do this," or that grants more scope than the task needs) → **Impact** (unauthorized transactions, data exfiltration, or actions that are hard to attribute and harder to undo) → **Mitigation** (the three-part composite identity above, enforced at the resource server, not just requested by the agent) → **Residual risk** (a resource server that trusts an unverified `act` claim, or a delegation chain that's correct but still overscoped, is still exploitable — identity is necessary, not sufficient, defense).

A few things worth calling out explicitly:

- **Least privilege has to be evaluated per task, not per agent.** "This agent is generally trustworthy" is not the same claim as "this specific execution should be allowed to do this specific thing," and only the second one is what actually limits damage.
- **Revocation needs to operate at the agent-identity layer independently of the human layer.** If the only way to stop a misbehaving agent is to disable the human user's account, you don't have agent identity — you have impersonation with extra steps.
- **The delegation chain is part of your audit trail, and it has to be tamper-evident.** A log entry saying "agent X acted for user Y" is much weaker than a cryptographically signed token carrying that claim, because the log can be edited after the fact by anyone with write access to it; the signed claim can't be, without invalidating the signature.
- **Attestation matters more for agents than it did for typical service accounts**, because an agent's *behavior* is the thing an attacker is trying to steer, not just its network access. Proving which build of the agent is running (a hash, a signed image reference) closes a gap that identity alone — knowing "it's `procurement-agent`" — doesn't close by itself.

## Common Misconceptions

**Misconception:** "A service account is a form of agent identity — we already have this covered."
**Reality:** A service account gives you element (1) at best. It says nothing about who authorized a specific action or what scope that action should be limited to, which is exactly the part that limits blast radius.

**Misconception:** "Passing the user's token through to the agent is simpler and still secure, because it's still the user's real token."
**Reality:** Validity isn't the problem — authority is. A real, validly signed, unexpired user token handed to an agent gives the agent everything that token grants, for as long as it's valid, regardless of whether the agent's current task needs a fraction of that.

**Misconception:** "If we log which agent made each call, we have an audit trail."
**Reality:** A log entry is evidence after the fact and only as trustworthy as whoever controls the logging pipeline. A signed delegation claim inside the token itself is enforceable *before* the action happens and can't be quietly edited afterward.

**Misconception:** "Agent identity is only a concern for consumer-facing or high-stakes agents."
**Reality:** Internal tooling agents — the coding agent with repo write access, the procurement agent, the internal support agent — are exactly where teams skip this, because "it's internal" feels lower-risk. The confused-deputy and blast-radius problems don't care whether the API is internal.

## Real-World Architecture

In practice, this composite model shows up as a layer sitting in front of whatever APIs the agent calls — sometimes called an agent gateway, an identity-aware proxy, or simply "the token exchange service" — rather than something every downstream API has to reimplement individually. The gateway is the component that holds the agent's own client credential, performs the token exchange against the identity provider, attaches the delegation and scope claims, and forwards the resulting short-lived token onward. Individual resource servers then only need to validate a token the way they'd validate any OAuth-protected request — checking signature, audience, scope, and (new) the `act` claim — rather than each inventing its own notion of "agent."

For workload-level identity specifically (proving *which running process* is making the request, distinct from which OAuth client it's using), Zero Trust workload-identity frameworks like SPIFFE/SPIRE are a natural fit, because they were built to answer exactly that question for service-to-service traffic before agents existed — an agent's runtime is, from the platform's point of view, just another workload that needs an attested identity.

> **Verification Note**
> Several identity vendors and platforms have begun shipping first-class "agent identity" primitives as a distinct principal type, separate from human users and traditional service accounts, and there is active standards-track work (within the OAuth working group and related efforts) on delegation and authorization patterns specifically for AI agents. Concrete product names, exact claim formats, and draft-specification status change quickly in this space — verify current vendor documentation and the latest IETF drafts before treating any specific implementation as settled practice.

## Expert Insight

Teams that get this right almost never build it as a bolt-on to an existing service-account system — they treat "agent" as a new principal *type* in their identity provider from the start, alongside "user" and "service," each with its own lifecycle rules (agents get short default token lifetimes and mandatory scope narrowing; users get session-based auth; services get long-lived but narrowly scoped credentials). Retrofitting agent semantics onto a service-account table that was designed for cron jobs is where most of the "we thought we had this covered" incidents come from — the schema simply has nowhere to put a delegation chain, so someone drops it, quietly, under a deadline.

The other pattern worth knowing: the hardest part in production usually isn't the identity provider's token-issuance logic — it's getting every downstream resource server to actually *check* the `act` claim and scope instead of just checking "is this signature valid." Identity models fail silently at the enforcement point far more often than they fail at the design stage.

## Pause and Think

A multi-agent system lets a top-level agent spawn sub-agents to parallelize work — a research agent spawns three sub-agents to check different data sources. Each sub-agent needs to call an external API. What should the delegation chain look like for one of those sub-agents' requests: should it point back to the original human user, to the parent agent, or both?

### Answer

Both, and the order matters. The resource server ultimately needs to know the original accountable human (`sub`, unchanged all the way down the chain) *and* the immediate actor that made this specific call (the sub-agent) *and*, ideally, the fact that the sub-agent itself was spawned by a parent agent rather than directly by the human. RFC 8693's actor chaining supports exactly this: nested `act` claims, where each hop's actor becomes the subject of the next delegation. Collapsing the chain down to just "the human" loses the ability to scope or revoke one runaway sub-agent independently of its siblings; collapsing it down to just "the immediate sub-agent" loses accountability back to who actually asked for the work in the first place. A well-designed system keeps the full chain and lets each resource server decide how much of it, and which scope constraints, it actually needs to enforce.

## Key Takeaways

- A shared service account can't distinguish one agent action from another, or answer "who authorized this specific call" — it gives you identity without delegation.
- Letting an agent act as the user recreates the confused-deputy problem: a manipulated agent inherits everything the impersonated human could do, for as long as that token is valid.
- A correct agent identity model represents three things at once: a persistent agent identity, a signed delegation chain back to whoever authorized the action, and a scope narrowed to the specific task rather than the agent's full capability.
- These map onto primitives you likely already know: a distinct client credential or workload identity, RFC 8693-style `sub`/`act` claims, and ordinary OAuth scopes applied per-task instead of per-deployment.
- The identity model only helps if resource servers actually enforce the delegation claim and scope — logging it after the fact, or trusting an unverified claim, is not the same as enforcing it.
- Agents introduce lifecycle demands human identity and static service accounts don't: ephemeral sub-agents, machine-speed token rotation, and delegation chains that can nest more than one level deep.
