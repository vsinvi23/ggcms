---
title: "Multi-Paxos Internals: Stable Leaders and Replicated Log Consensus"
description: "How Multi-Paxos amortizes the two-round-trip cost of basic Paxos into a single round trip per log entry by electing a stable leader, with a working Python Acceptor implementation and the leader-failure recovery path."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "DEEP_DIVE"
tags:
  - "paxos"
  - "multi-paxos"
  - "consensus"
  - "distributed-systems"
  - "replicated-log"
  - "leader-election"
---

# Multi-Paxos Internals: Stable Leaders and Replicated Log Consensus

## The Problem: Consensus Per Value Is Too Expensive

Basic Paxos solves consensus for a single value: a Proposer runs a two-phase protocol — Prepare/Promise, then Accept/Accepted — and once a majority of Acceptors accept a value, it's permanently chosen. That's sufficient for agreeing on one fact once. Real systems — databases, orchestrators, distributed locks — need an ordered, continuously growing **replicated log** of agreed-upon values, not a single decision.

Running full basic Paxos independently for every log entry means paying two full network round trips (Prepare/Promise, then Accept/Accepted) *per entry*. At production throughput, that overhead is prohibitive. **Multi-Paxos** amortizes this cost by electing one Proposer as a stable leader for an extended period, so that only the *first* entry after an election pays for Phase 1 — every subsequent entry skips straight to Phase 2.

## Multi-Paxos Roles

- **Proposers** — receive client requests and attempt to get them appended to the replicated log.
- **Acceptors** — vote on proposals; a majority (quorum) must agree before a value is considered chosen.
- **Learners** — apply chosen values to their local state machine.

A single physical node commonly plays more than one of these roles simultaneously.

## The Optimization: Stable Leadership

In basic Paxos, Phase 1 establishes a proposal number higher than any seen before, scoped to a *single* value. In Multi-Paxos, a Proposer runs Phase 1 once for the **entire log** rather than per-entry. Whichever Proposer wins that Phase 1 becomes the distinguished leader for as long as it stays alive and reachable. Every subsequent client request skips Phase 1 entirely and goes straight to Phase 2 (Accept) — cutting message complexity, and therefore latency, roughly in half.

## Message Flow

```text
[Client]        [Leader (Proposer)]      [Acceptor 1]      [Acceptor 2]
   │                    │                     │                 │
   │─── 1. Request ────▶│                     │                 │
   │                    │                     │                 │
   │                    │── 2. Accept(N, V) ─▶│                 │
   │                    │── 2. Accept(N, V) ───────────────────▶│
   │                    │                     │                 │
   │                    │◀── 3. Accepted ─────│                 │
   │                    │◀── 3. Accepted ───────────────────────│
   │                    │                     │                 │
   │◀── 4. Success ─────│ (quorum reached)    │                 │
```

*(Phase 1 is omitted from this flow entirely — it ran once, during leader election, and covers every entry the leader proposes afterward.)*

## Implementation: The Acceptor's Persistent State

An Acceptor must survive crashes without forgetting what it has already promised or accepted — that durability is what gives Paxos its safety guarantee. It tracks the highest proposal number it has seen, plus the accepted `(proposal_number, value)` pair for each log slot.

```python
from typing import Dict, Tuple

class Acceptor:
    def __init__(self):
        # Highest proposal number seen so far, across all log slots.
        self.min_proposal: int = 0

        # log_index -> (proposal_number, value)
        self.accepted_log: Dict[int, Tuple[int, str]] = {}

    def handle_prepare(self, proposal_num: int, log_index: int) -> dict:
        """Phase 1: promise to ignore any proposal numbered lower than this one."""
        if proposal_num > self.min_proposal:
            self.min_proposal = proposal_num
            # Surface any value already accepted for this slot, so a new
            # leader can safely re-propose it instead of overwriting it.
            accepted_val = self.accepted_log.get(log_index)
            return {"status": "PROMISE", "accepted": accepted_val}
        return {"status": "REJECT"}

    def handle_accept(self, proposal_num: int, log_index: int, value: str) -> dict:
        """Phase 2: accept the value if the proposal number is still valid."""
        if proposal_num >= self.min_proposal:
            self.min_proposal = proposal_num
            self.accepted_log[log_index] = (proposal_num, value)
            return {"status": "ACCEPTED"}
        return {"status": "REJECT"}
```

```python
class Proposer:
    def __init__(self, proposer_id: int, acceptors: list["Acceptor"]):
        self.proposer_id = proposer_id
        self.acceptors = acceptors
        self.proposal_counter = 0
        self.is_leader = False

    def run_phase1_for_leadership(self) -> bool:
        """Run once, to become the stable leader for all subsequent entries."""
        self.proposal_counter += 1
        promises = [a.handle_prepare(self.proposal_counter, log_index=-1) for a in self.acceptors]
        quorum = len(self.acceptors) // 2 + 1
        accepted_count = sum(1 for p in promises if p["status"] == "PROMISE")
        self.is_leader = accepted_count >= quorum
        return self.is_leader

    def propose(self, log_index: int, value: str) -> bool:
        """Phase 2 only — skips Phase 1 entirely because we're already leader."""
        if not self.is_leader:
            raise RuntimeError("must win Phase 1 before proposing entries")

        results = [a.handle_accept(self.proposal_counter, log_index, value) for a in self.acceptors]
        quorum = len(self.acceptors) // 2 + 1
        accepted_count = sum(1 for r in results if r["status"] == "ACCEPTED")
        return accepted_count >= quorum
```

## Failure Modes and Leader Election

If the distinguished leader crashes, the system stalls: no new entries get proposed until a new leader emerges. A surviving Proposer notices the silence via a missed heartbeat, increments its proposal number, and runs Phase 1 across the Acceptors. If it gathers promises from a majority, it becomes the new leader.

Critically, the Phase 1 responses include any *already-accepted* values for uncommitted log slots (that's exactly what `accepted_log.get(log_index)` returns above). The new leader must re-propose and drive those existing, possibly-uncommitted values to consensus **before** accepting any new client requests — otherwise it could silently overwrite a value a previous leader had already gotten a majority to accept, which would break Paxos's core safety guarantee.

## Conclusion

Multi-Paxos gives production distributed databases the throughput they need by amortizing leader-election cost over the leader's entire tenure, while still surviving minority node failures without state corruption. The mechanics — Prepare/Promise once, then Accept/Accepted repeatedly — are exactly what Raft's leader-election-plus-log-replication model was designed to make easier to reason about; Multi-Paxos and Raft solve the same replicated-log problem, but Multi-Paxos exposes the underlying Proposer/Acceptor/Learner roles explicitly rather than hiding them behind Raft's more prescriptive election and heartbeat protocol.
