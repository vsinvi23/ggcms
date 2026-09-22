# Distributed Transactions: The Latency and Blocking Costs of Two-Phase Commit (2PC) and Three-Phase Commit (3PC)

## The Problem: Atomicity Across Partitioned Data
When an application spans multiple databases or microservices, a single logical operation often requires modifying data in multiple places. If one modification succeeds while another fails, the system enters an inconsistent state. We need atomicity across distributed nodes. The intuitive approach is a distributed commit protocol, primarily the Two-Phase Commit (2PC). However, 2PC introduces severe blocking and latency issues in high-throughput systems.

## Two-Phase Commit (2PC) Architecture
2PC employs a centralized Coordinator to manage the transaction across multiple Participants (resource managers).

```text
[Coordinator]
   |  |  |
   v  v  v
[P1][P2][P3]
```

### Phase 1: Prepare
The Coordinator sends a `PREPARE` message to all participants. Each participant executes the transaction locally up to the point of committing. It writes to its undo/redo logs and locks the necessary resources. It then replies with `VOTE_COMMIT` or `VOTE_ABORT`.

### Phase 2: Commit / Rollback
If *all* participants vote to commit, the Coordinator writes a commit record to its own log and sends a `GLOBAL_COMMIT` message. If *any* participant votes to abort, or if a timeout occurs, it sends `GLOBAL_ABORT`. Participants commit or rollback accordingly and release locks.

### The Blocking Problem
2PC is a blocking protocol. 
1. **Synchronous Latency:** The coordinator must wait for the slowest participant. Latency is dictated by the maximum round-trip time plus the maximum local execution time.
2. **Coordinator Failure:** If the Coordinator crashes after participants have voted `VOTE_COMMIT` but before sending the global decision, participants are blocked. They hold locks on resources but cannot proceed because they do not know the global decision. 

## Three-Phase Commit (3PC)
3PC attempts to solve the blocking problem of 2PC by introducing an intermediate state, bounded timeouts, and a state where participants can independently decide to abort if the coordinator fails.

### The Phases
1. **CanCommit:** Coordinator asks participants if they can commit. (No locks held yet).
2. **PreCommit:** If all vote yes, Coordinator sends `PRECOMMIT`. Participants acknowledge and prepare to commit (holding locks).
3. **DoCommit:** Coordinator sends `DOCOMMIT`.

```text
Coordinator         Participant
  |--- CanCommit ---->|
  |<----- Yes --------|
  |--- PreCommit ---->| (Participant logs prepare, holds lock)
  |<------ ACK -------|
  |--- DoCommit ----->| (Participant commits, releases lock)
  |<------ Done ------|
```

### Why 3PC Failed in Practice
While 3PC avoids blocking on coordinator failure (participants can time out and abort during the PreCommit phase, or proceed if they received a PreCommit and a new coordinator takes over), it has fatal flaws:
1. **Network Partitions:** 3PC assumes a fail-stop model. In a network partition, a new coordinator might take over and decide to commit while the old one is isolated but alive. This leads to split-brain scenarios and data inconsistency.
2. **Excessive Latency:** 3PC requires 3 full network round trips instead of 2. In distributed systems, this latency penalty is unacceptable.

## Code Example: 2PC Coordinator Pseudocode
```python
def execute_2pc(transaction, participants):
    # Phase 1: Prepare
    votes = []
    for p in participants:
        vote = p.prepare(transaction)
        votes.append(vote)
    
    # Phase 2: Commit or Abort
    if all(v == VOTE_COMMIT for v in votes):
        write_wal("GLOBAL_COMMIT", transaction.id)
        for p in participants:
            p.commit(transaction.id)
    else:
        write_wal("GLOBAL_ABORT", transaction.id)
        for p in participants:
            p.abort(transaction.id)
```

## Conclusion
Due to the blocking nature of 2PC and the network partition vulnerability of 3PC, modern microservice architectures largely abandon distributed transactions. Instead, they embrace eventual consistency using patterns like the Saga pattern and asynchronous message queues with idempotency.
