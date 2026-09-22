# Distributed Transactions Explained

## The Problem: The Cross-Database Rollback

In a monolithic architecture, managing state changes across different entities is straightforward. You wrap the operations in a database transaction. If anything fails, the database rolls back the entire operation atomically, guaranteeing ACID properties (Atomicity, Consistency, Isolation, Durability).

```sql
BEGIN;
UPDATE Accounts SET balance = balance - 100 WHERE id = 1;
UPDATE Inventory SET stock = stock - 1 WHERE item_id = 99;
COMMIT; -- Or ROLLBACK on failure
```

When migrating to a microservices architecture, this comfort vanishes. The `Accounts` table now belongs to the `Billing Service` (using PostgreSQL), and the `Inventory` table belongs to the `Warehouse Service` (using MongoDB). 

A user places an order. The `Billing Service` deducts $100 successfully. Next, it calls the `Warehouse Service` to decrement stock, but the `Warehouse Service` returns an HTTP 500 or times out. 

```text
[Order Service]
      |
      |--1. Deduct Funds--> [Billing Service] (Success)
      |
      |--2. Reserve Item--> [Warehouse Service] (CRASH!)
```

The system is now in an inconsistent state. The user has lost their money, but the item wasn't reserved. You cannot issue a `ROLLBACK` command over a REST API. This is the core challenge of Distributed Transactions.

## Solution 1: Two-Phase Commit (2PC)

Two-Phase Commit is a synchronous protocol coordinated by a central Transaction Manager. It attempts to emulate traditional ACID transactions across distributed nodes.

1.  **Prepare Phase:** The coordinator asks all participating services, "Are you ready to commit this transaction?" The services lock their local records and reply "Yes."
2.  **Commit Phase:** If all services replied "Yes," the coordinator tells them all to "Commit." If any service replies "No" or times out, the coordinator broadcasts an "Abort" command.

```text
[Coordinator]
   |--> Prepare() --> [Service A] (Locks row, replies OK)
   |--> Prepare() --> [Service B] (Locks row, replies OK)
   |
   |--> Commit()  --> [Service A] (Writes, releases lock)
   |--> Commit()  --> [Service B] (Writes, releases lock)
```

**Why you shouldn't use it:** 2PC is notoriously fragile and slow. It introduces severe locking and blocking. If the coordinator crashes between the Prepare and Commit phases, the participating services are left holding locks indefinitely, causing system-wide deadlocks. It strongly favors Consistency over Availability.

## Solution 2: The Saga Pattern (Eventual Consistency)

The Saga Pattern is the modern standard for distributed transactions. Instead of locking resources synchronously, a Saga breaks the distributed transaction into a sequence of local, independent transactions. 

Crucially, for every local transaction, you must define a **Compensating Transaction**—an operation that undoes the work of the forward transaction.

If a step in the sequence fails, the Saga executes the compensating transactions for all preceding steps to restore the system to its original state.

### The Choreography Saga (Event-Driven)
Services communicate by publishing and subscribing to domain events via a message broker (like Kafka or RabbitMQ). There is no central orchestrator.

1.  `Order Service` creates a Pending Order and publishes `OrderCreatedEvent`.
2.  `Billing Service` consumes the event, deducts funds, and publishes `BilledEvent`.
3.  `Warehouse Service` consumes `BilledEvent`, attempts to reserve inventory. It fails (Out of Stock).
4.  `Warehouse Service` publishes `InventoryFailedEvent`.
5.  `Billing Service` consumes `InventoryFailedEvent` and executes its compensation: refunding the money.
6.  `Order Service` consumes `InventoryFailedEvent` and marks the order as Canceled.

**Pros:** Highly decoupled, resilient to single points of failure.
**Cons:** Hard to trace and debug. The business logic is scattered across multiple services (a "callback hell" of events).

### The Orchestration Saga (Command-Driven)
A centralized orchestrator service explicitly issues commands to participating services and listens for their replies.

```python
# Simplified Orchestrator Logic
def execute_order_saga(order_id):
    try:
        # Step 1: Billing
        billing_gateway.charge(order_id)
        
        # Step 2: Inventory
        try:
            warehouse_gateway.reserve(order_id)
        except InventoryError:
            # Compensation for Step 1
            billing_gateway.refund(order_id)
            order_gateway.mark_failed(order_id)
            return "Failed"
            
        # Success
        order_gateway.mark_complete(order_id)
        return "Success"
        
    except BillingError:
        order_gateway.mark_failed(order_id)
        return "Failed"
```

**Pros:** Business flow is visible in one place. Easier to debug and reason about.
**Cons:** The orchestrator can become a god-service and a single point of failure if not built reliably (often implemented using state machines like AWS Step Functions or Temporal).

## Conclusion

Avoid distributed transactions whenever possible. The best way to solve distributed transactions is to redesign your system boundaries so that entities modified together live in the same database.

When you cannot avoid crossing service boundaries, abandon ACID. Embrace BASE (Basically Available, Soft state, Eventual consistency) and implement the **Saga Pattern**. Write robust compensating logic, rely on idempotent endpoints, and accept that your system state will be temporarily inconsistent during the transaction lifecycle.