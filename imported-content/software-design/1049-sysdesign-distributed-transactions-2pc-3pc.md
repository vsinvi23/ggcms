# Distributed Transactions: The Latency and Blocking Costs of Two-Phase Commit (2PC) and Three-Phase Commit (3PC)

## The Problem: Atomicity Across Distributed Boundaries

In a monolithic application, maintaining data integrity is straightforward: a single relational database provides ACID guarantees. When a transaction spans multiple tables, the database ensures that all mutations commit or abort atomically. 

However, in a microservices architecture or a distributed database, a single business operation often requires mutations across multiple independent databases. Without a distributed transaction protocol, partial failures lead to data inconsistencies. The challenge is ensuring atomicity across these boundaries without paralyzing the system with latency and blocking locks.

## Two-Phase Commit (2PC): The Blocking Coordinator

The Two-Phase Commit (2PC) protocol is the most fundamental approach to distributed transactions. It introduces a central **Transaction Coordinator (TC)** that orchestrates the commit process across multiple **Resource Managers (RMs)**.

### Architecture and Flow

The 2PC protocol operates in two distinct phases:

1. **Prepare Phase (Voting):**
   The TC sends a `PREPARE` message to all RMs. Each RM executes the transaction up to the point of committing, acquiring all necessary local locks. If successful, it replies `VOTE_COMMIT`. If an error occurs (e.g., uniqueness constraint violation), it replies `VOTE_ABORT`.
2. **Commit Phase (Completion):**
   - If the TC receives `VOTE_COMMIT` from *all* RMs, it logs the decision and sends a `GLOBAL_COMMIT` message to all RMs.
   - If the TC receives at least one `VOTE_ABORT` (or a timeout occurs), it sends a `GLOBAL_ABORT` message to all RMs.

```text
[Transaction Coordinator]
       |         |
    PREPARE   PREPARE
       v         v
     [RM1]     [RM2]
       |         |
   VOTE_YES  VOTE_YES
       v         v
[Transaction Coordinator] (Logs COMMIT)
       |         |
     COMMIT    COMMIT
       v         v
     [RM1]     [RM2]
       |         |
      ACK       ACK
```

### The Blocking Problem

While 2PC provides strong consistency, it suffers from severe operational drawbacks:

- **High Latency:** Every distributed transaction requires multiple network round trips and durable disk writes at each RM before locks can be released.
- **Single Point of Failure:** If the TC crashes after sending `PREPARE` but before sending `COMMIT`/`ABORT`, the RMs are blocked indefinitely. They cannot release their locks because they do not know the global decision. This "blocking state" halts all concurrent transactions contending for the same rows.
- **Synchronous Nature:** The protocol moves only as fast as the slowest node. 

## Three-Phase Commit (3PC): Mitigating Blocking with Timeouts

To address the blocking problem of 2PC, the Three-Phase Commit (3PC) protocol introduces an intermediate state and heavily relies on timeouts. The goal is to ensure that a non-faulty RM never blocks indefinitely waiting for a crashed TC.

### Architecture and Flow

3PC breaks the Commit phase into two steps:

1. **CanCommit Phase:**
   The TC asks RMs if they are ready to commit. RMs reply with `YES` or `NO` without locking resources extensively.
2. **PreCommit Phase:**
   If all RMs say `YES`, the TC sends a `PRECOMMIT` message. RMs acquire locks and prepare to commit, acknowledging with `ACK`. Crucially, if an RM is in this state, it knows that *all* RMs agreed to commit.
3. **DoCommit Phase:**
   Upon receiving all `ACK`s, the TC sends `DO_COMMIT`.

```text
[Transaction Coordinator]
       |
   CAN_COMMIT
       v
     [RMs] -> VOTE_YES
       |
   PRE_COMMIT
       v
     [RMs] -> ACK (Locks acquired, ready to commit)
       |
   DO_COMMIT
       v
     [RMs] -> DONE
```

### Fault Tolerance

3PC solves the blocking issue through state progression:
- If a TC crashes before `PRECOMMIT`, RMs time out and abort.
- If a TC crashes after `PRECOMMIT` but before `DO_COMMIT`, RMs time out and *commit anyway*, because reaching the `PRECOMMIT` state guarantees that all nodes originally voted `YES`.

### The Partition Problem

3PC assumes a synchronous network model with reliable timeouts. In reality, network partitions can wreak havoc. If a network partition isolates some RMs from the TC, one side of the partition might time out and abort, while the other side proceeds to commit based on a delayed `PRECOMMIT` message, violating consistency.

## Code Example: The Impact of Latency

Consider a distributed transaction across two PostgreSQL nodes. Using a 2PC coordinator (like Narayana or Atomikos) wraps the standard `XA` commands.

```java
// Pseudo-code for a 2PC transaction block
@Transactional
public void transferFunds(String accountA, String accountB, BigDecimal amount) {
    // RM1: Node A
    jdbcTemplateA.update("UPDATE accounts SET balance = balance - ? WHERE id = ?", amount, accountA);
    
    // RM2: Node B
    jdbcTemplateB.update("UPDATE accounts SET balance = balance + ? WHERE id = ?", amount, accountB);
    
    // The underlying framework issues XA PREPARE to Node A and Node B.
    // Locks on both 'accounts' rows are held across the network.
    // Then XA COMMIT is issued.
}
```
If the network RTT is 50ms, the rows remain locked for at least 150ms (Prepare + Network + Commit + Network), reducing throughput to less than 7 transactions per second per row. 

## Conclusion

Both 2PC and 3PC provide strong ACID guarantees at the cost of availability and performance. 2PC introduces a fatal blocking state, while 3PC mitigates blocking but falls prey to network partitions. In modern, high-throughput microservice architectures, these synchronous protocols are largely abandoned in favor of asynchronous, eventually consistent patterns like the Saga pattern, which trade strong atomicity for high availability and low latency.
