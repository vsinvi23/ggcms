---
title: "Saga Compensating Transactions: Idempotency and Commutativity Rules"
description: "Why undoing a distributed transaction step requires more than an inverse operation, and how to design compensating transactions that are safe under retries and out-of-order delivery."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "DEEP_DIVE"
tags:
  - "saga-pattern"
  - "compensating-transactions"
  - "idempotency"
  - "commutativity"
  - "orchestration"
  - "distributed-systems"
---

# Saga Compensating Transactions: Idempotency and Commutativity Rules

## The Problem: The Death of Distributed ACID

In a monolith, consistency across multiple entities is a solved problem: wrap the operations in one database transaction, and a failure anywhere triggers an automatic, complete rollback.

In a microservices architecture with a database-per-service, this guarantee disappears. If a customer places an order, the transaction now spans `OrderService` (SQL), `InventoryService` (MongoDB), and `PaymentService` (an external API like Stripe). Two-Phase Commit (2PC) was the classic answer to distributed atomicity, but it's a poor fit here: it holds locks across every participating database during the voting and commit phases, creating severe contention, and a network partition mid-protocol can leave those locks held indefinitely.

```
Two-Phase Commit (2PC): Highly blocking, slow, a single network partition locks every participant.
Saga Pattern:           Asynchronous, non-blocking, but requires careful compensation handling.
```

If `PaymentService` fails after `InventoryService` has already reserved stock, there's no `ROLLBACK` to issue — you have to actively undo the reservation across a separate network boundary, in a separate service, potentially much later.

## The Mental Model: Compensating Transactions, Not Rollbacks

The **Saga pattern** replaces the single distributed transaction with a sequence of local transactions, each committed independently, each publishing an event to trigger the next step. If any step fails, the saga runs a series of **compensating transactions**, executed in reverse order, to undo the effects of the steps that already succeeded.

```
Forward Path:  [Create Order] -------> [Reserve Inventory] -------> [Process Payment (FAIL!)]
                                                                               |
                                                                               v
Backward Path: [Cancel Order] <------- [Release Inventory] <-------------------+ (Compensations)
```

This is fundamentally different from a database rollback. A rollback is automatic and invisible — the engine undoes exactly what it did. A compensating transaction is a separate, explicit piece of business logic you have to write yourself, and — because it runs over an unreliable network — it has to satisfy two properties a database rollback gets for free.

### 1. Idempotency (safe to retry)

If the orchestrator sends `CancelHotel` and the acknowledgment is lost on the way back, the orchestrator has to assume the command failed and resend it. The compensation must produce the same end state no matter how many times it's executed.

```typescript
// BAD: not idempotent — throws on the second invocation
async function cancelHotel(reservationId: string) {
    const res = await db.reservations.findById(reservationId);
    if (!res) throw new Error("Not found");
    await db.reservations.delete(reservationId);
}

// GOOD: idempotent — an upsert to a definitive terminal state
async function cancelHotel(reservationId: string) {
    await db.reservations.update(
        { id: reservationId },
        { status: "CANCELLED" },
        { upsert: true }
    );
}
```

The good version treats "cancelled" as a state to converge on, not an action to perform exactly once — calling it five times leaves the reservation in exactly the same place as calling it once.

### 2. Commutativity (safe out of order)

In an asynchronous system, a compensating command can genuinely arrive *before* the original forward command. Say the orchestrator fires `BookHotel`, the network is slow, a timeout fires, the orchestrator decides to abort the saga and sends `CancelHotel` — and `CancelHotel` reaches `HotelService` first, before `BookHotel` ever arrives.

If the two operations aren't commutative (applying them in either order must produce the same final state), the service ends up with a "booked" reservation that should have been cancelled, or worse, a state that depends on network timing.

```typescript
async function handleHotelCommand(command: { type: string; transactionId: string }) {
    const state = await db.tracking.get(command.transactionId);

    if (command.type === "CANCEL") {
        // Record the cancellation even if we haven't seen the booking yet.
        await db.tracking.set(command.transactionId, "CANCELLED");
        return;
    }

    if (command.type === "BOOK") {
        // If the cancel arrived first, reject the booking outright.
        if (state === "CANCELLED") {
            console.log("Booking aborted — compensation arrived earlier.");
            return;
        }
        await executeBooking();
    }
}
```

By recording state transitions rather than executing commands blindly, a "cancel-before-book" ordering resolves correctly regardless of which message the network happened to deliver first.

## Implementing an Idempotent, Out-of-Order-Safe Saga Step

Here's a complete inventory reservation step that combines both properties, tracking saga state explicitly instead of trusting message order.

```typescript
import { Client } from 'pg'; // Mock Postgres client

interface InventorySagaStep {
  sagaId: string;
  productId: string;
  qty: number;
}

export class InventorySagaService {
  constructor(private db: Client) {}

  // 1. Forward transaction (reserve stock)
  public async reserveInventory(step: InventorySagaStep): Promise<void> {
    // Has a compensation already arrived for this saga? Reject the booking.
    const isCancelled = await this.checkIfAlreadyCancelled(step.sagaId);
    if (isCancelled) {
      console.warn(`Rejecting reserve. Saga ${step.sagaId} is already compensated.`);
      return;
    }

    // Idempotency check: have we already reserved for this saga?
    const isReserved = await this.checkIfAlreadyReserved(step.sagaId);
    if (isReserved) return;

    await this.db.query(
      'UPDATE inventory SET stock = stock - $1 WHERE product_id = $2',
      [step.qty, step.productId]
    );

    await this.db.query(
      'INSERT INTO saga_state (saga_id, state) VALUES ($1, $2)',
      [step.sagaId, 'RESERVED']
    );
  }

  // 2. Compensating transaction (release stock)
  public async compensateReleaseInventory(step: InventorySagaStep): Promise<void> {
    const state = await this.getSagaState(step.sagaId);

    if (state === 'COMPENSATED') {
      // Idempotency: already processed this compensation. No-op.
      return;
    }

    if (state === null) {
      // Out-of-order case: the compensation arrived before the forward
      // transaction. Record 'COMPENSATED' now, so that when the forward
      // transaction eventually arrives, reserveInventory() sees it and
      // rejects the reservation instead of creating a zombie record.
      await this.db.query(
        'INSERT INTO saga_state (saga_id, state) VALUES ($1, $2)',
        [step.sagaId, 'COMPENSATED']
      );
      return;
    }

    // Normal compensation path: undo the earlier reservation.
    await this.db.query(
      'UPDATE inventory SET stock = stock + $1 WHERE product_id = $2',
      [step.qty, step.productId]
    );

    await this.db.query(
      'UPDATE saga_state SET state = $1 WHERE saga_id = $2',
      ['COMPENSATED', step.sagaId]
    );
  }

  private async checkIfAlreadyCancelled(sagaId: string): Promise<boolean> {
    return (await this.getSagaState(sagaId)) === 'COMPENSATED';
  }

  private async checkIfAlreadyReserved(sagaId: string): Promise<boolean> {
    return (await this.getSagaState(sagaId)) === 'RESERVED';
  }

  private async getSagaState(sagaId: string): Promise<string | null> {
    const res = await this.db.query('SELECT state FROM saga_state WHERE saga_id = $1', [sagaId]);
    return res.rows[0]?.state || null;
  }
}
```

The `saga_state` table is what makes both properties hold: instead of the forward and compensating actions racing each other and executing blindly, both check and record explicit state, so whichever arrives first still leads to the correct final outcome.

## Orchestrated Sagas: Where This Logic Runs

This idempotency/commutativity discipline matters in both saga coordination styles, but it's especially visible in the **Orchestrated Saga**, where a central coordinator explicitly tracks progress and issues compensation commands on failure:

```text
[Saga Orchestrator]
  |
  |-- 1. Execute(BookFlight) -> OK
  |-- 2. Execute(BookHotel) -> OK
  |-- 3. Execute(ChargeCard) -> FAIL!
  |
  | (Initiate compensation phase)
  |-- 4. Compensate(CancelHotel) -> OK
  |-- 5. Compensate(CancelFlight) -> OK
```

When step 3 fails, the orchestrator walks backward through the steps that already succeeded, firing their compensating commands in reverse order. The orchestrator's own crash-and-restart behavior is exactly why idempotent, commutative compensations matter: if the orchestrator crashes after sending `CancelHotel` but before recording that it did, it will send `CancelHotel` again on restart — and the handler above needs to treat that as a safe no-op.

## Architectural Guardrails and Trade-offs

- **Lack of isolation.** Sagas have no isolation level equivalent to a database transaction's — other concurrent operations can observe intermediate states (stock decremented before payment is confirmed). Business rules and UI must be designed to tolerate this rather than assume atomic visibility.
- **Orchestrator centralization.** In an orchestrated saga, the orchestrator becomes a critical piece of infrastructure. It needs high availability and durable state persistence (tools like Temporal or AWS Step Functions exist specifically to make orchestration history durable across orchestrator restarts).

## Common Misconceptions

**Misconception:** "A compensating transaction is just the inverse function of the forward transaction."
**Reality:** A true inverse (`reserve` / `release`) is necessary but not sufficient. Without explicit idempotency and commutativity handling, that inverse function breaks under retries and out-of-order delivery — which are not edge cases in a distributed system, they're the normal operating conditions.

**Misconception:** "Out-of-order delivery is rare enough to ignore."
**Reality:** Different network paths, retry timing, and partitioned message queues make out-of-order delivery a routine occurrence at scale, not a theoretical corner case — designing for it from the start is cheaper than discovering it in production.

## Key Takeaways

- Compensating transactions are explicit application code, not automatic database rollbacks, and they run over an unreliable network.
- Idempotency guarantees a compensation is safe to retry any number of times without changing the outcome.
- Commutativity guarantees a compensation is safe even if it arrives before the action it's supposed to undo.
- Tracking explicit saga state (not just executing commands blindly) is what makes both properties achievable in practice.

## What to Learn Next

- Choreographed sagas, the alternative coordination style where services react to each other's events instead of a central orchestrator directing them.
- Idempotency keys in payment APIs, which apply this exact same idempotent-ledger technique to a single HTTP endpoint rather than a multi-step saga.
- Event Sourcing and CQRS, which give a saga step's local database a natural, auditable place to record state transitions like "RESERVED" and "COMPENSATED."
