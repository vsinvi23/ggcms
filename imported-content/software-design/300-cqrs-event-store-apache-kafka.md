# CQRS Architecture: Building an Append-Only Event Store with Apache Kafka Log Segments

## The Problem: Dual-Purpose Database Contention

Traditional enterprise systems rely on a single relational database for both operational writes and complex analytical reads. This dual-purpose design creates severe architectural friction. 

First, write workloads require highly normalized schemas to prevent data anomaly and enforce integrity constraints, while read workloads require denormalized schemas to avoid costly table joins. Second, write contention leads to aggressive row or table locking, degrading the throughput of read operations. Lastly, standard databases store only the *current* state of the application. The historical transitions—the critical "why" and "how" of business processes—are permanently lost. For instance, if a customer updates an order amount from \$100 to \$50, standard databases overwrite the row, destroying the audit trail unless complex, error-prone manual history tables are designed.

---

## The Mental Model: Sequential Append-Only Logs

Command Query Responsibility Segregation (CQRS) solves this by decoupling the write path from the read path. At the core of a CQRS system is the event-sourced Write Model. Instead of mutating a state table, the write model emits immutable **Domain Events** (e.g., `OrderCreated`, `ItemAdded`, `PaymentProcessed`) to an append-only, sequential store.

Apache Kafka is structurally optimized to serve as this immutable event store. It does not use expensive indexes; instead, it writes incoming messages sequentially to **Log Segments** on disk.

```
[ Command API ] ---> Validate Command ---> [ Producer ]
                                                 |
                                                 v
                                    [ Kafka Partition Log ]
                                    +-----------------------+
                                    | Segment 01 (Immutable)|
                                    | Offset 00: OrderCreated
                                    | Offset 01: ItemAdded  |
                                    | Offset 02: Paid       | <--- Sequential Appends
                                    +-----------------------+
                                                 |
                       +-------------------------+-------------------------+
                       | (Asynchronous Pull)                               | (Historical Replay)
                       v                                                   v
            [ Projector Consumer ]                                [ Analytics Consumer ]
                       |                                                   |
                       v                                                   v
            [ Read DB (MongoDB/Redis) ]                           [ Data Lake (S3/BigQuery) ]
            (Fast, denormalized reads)                             (Business Intelligence)
```

By leveraging Kafka's physical log structure, we achieve extremely high sequential write throughput ($O(1)$ complexity) and absolute audit preservation. The read model is generated asynchronously by **Projectors** (Kafka consumers) that read the event log sequentially and update a highly optimized read database (e.g., Redis or Elasticsearch).

---

## Implementing the Command-to-Event Pattern

The following TypeScript example demonstrates how to process a write command (`CreateOrder`), write the resulting domain event to Kafka, and handle partition key assignments to ensure strict ordering of events per order entity.

```typescript
import { Kafka, Producer, RecordMetadata } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'order-write-service',
  brokers: ['localhost:9092'],
});

const producer: Producer = kafka.producer();

interface OrderCommand {
  orderId: string;
  customerId: string;
  items: { productId: string; qty: number; price: number }[];
}

interface OrderCreatedEvent {
  eventType: 'OrderCreated';
  version: number;
  timestamp: string;
  data: OrderCommand;
}

export class OrderCommandHandler {
  async init() {
    await producer.connect();
  }

  async handleCreateOrder(command: OrderCommand): Promise<RecordMetadata[]> {
    // 1. Business Logic & Validation (Write Model State Checks)
    if (command.items.length === 0) {
      throw new Error('Order must contain at least one item.');
    }

    // 2. Generate Immutable Domain Event
    const event: OrderCreatedEvent = {
      eventType: 'OrderCreated',
      version: 1,
      timestamp: new Date().toISOString(),
      data: command,
    };

    // 3. Append sequentially to Kafka. 
    // The orderId is used as the partition key to guarantee all events for this
    // specific order are appended to the exact same partition in strict sequence.
    return await producer.send({
      topic: 'orders-event-store',
      messages: [
        {
          key: command.orderId,
          value: JSON.stringify(event),
        },
      ],
    });
  }

  async shutdown() {
    await producer.disconnect();
  }
}
```

---

## Architectural Guardrails and Trade-offs

1. **Eventual Consistency**: The read path lag is inevitable because projections run asynchronously. If a client reads immediately after a write, they may see stale data. Mitigate this by returning the event offset in the write response, allowing the client to poll or wait for the read-model index to catch up to that offset.
2. **Schema Evolution**: Over time, events will change schema. You must enforce strict backward compatibility (e.g., using an Avro Schema Registry) to prevent consumer crashes during historical event replays.
3. **Log Compaction Risks**: Do not enable standard Kafka log compaction on the event store if you require historical replay of intermediate states. Compacted topics only retain the latest message per key, which destroys the event history.
