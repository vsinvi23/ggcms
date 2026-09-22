# Distributed Transactions: The Latency and Blocking Costs of Two-Phase Commit (2PC) and Three-Phase Commit (3PC)

## The Problem: Data Consistency Across Microservices
In monolithic applications, maintaining ACID properties is straightforward because a single relational database coordinates transactions. However, when transitioning to a microservices architecture, data is often partitioned per service (Database-per-Service pattern). A simple e-commerce checkout now requires atomic updates across an Order Service, Inventory Service, and Payment Service. If one service fails after the others have committed, the system enters an inconsistent state.

Distributed transactions aim to restore atomic operations across independent nodes. The classical protocols for this are the Two-Phase Commit (2PC) and Three-Phase Commit (3PC). While conceptually sound, they introduce severe blocking and latency trade-offs that make them unsuitable for high-throughput distributed systems.

## The Two-Phase Commit (2PC) Protocol
2PC introduces a central Coordinator node that manages the lifecycle of a transaction across multiple Participant nodes. It operates in two synchronous phases.

### Phase 1: The Prepare Phase
The Coordinator sends a `PREPARE` message to all Participants. Each Participant executes the transaction locally up to the point of committing. It acquires the necessary database locks, writes to its write-ahead log (WAL), and responds with a `VOTE_COMMIT` or `VOTE_ABORT`.

### Phase 2: The Commit Phase
If *all* Participants vote to commit, the Coordinator writes a commit record to its own log and broadcasts a `COMMIT` message. The Participants permanently commit the transaction, release their locks, and acknowledge. If any Participant votes to abort or times out, the Coordinator broadcasts an `ABORT` message, and all nodes roll back.

```text
+-------------+                 +-------------+                 +-------------+
| Participant |                 | Coordinator |                 | Participant |
|     A       |                 |             |                 |     B       |
+-------------+                 +-------------+                 +-------------+
      |                                |                               |
      |<----------- PREPARE -----------|---------- PREPARE ----------->|
      |                                |                               |
      |------- VOTE_COMMIT (Yes) ----->|------- VOTE_COMMIT (Yes) ---->|
      |                                |                               |
      |<----------- COMMIT ------------|----------- COMMIT ----------->|
      |                                |                               |
      |-------------- ACK ------------>|<------------- ACK ------------|
```

### The Blocking Problem in 2PC
2PC is a blocking protocol. During Phase 1, Participants must hold exclusive locks on the affected rows. If the Coordinator crashes after Participants have voted but before sending the `COMMIT`/`ABORT` command, the Participants are left in a "doubt" state. They cannot unilaterally commit or abort because they don't know the global outcome. Thus, they must hold their locks indefinitely until the Coordinator recovers, paralyzing the system.

Furthermore, 2PC is latency-heavy. The overall latency is bounded by the slowest Participant, plus the network round-trips.

## The Three-Phase Commit (3PC) Protocol
To mitigate the blocking problem of 2PC, the Three-Phase Commit protocol introduces an intermediate "Pre-Commit" phase. The goal is to ensure that no node can commit while other nodes are in an uncertain state, allowing timeouts to safely trigger aborts if a crash occurs.

### Phase 1: CanCommit
The Coordinator asks Participants if they can commit. They reply with `YES` or `NO`, but they do *not* yet acquire exclusive write locks.

### Phase 2: PreCommit
If all say `YES`, the Coordinator sends `PRECOMMIT`. Participants acknowledge this and move to a prepared state (locking resources). Crucially, if a Participant times out waiting for the final commit, it can safely assume the transaction should proceed if it received `PRECOMMIT`.

### Phase 3: DoCommit
The Coordinator sends the final `DO_COMMIT` command.

```text
[Coordinator]         [Participant]
   CanCommit    ->
                <-    Yes
   PreCommit    ->
                <-    ACK
   DoCommit     ->
                <-    ACK
```

### The Flaws of 3PC
While 3PC attempts to solve the coordinator-crash blocking issue, it introduces its own problems:
1. **Higher Latency**: It requires three full round-trips, severely degrading throughput.
2. **Network Partitions**: 3PC assumes a fail-stop model. Under network partitions, if the network splits after Phase 2, a timeout might cause a Participant to commit while the Coordinator intended to abort, leading to split-brain inconsistencies.

## Modern Alternatives: Sagas and Eventual Consistency
Due to the blocking nature of 2PC and the latency/complexity of 3PC, modern microservices rarely use them over WANs or distributed nodes. Instead, systems embrace **Eventual Consistency** using the **Saga Pattern**.

A Saga breaks the global transaction into a sequence of local transactions. Each local transaction publishes an event triggering the next step. If a step fails, the system executes **Compensating Transactions** to undo the previous steps. 

```java
// Example: Saga Orchestrator pseudocode
public void processCheckout(Order order) {
    try {
        inventoryClient.reserve(order.getItems());
        try {
            paymentClient.charge(order.getCustomer(), order.getAmount());
            orderService.confirmOrder(order.getId());
        } catch (PaymentFailedException e) {
            // Compensating transaction
            inventoryClient.release(order.getItems());
            orderService.markAsFailed(order.getId());
        }
    } catch (InventoryExhaustedException e) {
        orderService.markAsFailed(order.getId());
    }
}
```

In conclusion, 2PC and 3PC are strong theoretical constructs but are impractical for high-availability distributed systems. Embracing eventual consistency and idempotency provides the resilience needed in modern architectures.
