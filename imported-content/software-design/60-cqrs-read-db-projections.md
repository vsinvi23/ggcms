# CQRS Projections: Syncing Write and Read DBs Asynchronously

## The Problem: The Dual Nature of Data
In traditional CRUD (Create, Read, Update, Delete) applications, we use the same data model and the same database to handle both writes and reads. For early-stage applications, this is efficient and simple. But as the system scales, a fundamental conflict emerges: the optimal structure for *writing* data is entirely different from the optimal structure for *reading* it.

When writing data, you want strict normalization. You want to enforce constraints, check business rules, maintain ACID compliance, and minimize redundant data. A relational database (like PostgreSQL) is perfect for this.

When reading data, however, users expect lightning-fast responses, complex aggregations, and full-text search. Joining five normalized tables to render a single dashboard view is expensive and slow. As read traffic spikes, it starves the write operations of compute resources. You add indexes to speed up reads, but those exact indexes slow down your writes. 

## The Mental Model: CQRS and Eventual Consistency
Command Query Responsibility Segregation (CQRS) solves this conflict by physically separating the Write pathway (Commands) from the Read pathway (Queries). 

Instead of reading and writing to the same SQL tables, a CQRS system utilizes two distinct databases:
1.  **The Write Model (Command Database):** Highly normalized, strictly consistent, optimized for validation and business logic.
2.  **The Read Model (Query Database):** Denormalized, flat, optimized for immediate presentation. This could be MongoDB, Elasticsearch, or a materialized view in Redis.

The mechanism that bridges the gap between these two models is called a **Projection**. When a command modifies the write database, the system emits a Domain Event. A Projection listens to this event and asynchronously updates the read database to reflect the new state.

```text
                       [ CLIENT ]
                         |   ^
            (1) Command  |   | (5) Query
                         v   |
+-------------------+             +-------------------+
|   Command API     |             |    Query API      |
| (Write Pathway)   |             |  (Read Pathway)   |
+-------------------+             +-------------------+
         |                                  ^
         v                                  |
 [ Write Database ]                  [ Read Database ]
 (e.g., PostgreSQL)                  (e.g., Elasticsearch)
         |                                  ^
         |      (3) Domain Event            |
         +----------------------------------+
               Message Broker (Kafka)
                         |
                         v
                +-----------------+
                |   Projection    | <--- (4) Asynchronously 
                |    (Worker)     |      updates Read DB
                +-----------------+
```

## Implementation: Building a Projection Worker
Let's look at an e-commerce scenario. When a customer places an order, the Write system ensures inventory is available, processes payment, and creates normalized records for `orders`, `order_items`, and `shipping_details`.

Instead of running a massive `JOIN` query later to show the user their order history, we emit an `OrderCreated` event. 

```json
// The Domain Event published to Kafka
{
  "eventId": "evt_987",
  "eventType": "OrderCreated",
  "aggregateId": "ord_123",
  "timestamp": "2026-10-15T14:32:00Z",
  "payload": {
    "customerId": "cust_456",
    "totalAmount": 150.00,
    "items": [
      { "productId": "prod_1", "name": "Wireless Mouse", "qty": 1 }
    ]
  }
}
```

A dedicated Projection Worker consumes this event and creates a denormalized, ready-to-serve document in MongoDB.

```typescript
// Projection Worker Implementation
import { KafkaConsumer } from 'kafka-node';
import { MongoClient } from 'mongodb';

export class OrderHistoryProjection {
  constructor(private mongoDb: MongoClient) {}

  async handleEvent(event: DomainEvent) {
    if (event.eventType === 'OrderCreated') {
      const orderData = event.payload;
      
      // We store the data exactly as the UI needs to render it
      const readDocument = {
        orderId: event.aggregateId,
        customerId: orderData.customerId,
        summaryText: `${orderData.items.length} items totaling $${orderData.totalAmount}`,
        lastUpdated: event.timestamp,
        status: "PROCESSING"
      };

      await this.mongoDb.collection('CustomerOrderViews').updateOne(
        { orderId: event.aggregateId },
        { $set: readDocument },
        { upsert: true }
      );
    }
    
    if (event.eventType === 'OrderShipped') {
      // Fast, localized updates based on subsequent events
      await this.mongoDb.collection('CustomerOrderViews').updateOne(
        { orderId: event.aggregateId },
        { $set: { status: "SHIPPED", trackingUrl: event.payload.url } }
      );
    }
  }
}
```

## Trade-offs: The Cost of Eventual Consistency
CQRS and Projections enable massive scale. Your read databases can be replicated globally via CDNs, and you can rebuild your read models entirely by replaying historical events from the broker.

However, the cost of this architecture is **Eventual Consistency**. Because the projection happens asynchronously, there is a delay (typically milliseconds, but potentially longer under load) between when a user writes data and when they can read it. 

If a user updates their profile and immediately refreshes the page, they might see their old data. Mitigating this requires careful UX design:
1.  **Optimistic UI:** The frontend immediately renders the updated state locally, assuming the write succeeded.
2.  **Polling/WebSockets:** The client queries the backend for the specific read-model version, or waits for a WebSocket notification confirming the projection has finished processing.

Furthermore, projections must be **idempotent**. If the message broker delivers the same `OrderCreated` event twice due to a network hiccup, the projection must not create two duplicate records. Our use of MongoDB's `updateOne` with an `$upsert` (keyed by the aggregate ID) guarantees that processing the same event multiple times yields the same final state. 

CQRS is not for every system. But when read patterns diverge wildly from write patterns, it is the definitive architectural pattern for achieving decoupled, highly scalable systems.