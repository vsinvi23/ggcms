---
title: "Cassandra Lightweight Transactions: Linearizable Consistency with Paxos"
description: "How Cassandra's Lightweight Transactions (LWT) use a four-phase Paxos consensus protocol to provide compare-and-set semantics on top of a normally eventually-consistent, masterless write path."
type: "ARTICLE"
categorySlug: "databases"
articleType: "DEEP_DIVE"
tags:
  - "cassandra"
  - "lightweight-transactions"
  - "paxos"
  - "linearizability"
  - "compare-and-set"
  - "cql"
---

# Cassandra Lightweight Transactions: Linearizable Consistency with Paxos

## The Race Condition and Masterless Paradox

Apache Cassandra's primary design goal is high-throughput write scalability and eventual consistency. Operating as a masterless peer-to-peer system, it relies on a last-write-wins (LWW) resolution policy using client-side timestamps. Replicas accept writes independently, and data is synced across nodes asynchronously.

This design presents a major challenge when transactions require absolute serializability. For example, if two concurrent clients attempt to register the exact same username (`alice`), or if an application executes a bank debit only if the account balance remains positive:

```sql
UPDATE accounts SET balance = balance - 50 WHERE user_id = 1 IF balance >= 50;
```

Cassandra's eventual consistency model cannot prevent race conditions here. Two coordinators might accept the conflicting writes simultaneously, leading to double-allocation of resources or negative balances.

## Mental Model: Paxos Consensus within Cassandra

To support single-key linearizable consistency, Cassandra integrates Paxos consensus directly into its write path as Lightweight Transactions (LWT). This bypasses the need for external coordination platforms like ZooKeeper or Consul.

```text
 Coordinator                      Replica 1        Replica 2        Replica 3
      |                               |                |                |
      |------ 1. Prepare ------------>|----------------|--------------->|
      |<----- 2. Promise (State) -----|----------------|----------------| (Quorum)
      |                               |                |                |
      |------ 3. Propose (Value) ---->|----------------|--------------->|
      |<----- 4. Accept --------------|----------------|----------------| (Quorum)
      |                               |                |                |
      |------ 5. Commit ------------->|----------------|--------------->|
```

The coordinator node acts as a Paxos proposer, driving consensus across replicas to agree on a single, ordered write event before executing it.

## The 4-Phase Paxos Protocol Internals

Standard eventual Cassandra writes require a single round trip to achieve quorum. In contrast, Cassandra LWT executes in four distinct round-trip phases between the coordinator and replicas:

### Phase 1: Prepare and Promise

The coordinator generates a globally unique, monotonically increasing proposal number (based on a UUID). It broadcasts this proposal number to all replicas in a `PREPARE` request. Replicas evaluate the proposal:

- If the proposal number is higher than any proposal they have previously seen, they return a `PROMISE` not to accept any older proposals.
- Along with the promise, replicas return their most recently accepted proposal number and value.

### Phase 2: Read and Resolve (Read-Repair)

If the replicas return conflicting values from Phase 1, it means a previous Paxos execution was interrupted or failed to commit. Before proceeding with the new transaction, the coordinator must resolve this drift. It selects the highest-numbered accepted proposal returned by the replicas and runs a fast commit across the cluster to align all nodes to that state.

### Phase 3: Propose and Accept

The coordinator evaluates the conditional check (e.g., `IF balance >= 50`). If the condition is met, the coordinator proposes its new update value with its original proposal number to all replicas. Replicas accept the proposal if they haven't promised to honor a higher proposal number in the interim, writing the value to a temporary Paxos storage table and returning an acknowledgement.

### Phase 4: Commit and Persist

If a quorum of replicas accepts the proposal, the coordinator broadcasts a `COMMIT` signal. Replicas receive this signal, finalize the update, write the value to their standard Memtables, and purge the temporary Paxos metadata.

## Schema Definition and CQL Examples

Below is a Cassandra schema and operational CQL queries leveraging Lightweight Transactions:

```sql
-- Create our bank accounts table
CREATE TABLE bank_accounts (
    user_id UUID PRIMARY KEY,
    username text,
    balance double
);

-- 1. Insert a username conditionally (ensuring uniqueness)
INSERT INTO bank_accounts (user_id, username, balance)
VALUES (fd3e3a9a-3f9b-11ed-b57d-0800200c9a66, 'alice', 100.0)
IF NOT EXISTS;

-- 2. Update balance conditionally (preventing overdrafts)
UPDATE bank_accounts
SET balance = 50.0
WHERE user_id = fd3e3a9a-3f9b-11ed-b57d-0800200c9a66
IF balance = 100.0;
```

## The Performance Trade-off

Because Paxos requires four round-trip steps across a quorum of replicas, the write throughput of LWT is significantly lower than standard Cassandra writes — often an order of magnitude slower under load. LWT should be used surgically: reserve it for the specific rows that genuinely need compare-and-set semantics (unique registrations, inventory decrements, leader election rows), and keep the bulk of your write-heavy workload on standard eventually-consistent writes.

## Conclusion

Lightweight Transactions let Cassandra offer linearizable, single-partition consistency without introducing an external consensus service. The cost is real — four network round trips instead of one — so LWT is best treated as a scalpel for correctness-critical rows, not a blanket replacement for Cassandra's normal high-throughput write path.
