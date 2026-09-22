# Event-Driven Sagas: Choreography and Distributed Rollbacks

## The Problem: The Distributed Transaction
In a monolithic application backed by a single relational database, ensuring data consistency is easy. We use ACID transactions. If a user places an order, we deduct inventory and charge their credit card within a single `BEGIN ... COMMIT` block. If the credit card fails, we issue a `ROLLBACK`, and the inventory is magically restored.

In a microservices architecture, this is impossible. The `OrderService` uses PostgreSQL, the `InventoryService` uses MongoDB, and the `PaymentService` calls Stripe. There is no global database to issue a `ROLLBACK` command to. 

If we deduct inventory, but the payment fails 500 milliseconds later, how do we restore the inventory? Using Distributed Transactions (like Two-Phase Commit / 2PC) over the network is notoriously slow, blocks databases with aggressive locks, and falls apart if a single service is temporarily offline.

## The Mental Model: The Saga Pattern
A **Saga** is a sequence of local transactions. Each local transaction updates the database within a single microservice and publishes an event to trigger the next local transaction in the saga.

If a local transaction fails because it violates a business rule (e.g., insufficient funds), the saga executes a series of **Compensating Transactions** that undo the changes made by the preceding local transactions.

Think of it like booking a vacation:
1. Book Flight (Success)
2. Book Hotel (Success)
3. Book Rental Car (Fails!)
4. *Cancel Hotel* (Compensating action)
5. *Cancel Flight* (Compensating action)

There are two ways to coordinate a Saga: **Orchestration** (a central controller tells everyone what to do) and **Choreography** (services react to events autonomously). We will focus on Choreography.

## Choreography via Event Broker (Kafka)
In Choreography, there is no central brain. Services publish Domain Events to a message broker like Apache Kafka. Other services subscribe to those events, perform their local work, and publish new events. 

```text
[ Order Service ]             [ Inventory Service ]             [ Payment Service ]
        |                              |                                |
  1. Create Order                      |                                |
  (Status: PENDING)                    |                                |
        |-----(OrderCreatedEvent)----->|                                |
        |                              | 2. Deduct Inventory            |
        |                              |                                |
        |                              |-----(InventoryReservedEvent)-->|
        |                              |                                | 3. Charge Card
        |                              |                                |    (FAILS!)
        |                              |<----(PaymentFailedEvent)-------|
        |                              |                                |
        |                        4. Restore Inventory                   |
        |                           (Compensating Tx)                   |
        |<----(InventoryRestoredEvent)-|                                |
        |                              |                                |
  5. Mark Order                        |                                |
     as CANCELLED                      |                                |
```

## Implementation: Designing the Handlers
In Choreography, every service acts as a state machine reacting to specific events. Let's look at how the `InventoryService` handles this in Node.js.

```typescript
// Inside Inventory Service
class InventorySagaHandler {
    constructor(private db: InventoryDatabase, private kafka: KafkaProducer) {}

    // Forward Action
    async onOrderCreated(event: OrderCreatedEvent) {
        try {
            // Local ACID transaction
            await this.db.reserveStock(event.productId, event.quantity);
            
            // Publish success event to trigger Payment Service
            await this.kafka.publish('InventoryReserved', { 
                orderId: event.orderId, 
                amount: event.totalPrice 
            });
        } catch (error) {
            // E.g., Out of stock. Fail the saga!
            await this.kafka.publish('InventoryReservationFailed', { 
                orderId: event.orderId, reason: "OUT_OF_STOCK" 
            });
        }
    }

    // Compensating Action (Rollback)
    async onPaymentFailed(event: PaymentFailedEvent) {
        // The payment failed. We must undo our previous reservation.
        await this.db.restoreStock(event.productId, event.quantity);
        
        // Let the Order Service know we have successfully compensated
        await this.kafka.publish('InventoryRestored', { 
            orderId: event.orderId 
        });
    }
}
```

## The Catch: Designing for Failure
Choreography using Kafka scales beautifully because it is entirely asynchronous and decoupled. The `OrderService` doesn't even know the `InventoryService` exists; it just knows it published an event.

However, building event-driven Sagas introduces immense complexity:

### 1. Idempotency is Mandatory
Kafka guarantees *at-least-once* delivery. This means the `InventoryService` might receive the same `PaymentFailedEvent` twice. Your database logic must be **idempotent**—running the `restoreStock` method twice for the same order must not restore double the inventory. You usually achieve this by tracking processed `eventId`s in a unique database table.

### 2. Eventual Consistency
While the Saga is executing, the system is in an eventually consistent state. If a user queries the `OrderService` at step 2, the order looks successful, even though the payment hasn't happened yet. You must design your UI to reflect "Pending" or "Processing" states.

### 3. Observability Hell
Because there is no central orchestrator, debugging a stuck Saga is difficult. If an order gets stuck in "Pending", you must trace the `orderId` across Kafka logs to find out which service threw a silent error and failed to publish the next event. A centralized distributed tracing tool (like Jaeger or Datadog) is absolutely required.

Despite the complexity, Choreographed Sagas remain the most scalable, resilient way to manage distributed transactions across independent microservice domains.