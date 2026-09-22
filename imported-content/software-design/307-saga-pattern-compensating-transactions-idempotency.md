# Orchestrating Sagas: Writing Commutative and Idempotent Compensating Transactions

## The Problem: The Death of Distributed ACID Transactions

In monolithic systems, maintaining data consistency across multiple entities is straightforward. We wrap database queries in a single database transaction block. If any step fails, the database automatically rolls back all changes, guaranteeing ACID consistency.

In a microservices architecture with a database-per-service pattern, this is impossible. If a customer places an order, the transaction spans the `OrderService` (SQL), the `InventoryService` (MongoDB), and the `PaymentService` (Stripe API). 

Traditional distributed transaction protocols like **Two-Phase Commit (2PC)** are highly fragile. They block database resources across all participating nodes during the voting and commit phases, creating a severe performance bottleneck and exposing the system to deadlocks. If a network partition occurs mid-transaction, participating databases remain locked indefinitely. 

```
Two-Phase Commit (2PC): Highly blocking, slow, single network partition locks databases.
Saga Pattern: Asynchronous, non-blocking, but requires careful compensation handling.
```

If the `PaymentService` fails after the `InventoryService` has already reserved the items, we cannot simply issue a database "ROLLBACK". We must actively undo the reserved inventory across a separate physical network boundary.

---

## The Mental Model: The Saga and Compensating Transactions

The **Saga Pattern** manages consistency through a sequence of local transactions. Each service performs its transaction and publishes an event. If any step fails (e.g., payment is declined), the system must execute a series of **Compensating Transactions** in reverse order to undo the changes.

```
Forward Path:  [Create Order] -------> [Reserve Inventory] -------> [Process Payment (FAIL!)]
                                                                               |
                                                                               v
Backward Path: [Cancel Order] <------- [Release Inventory] <-------------------+ (Compensations)
```

However, writing compensating transactions is highly complex due to network unreliability. You must design them with two absolute mathematical properties:

1. **Idempotency**: Because of at-least-once network delivery, a compensation (e.g., `refundPayment` or `releaseInventory`) may be delivered multiple times. Executing the same compensation $N$ times must yield the exact same side-effect as executing it once.
2. **Commutativity / Out-of-Order Safety**: In high-concurrency systems, a compensating transaction (e.g., `cancelOrder`) can arrive at a microservice *before* the original forward transaction (`createOrder`) due to network routing anomalies. If you receive a cancel request first, you must record it. If the original create request subsequently arrives, the service must detect the cancellation state and immediately reject it rather than creating a zombie record.

---

## Implementing an Idempotent, Out-of-Order Saga Step

The following TypeScript example demonstrates a robust, idempotent, and out-of-order safe implementation of an inventory reservation saga step.

```typescript
import { Client } from 'pg'; // Mock Postgres Client

interface InventorySagaStep {
  sagaId: string;
  productId: string;
  qty: number;
}

export class InventorySagaService {
  constructor(private db: Client) {}

  // 1. Forward Transaction (Reserve Stock)
  public async reserveInventory(step: InventorySagaStep): Promise<void> {
    // Check if a cancellation/compensation has already arrived first
    const isCancelled = await this.checkIfAlreadyCancelled(step.sagaId);
    if (isCancelled) {
      console.warn(`Rejecting reserve. Saga ${step.sagaId} is already compensated.`);
      return;
    }

    // Idempotency Check: Verify if already reserved
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

  // 2. Compensating Transaction (Release Stock)
  public async compensateReleaseInventory(step: InventorySagaStep): Promise<void> {
    const state = await this.getSagaState(step.sagaId);

    if (state === 'COMPENSATED') {
      // Idempotency: Already processed this compensation. No-op.
      return;
    }

    if (state === null) {
      // Out-of-Order Case: Compensation arrived BEFORE the forward transaction.
      // We insert a 'COMPENSATED' state. When the forward transaction arrives later, 
      // it will hit 'checkIfAlreadyCancelled' and skip execution, preventing zombie records.
      await this.db.query(
        'INSERT INTO saga_state (saga_id, state) VALUES ($1, $2)',
        [step.sagaId, 'COMPENSATED']
      );
      return;
    }

    // Normal compensation path (Undoing the reservation)
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
    const state = await this.getSagaState(sagaId);
    return state === 'COMPENSATED';
  }

  private async checkIfAlreadyReserved(sagaId: string): Promise<boolean> {
    const state = await this.getSagaState(sagaId);
    return state === 'RESERVED';
  }

  private async getSagaState(sagaId: string): Promise<string | null> {
    const res = await this.db.query('SELECT state FROM saga_state WHERE saga_id = $1', [sagaId]);
    return res.rows[0]?.state || null;
  }
}
```

---

## Architectural Guardrails and Trade-offs

1. **Lack of Isolation**: Sagas lack isolated states. Other concurrent transactions can view or modify intermediate states (e.g., stock is decremented before payment is secured). Your UI and business rules must handle these pending states gracefully.
2. **Orchestrator Centralization**: When using orchestrated sagas, the orchestrator becomes a highly critical hub. Maintain orchestrator high availability and use state-persistence strategies (like temporal.io or AWS Step Functions) to persist orchestration history safely.
