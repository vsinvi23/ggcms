# Multi-Paxos Internals: Log Replication, Proposer Leaders, and Acceptor Majorities

## The Problem: Distributed State and Split-Brain

In distributed systems, maintaining a consistent state machine across multiple disparate nodes is a fundamental challenge. When network partitions occur, nodes may diverge, leading to a "split-brain" scenario where different segments of the cluster believe contradictory facts.

Basic Paxos solves the consensus problem for a single value. However, real-world systems (like databases and orchestrators) require an ordered sequence of agreed-upon values—a replicated log. Running basic Paxos for every single entry in a continuous log is computationally prohibitive, requiring a minimum of two round-trips (Prepare/Promise, Accept/Accepted) per value. 

Multi-Paxos optimizes this by electing a stable leader, reducing the consensus overhead for subsequent log entries to a single round-trip.

## Multi-Paxos Architecture

Multi-Paxos relies on three primary roles, though a single physical node often plays multiple roles:
1.  **Proposers:** Receive client requests and attempt to get them appended to the log.
2.  **Acceptors:** Vote on proposals. A majority (quorum) must agree for a value to be chosen.
3.  **Learners:** Execute the chosen values and apply them to the local state machine.

### The Optimization: Stable Leadership

In basic Paxos, the Phase 1 (Prepare) phase establishes a proposal number strictly higher than any seen before. In Multi-Paxos, a node runs Phase 1 for the *entire log* rather than a single slot. Once a Proposer wins Phase 1, it becomes the distinguished leader. 

For all subsequent client requests, the leader skips Phase 1 and immediately issues Phase 2 (Accept) messages. This reduces message complexity by 50% and dramatically increases throughput.

## ASCII Diagram: Multi-Paxos Message Flow

```text
[Client]        [Leader (Proposer)]      [Acceptor 1]      [Acceptor 2]
   │                    │                     │                 │
   │─── 1. Request ────▶│                     │                 │
   │                    │                     │                 │
   │                    │── 2. Accept(N, V) ─▶│                 │
   │                    │                     │                 │
   │                    │── 2. Accept(N, V) ───────────────────▶│
   │                    │                     │                 │
   │                    │◀── 3. Accepted ─────│                 │
   │                    │                     │                 │
   │                    │◀── 3. Accepted ───────────────────────│
   │                    │                     │                 │
   │◀── 4. Success ─────│ (Quorum Reached)    │                 │
```
*Note: Phase 1 is omitted here as it was run once during leader election.*

## Code Representation: The Acceptor State

An Acceptor must persistently store its state to survive crashes. It tracks the highest proposal number it has seen and the accepted values for each log index.

```python
from typing import Dict, Tuple

class Acceptor:
    def __init__(self):
        # The highest proposal number seen so far (across all log slots)
        self.min_proposal: int = 0
        
        # log_index -> (proposal_number, value)
        self.accepted_log: Dict[int, Tuple[int, str]] = {}

    def handle_prepare(self, proposal_num: int, log_index: int) -> dict:
        """Phase 1: Promise to ignore older proposals."""
        if proposal_num > self.min_proposal:
            self.min_proposal = proposal_num
            # Return any previously accepted value for this specific slot
            accepted_val = self.accepted_log.get(log_index)
            return {"status": "PROMISE", "accepted": accepted_val}
        return {"status": "REJECT"}

    def handle_accept(self, proposal_num: int, log_index: int, value: str) -> dict:
        """Phase 2: Accept the value if the proposal number is valid."""
        if proposal_num >= self.min_proposal:
            self.min_proposal = proposal_num
            self.accepted_log[log_index] = (proposal_num, value)
            return {"status": "ACCEPTED"}
        return {"status": "REJECT"}
```

## Failure Modes and Leader Election

If the distinguished leader crashes, the system halts processing new requests. A timeout triggers a new leader election. 

A surviving node notices the silence, increments its proposal number, and initiates Phase 1. If it gathers promises from a majority, it asserts leadership. However, it must first resolve any uncommitted log slots. The Phase 1 responses include the highest accepted values for uncommitted slots from the Acceptors. The new leader is obligated to drive these existing values to consensus before proposing new client requests.

## Conclusion

Multi-Paxos provides a robust mathematical foundation for strict consistency. By amortizing the cost of leader election over the lifetime of the leader, it achieves the throughput necessary for production distributed databases while surviving minority node failures without state corruption.
