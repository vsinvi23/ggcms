---
title: "Distributed Transactions: The High Cost of Two-Phase Commit Across Shards"
description: "Why cross-shard transactions require Two-Phase Commit (2PC) to preserve ACID guarantees, how the Prepare/Commit protocol actually works, and why its blocking failure mode pushes modern distributed databases toward Sagas and Raft-driven alternatives."
type: "ARTICLE"
categorySlug: "databases"
articleType: "DEEP_DIVE"
tags:
  - "database-sharding"
  - "two-phase-commit"
  - "distributed-transactions"
  - "acid"
  - "sagas"
---

# Distributed Transactions: The High Cost of Two-Phase Commit Across Shards

## The Shard Boundary Isolation Problem

Database sharding is the standard approach for horizontally scaling transactional relational databases. By partitioning a massive table across multiple physical database instances (shards) using a shard key, databases can scale out writes and queries.

However, sharding introduces a massive bottleneck when transactions span shard boundaries. Consider a financial ledger split by `account_id` where Shard A holds Alice's account and Shard B holds Bob's account. If Alice transfers $100 to Bob, the database must debit Alice on Shard A and credit Bob on Shard B. This must execute atomically: either both operations succeed, or both fail. Failing to coordinate this successfully leads to money vanishing or appearing out of thin air, violating ACID guarantees.

## Mental Model: Two-Phase Voting Consensus

To preserve consistency across independent physical database servers, sharded engines utilize the Two-Phase Commit (2PC) protocol. The mental model is a coordinator orchestrating a democratic vote among participants (shards).

```text
Coordinator                  Shard A Participant            Shard B Participant
    |                                 |                             |
    |---- 1. PREPARE ---------------->|---------------------------->|
    |<--- 2. VOTE_COMMIT (Locks Held)-|-----------------------------| (Acquires Row Locks)
    |                                 |                             |
    |==== COORDINATOR CRASHES HERE (Locks stay blocked on Shards!) ===|
```

## Deep Architectural Internals of 2PC

### Phase 1: The Prepare Phase

1. **Initiation**: A client initiates a cross-shard transaction. The application connects to a Coordinator node, which assigns a unique global transaction ID and writes a record to its Write-Ahead Log (WAL).
2. **Voting Requests**: The Coordinator sends a `PREPARE` command to all participating shards (Shard A and Shard B).
3. **Local Locks**: Each participant starts a local transaction. It verifies constraints, writes undo/redo log blocks to disk, and acquires strict row-level write locks on the targeted records.
4. **Voting Response**: If a shard successfully secures its local locks and registers the write state, it replies to the coordinator with `VOTE_COMMIT`. If it fails (due to a lock timeout or conflict), it replies with `VOTE_ABORT`.

### Phase 2: The Commit Phase

1. **Decision**: The coordinator collects votes from all shards.
   - If all shards vote `VOTE_COMMIT`, the coordinator writes a `COMMIT` record to its WAL and broadcasts `COMMIT` to all shards.
   - If any shard votes `VOTE_ABORT` or if the coordinator's timer expires, it writes an `ABORT` record to its WAL and broadcasts `ROLLBACK`.
2. **Execution**: The participating shards receive the decision. They apply the write or abort the local transaction, release their row-level write locks, and send an `ACK` message back to the coordinator.

### The High Cost and Blocking Hazard

The design of 2PC makes it extremely expensive in sharded environments:

- **Latency Amplification**: A single-shard transaction requires only local writes. A cross-shard transaction requires multiple network round trips between coordinator and shards, increasing transaction latency from microseconds to hundreds of milliseconds.
- **The Locking Bottleneck**: Row-level locks on participant shards must be held continuously from the start of Phase 1 until the end of Phase 2. Since transactions take much longer to resolve, concurrent queries on those shards block, resulting in massive queue-ups.
- **The Blocking Hazard**: 2PC is a blocking protocol. If the coordinator crashes *after* participants have voted `VOTE_COMMIT` but *before* broadcasting the final commit decision, the participants are trapped. They cannot make a unilateral decision and must hold their row-level write locks indefinitely to prevent inconsistencies. This can cause cascading lock timeouts across the entire system.

## Pseudocode: Transaction Coordinator Lifecycle

The code snippet below illustrates the logic executed by a distributed database coordinator running 2PC:

```python
import uuid
import time

class TwoPhaseCommitCoordinator:
    def __init__(self, shards):
        self.shards = shards  # List of database shard clients
        self.wal = []         # Coordinator Write-Ahead Log

    def execute_transaction(self, tx_id, debit_shard, credit_shard, amount):
        # 1. Write initiation to coordinator WAL
        self.wal.append({"tx_id": tx_id, "state": "PREPARE_START"})

        votes = {}
        try:
            # Phase 1: Prepare
            for shard in [debit_shard, credit_shard]:
                prepared = shard.prepare(tx_id, amount)
                votes[shard.id] = "VOTE_COMMIT" if prepared else "VOTE_ABORT"
        except Exception:
            votes = {s.id: "VOTE_ABORT" for s in [debit_shard, credit_shard]}

        # Evaluate votes
        all_ok = all(v == "VOTE_COMMIT" for v in votes.values())
        decision = "COMMIT" if all_ok else "ABORT"

        # 2. Persist decision to coordinator WAL
        self.wal.append({"tx_id": tx_id, "state": decision})

        # Phase 2: Commit / Rollback
        for shard in [debit_shard, credit_shard]:
            if decision == "COMMIT":
                shard.commit(tx_id)
            else:
                shard.rollback(tx_id)

        self.wal.append({"tx_id": tx_id, "state": "DONE"})
        return decision == "COMMIT"
```

## Recovery: Why the Coordinator's WAL Matters

If the coordinator process itself crashes and restarts, it must be able to resume in-flight transactions rather than leave participants blocked forever. This is exactly why every phase transition is first durably written to the coordinator's Write-Ahead Log:

```text
Coordinator restarts -> reads WAL -> finds tx_id in state "COMMIT" but no "DONE" record
                      -> re-broadcasts COMMIT to all shards (idempotent) -> writes "DONE"
```

Participants must therefore make their `commit`/`rollback` handlers idempotent, since a recovering coordinator may resend the same decision more than once.

## Why Modern Systems Avoid 2PC

Because of this blocking bottleneck, modern distributed databases increasingly avoid classic 2PC for high-throughput paths, favoring:

- **Sagas**: A sequence of local transactions, each with a compensating action, that trades strict atomicity for availability — no cross-shard locks are held while waiting on other participants.
- **Raft-driven transaction groups**: Systems like CockroachDB and Google Spanner replace ad-hoc 2PC coordinators with a replicated consensus log, so a coordinator failure doesn't leave participants in an unrecoverable blocked state — a new leader can be elected and resume the decision.

## Conclusion

Two-Phase Commit is the textbook mechanism for enforcing atomicity across shard boundaries, but its correctness comes at the price of held locks and a genuine blocking failure mode when the coordinator dies mid-protocol. Understanding this trade-off is why production sharded systems reserve 2PC for rare, small cross-shard operations and reach for Sagas or Raft-based consensus for anything on the hot write path.
