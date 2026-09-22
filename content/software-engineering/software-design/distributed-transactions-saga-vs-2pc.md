---
title: "Distributed Transactions: Saga Pattern vs Two-Phase Commit"
description: "Why ACID transactions don't survive the move to database-per-service microservices, how Two-Phase Commit's blocking coordinator model fails under network partitions, and how to build resilient, idempotent Choreography and Orchestration Sagas with the Transactional Outbox pattern."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "DEEP_DIVE"
tags:
  - "saga-pattern"
  - "two-phase-commit"
  - "distributed-transactions"
  - "transactional-outbox"
  - "microservices"
---

# Distributed Transactions: Saga Pattern vs Two-Phase Commit

## The Problem: The Collapse of ACID in Microservices

In a monolith, a checkout flow is a single database transaction:

```sql
BEGIN TRANSACTION;
  INSERT INTO orders (id, user_id, total) VALUES (101, 99, 150.00);
  UPDATE inventory SET stock = stock - 1 WHERE item_sku = 'SKU-MACBOOK';
  INSERT INTO payments (id, order_id, status) VALUES (202, 101, 'COMPLETED');
COMMIT; -- if any statement fails, the engine rolls back everything automatically
```

The database enforces Atomicity, Consistency, Isolation, and Durability across all three writes.

But the database-per-service pattern — necessary to avoid tight coupling in microservices — puts orders in Postgres, inventory in MongoDB, and payments in DynamoDB:

```text
[ Client Checkout Request ]
             |
             v
   [ Order Service ]     ---> [ Postgres ]
             |
             v
   [ Inventory Service ] ---> [ MongoDB ]
             |
             v
   [ Payment Service ]   ---> [ DynamoDB ]
```

If the Order Service commits, the Inventory Service commits, and then the Payment Service's charge is **declined**, you cannot issue a single SQL rollback across three independently-committed databases on three different engines. The system is left in an inconsistent state: stock reserved for an order that will never be paid.

## Why the Problem Is Hard

1. **Locks held across a network hop kill throughput.** If Service A holds a row lock in Database A while waiting on an HTTP call to Service B, throughput is bound by network round-trip time, not local disk I/O — thread pools and connection pools exhaust fast.
2. **The dual-write dilemma.** You cannot atomically write to a local database *and* publish a message to an external broker in one step. Write-then-publish risks a crash between the two (database committed, event never sent); publish-then-write risks the opposite (downstream processes a ghost event).
3. **CAP theorem.** During a network partition, forcing strict consistency across independent services means failing closed — economically unacceptable at internet scale. Distributed systems must design for eventual consistency instead.

## Mental Model: The Synchronized Wedding vs. The Travel Agent

```text
       [ Two-Phase Commit (2PC) ]                    [ The Saga Pattern ]
      "The Highly Synchronized Wedding"             "The Flexible Travel Agent"
  ==========================================    ==========================================
  Coordinator: "Do you take this spouse?"        Step 1: Book flight (committed)
  Guest 1: "I agree."                            Step 2: Book hotel (committed)
  Guest 2: "I agree."                            Step 3: Rent car (FAILED!)
  Coordinator: "We are officially married."       ------------------------------------------
  *If one guest objects, wedding is aborted.      Compensate 2: Cancel hotel & get refund.
  *No one can leave their seat until committed.   Compensate 1: Cancel flight & get refund.
```

In 2PC, every participant locks in place until a central coordinator gets unanimous agreement — highly consistent, but blocking and fragile. In a Saga, nothing is locked: each step commits immediately, and if a later step fails, the earlier steps are undone with explicit **compensating actions** instead of a database rollback.

## Two-Phase Commit (2PC) Mechanics

2PC is a strongly-consistent (`CP`) protocol run by a central **Coordinator** across multiple **Participants**, in two phases.

**Phase 1 (Prepare):** the Coordinator sends `PREPARE` to every participant. Each opens a local transaction, acquires locks, writes to its write-ahead log, and votes `VOTE_COMMIT` or `VOTE_ABORT`.

**Phase 2 (Commit):** if every participant voted commit, the Coordinator sends `GLOBAL_COMMIT` and everyone commits and releases locks. If any participant voted abort (or the Coordinator times out), it sends `GLOBAL_ABORT` and everyone rolls back.

```text
Client       Coordinator          Participant A          Participant B
  |  init ------->|                     |                      |
  |               |--- PREPARE -------->|                      |
  |               |--- PREPARE ------------------------------->|
  |               |<-- VOTE_COMMIT -----|                      |
  |               |<-- VOTE_COMMIT -----------------------------|
  |               |--- GLOBAL_COMMIT -->|                      |
  |               |--- GLOBAL_COMMIT -------------------------->|
  |               |<-- ACK -------------|                      |
  |               |<-- ACK -------------------------------------|
  |<-- success ---|                     |                      |
```

### Why 2PC Is a Cloud Anti-Pattern

1. **Coordinator SPOF.** If the coordinator crashes between sending `GLOBAL_COMMIT` to A but not yet to B, B is stuck holding locks indefinitely, unable to decide commit or abort on its own.
2. **O(N) message growth.** Total network messages scale as `4N` for N participants — latency compounds as the transaction touches more services.
3. **Lock contention and starvation.** Rows stay locked from Phase 1 through Phase 2's end; concurrent writers on the same rows block, time out, and starve.

## The Saga Pattern

A Saga is a sequence of local transactions `S = {T1, T2, ..., Tn}`, each committed independently inside its own service. If `Ti` fails, the Saga runs compensating transactions in reverse order: `C = {C(i-1), ..., C2, C1}`.

```text
          [ Normal Execution Path ]
   T1 (Order Created) ---> T2 (Stock Reserved) ---> T3 (Payment Fails!)
                                                            |
                                                            v (initiate abort)
   C1 (Order Cancelled) <-- C2 (Stock Released) <-----------+
         [ Compensating Rollback Path ]
```

### Rules Compensating Transactions Must Follow

1. **They cannot fail semantically.** A compensation can't say "I can't refund this right now" — it must run to completion, retried indefinitely on transient failures.
2. **They must be idempotent** — running a compensation twice must produce the same state as running it once: `Ci(Ci(x)) = Ci(x)`.
3. **They must be commutative under reordering.** A compensation event can arrive *before* its corresponding forward transaction due to network delay; the net result must still be correct.

## Choreography vs Orchestration

### Choreography (Decentralized, Event-Driven)

No central controller — services react to events on a broker like Kafka.

```text
+---------------+   OrderCreated    +-------------------+  StockReserved  +-----------------+
| Order Service | ----------------> | Inventory Service | --------------> | Payment Service |
+---------------+                   +-------------------+                 +-----------------+
        ^                                                                         |
        |                                                     PaymentFailed      |
        +-------------------------------------------------------------------------+
                          Execute compensating actions (rollback)
```

**Pros:** no SPOF, extremely low coupling — services only need to know event topics, not each other's APIs. **Cons:** at 15+ services, the end-to-end flow becomes nearly impossible to trace; risk of circular event dependencies.

### Orchestration (Centralized Workflow)

A **Saga Orchestrator** directs participants via synchronous or async calls and owns the state machine explicitly.

```text
                             +-----------------------+
                             |   Order Orchestrator  |
                             +-----------------------+
                             /     |           |     \
               (CreateOrder)/      |           |      \(ProcessPayment)
                           v       v           v        v
                     +---------+  +-------------+  +---------+
                     |  Order  |  |  Inventory  |  | Payment |
                     | Service |  |   Service   |  | Service |
                     +---------+  +-------------+  +---------+
```

**Pros:** centralized visibility, the whole business process lives in one orchestrator; simpler error handling. **Cons:** the orchestrator is itself a SPOF (mitigate with an HA workflow engine like Temporal.io or AWS Step Functions), and every step adds an extra network hop.

| Metric | Choreography | Orchestration |
| :--- | :--- | :--- |
| Coordination model | Event pub/sub (async) | Direct command/reply |
| Visibility | Distributed, hard to trace | Centralized state machine |
| Coupling | Low (coupled to event schema) | Medium (coupled to service APIs) |
| Complexity at scale | Explodes | Scales roughly linearly |
| Tooling | Kafka, RabbitMQ, EventBridge | Temporal.io, AWS Step Functions, Camunda |
| Best for | 2-4 step simple workflows | Complex enterprise flows |

## Hands-On: Orchestration Saga in Python

A complete, runnable checkout Saga with idempotency guards and a rollback tombstone pattern:

```python
import uuid
import logging
from typing import Dict, Any, List

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("SagaOrchestrator")


class MemoryDatabases:
    orders_db: Dict[str, Dict[str, Any]] = {}
    inventory_db: Dict[str, int] = {"SKU-MACBOOK": 5, "SKU-MOUSE": 1}
    payments_db: Dict[str, Dict[str, Any]] = {}
    idempotency_log: Dict[str, Any] = {}

    @classmethod
    def reset(cls):
        cls.orders_db.clear()
        cls.payments_db.clear()
        cls.idempotency_log.clear()
        cls.inventory_db = {"SKU-MACBOOK": 5, "SKU-MOUSE": 1}


class OrderService:
    @staticmethod
    def create_order(saga_id, customer_id, sku, amount) -> str:
        idemp_key = f"order-create-{saga_id}"
        if idemp_key in MemoryDatabases.idempotency_log:
            return MemoryDatabases.idempotency_log[idemp_key]  # idempotent replay

        # Tombstone check: was this saga already cancelled before we got here?
        if f"order-cancel-tombstone-{saga_id}" in MemoryDatabases.idempotency_log:
            raise RuntimeError("Transaction cancelled before creation.")

        order_id = f"ord-{uuid.uuid4().hex[:8]}"
        MemoryDatabases.orders_db[order_id] = {
            "saga_id": saga_id, "customer_id": customer_id,
            "sku": sku, "amount": amount, "status": "PENDING"
        }
        MemoryDatabases.idempotency_log[idemp_key] = order_id
        logger.info(f"[Order] Created PENDING order {order_id}")
        return order_id

    @staticmethod
    def cancel_order(saga_id) -> None:
        """COMPENSATING TRANSACTION: reverses create_order."""
        # Record a tombstone in case create_order is still in flight
        MemoryDatabases.idempotency_log[f"order-cancel-tombstone-{saga_id}"] = True

        target = next((oid for oid, d in MemoryDatabases.orders_db.items()
                        if d["saga_id"] == saga_id), None)
        if target:
            if MemoryDatabases.orders_db[target]["status"] != "CANCELLED":
                MemoryDatabases.orders_db[target]["status"] = "CANCELLED"
                logger.info(f"[Order] [COMPENSATION] Cancelled order {target}")


class InventoryService:
    @staticmethod
    def reserve_stock(saga_id, sku, quantity) -> str:
        idemp_key = f"inventory-reserve-{saga_id}"
        if idemp_key in MemoryDatabases.idempotency_log:
            return MemoryDatabases.idempotency_log[idemp_key]["reservation_id"]

        if f"inventory-release-tombstone-{saga_id}" in MemoryDatabases.idempotency_log:
            raise RuntimeError("Transaction cancelled before reservation.")

        current_stock = MemoryDatabases.inventory_db.get(sku, 0)
        if current_stock < quantity:
            raise ValueError(f"Insufficient stock for {sku}")

        MemoryDatabases.inventory_db[sku] -= quantity
        reservation_id = f"res-{uuid.uuid4().hex[:8]}"
        MemoryDatabases.idempotency_log[idemp_key] = {
            "reservation_id": reservation_id, "sku": sku, "quantity": quantity
        }
        logger.info(f"[Inventory] Reserved {quantity}x {sku}")
        return reservation_id

    @staticmethod
    def release_stock(saga_id) -> None:
        """COMPENSATING TRANSACTION: reverses reserve_stock."""
        MemoryDatabases.idempotency_log[f"inventory-release-tombstone-{saga_id}"] = True
        reserve_key = f"inventory-reserve-{saga_id}"
        if reserve_key in MemoryDatabases.idempotency_log:
            data = MemoryDatabases.idempotency_log[reserve_key]
            if not data.get("released", False):
                MemoryDatabases.inventory_db[data["sku"]] += data["quantity"]
                data["released"] = True
                logger.info(f"[Inventory] [COMPENSATION] Released {data['quantity']}x {data['sku']}")


class PaymentService:
    @staticmethod
    def charge_card(saga_id, customer_id, amount) -> str:
        idemp_key = f"payment-charge-{saga_id}"
        if idemp_key in MemoryDatabases.idempotency_log:
            return MemoryDatabases.idempotency_log[idemp_key]

        if amount > 500.00:
            raise ValueError("Insufficient credit limit.")

        payment_id = f"pay-{uuid.uuid4().hex[:8]}"
        MemoryDatabases.payments_db[payment_id] = {
            "saga_id": saga_id, "customer_id": customer_id,
            "amount": amount, "status": "CAPTURED"
        }
        MemoryDatabases.idempotency_log[idemp_key] = payment_id
        logger.info(f"[Payment] Charged ${amount:.2f}")
        return payment_id

    @staticmethod
    def refund_card(saga_id) -> None:
        """COMPENSATING TRANSACTION: reverses charge_card."""
        charge_key = f"payment-charge-{saga_id}"
        if charge_key in MemoryDatabases.idempotency_log:
            payment_id = MemoryDatabases.idempotency_log[charge_key]
            record = MemoryDatabases.payments_db.get(payment_id)
            if record and record["status"] != "REFUNDED":
                record["status"] = "REFUNDED"
                logger.info(f"[Payment] [COMPENSATION] Refunded {payment_id}")


class CheckoutSagaOrchestrator:
    def __init__(self, customer_id, sku, quantity, price_per_unit):
        self.saga_id = f"saga-{uuid.uuid4().hex[:12]}"
        self.customer_id = customer_id
        self.sku = sku
        self.quantity = quantity
        self.total_amount = price_per_unit * quantity
        self.executed_steps: List[str] = []

    def execute(self) -> bool:
        logger.info(f"[*] INITIATING SAGA [{self.saga_id}]")
        try:
            OrderService.create_order(self.saga_id, self.customer_id, self.sku, self.total_amount)
            self.executed_steps.append("CREATE_ORDER")

            InventoryService.reserve_stock(self.saga_id, self.sku, self.quantity)
            self.executed_steps.append("RESERVE_STOCK")

            PaymentService.charge_card(self.saga_id, self.customer_id, self.total_amount)
            self.executed_steps.append("CHARGE_CARD")

            logger.info(f"[OK] SAGA [{self.saga_id}] COMPLETED")
            return True
        except Exception as err:
            logger.error(f"[FAIL] SAGA STEP FAILED: {err}. Rolling back...")
            self._rollback()
            return False

    def _rollback(self) -> None:
        # LIFO: undo the most recent step first
        for step in reversed(self.executed_steps):
            if step == "CHARGE_CARD":
                PaymentService.refund_card(self.saga_id)
            elif step == "RESERVE_STOCK":
                InventoryService.release_stock(self.saga_id)
            elif step == "CREATE_ORDER":
                OrderService.cancel_order(self.saga_id)
```

## The Transactional Outbox Pattern

Choreographed Sagas run on the **dual-write anti-pattern** risk:

```python
def checkout(order_details):
    db.save(order_details)                          # write 1: local DB
    kafka.publish("OrderCreated", order_details)     # write 2: broker — if this
                                                       # fails, the DB committed but
                                                       # no one downstream ever hears
```

The fix is to write the event to an **Outbox Table** inside the *same* local database transaction as the business write — atomicity is free because both writes are in the same ACID transaction:

```text
  [ Core Service Boundary ]
  +-------------------------------------------------------------+
  |  Local Transaction:                                          |
  |  1. Insert into orders table                                 |
  |  2. Insert event record into Outbox Table                    |
  |  (both succeed or fail together)                             |
  +-------------------------------------------------------------+
              |
              v (committed to local DB)
      +---------------+
      |  Outbox Table |
      +---------------+
              |
              v (Debezium CDC, or a polling relay)
     +-----------------+
     |  Apache Kafka   |  (guaranteed eventual delivery)
     +-----------------+
```

```sql
CREATE TABLE outbox (
  id UUID PRIMARY KEY,
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
);
```

An independent **Message Relay** publishes outbox rows to Kafka, either via **Change Data Capture** (a tool like Debezium tailing the DB's WAL — zero query overhead on the primary) or a **polling publisher**:

```sql
SELECT * FROM outbox WHERE status = 'PENDING' LIMIT 100 FOR UPDATE SKIP LOCKED;
```

`FOR UPDATE SKIP LOCKED` lets multiple relay instances run concurrently without double-publishing or blocking each other.

## Common Misconceptions

**"Sagas provide the same isolation as ACID transactions."** They don't — Sagas are ACD, not ACID. Each local transaction commits immediately and is instantly visible to concurrent readers (dirty reads by another name). Business logic must tolerate customers seeing intermediate states like "stock reserved, payment pending."

**"The Outbox Pattern guarantees exactly-once delivery."** It guarantees **at-least-once**. If the relay publishes successfully but crashes before marking the row `PUBLISHED`, it republishes on recovery. Every consumer must be built as an idempotent message handler.

## Key Takeaways

- The database-per-service pattern breaks native ACID transactions across service boundaries — there is no cross-database rollback.
- Two-Phase Commit is strongly consistent but blocking, has a single-point-of-failure coordinator, and its message count scales with the number of participants — a poor fit for cloud-native systems.
- The Saga Pattern replaces locking with sequential local commits and reverse-order compensating transactions, which must be idempotent, non-failing, and tolerant of out-of-order arrival.
- Choreography (event-driven) minimizes coupling but loses visibility at scale; Orchestration centralizes visibility at the cost of an orchestrator dependency.
- The Transactional Outbox Pattern solves the dual-write problem by writing the event to the same local database transaction as the business change, then relaying it asynchronously — at-least-once, so consumers must be idempotent.
