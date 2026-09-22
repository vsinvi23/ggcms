# Microservice Resilience: Processing Poison Pills and Implementing Dead Letter Queues

## The Problem: The Catastrophic Retry Loop

In asynchronous message-driven architectures (using RabbitMQ, AWS SQS, or Apache Kafka), consumer services process streams of background tasks. When a consumer encounters a transient error—such as a database connection timeout or a temporary network blip—the standard resilience pattern is to reject or nack (negative acknowledge) the message so it can be retried.

However, if the failure is caused by a **Poison Pill**—a malformed message payload, a corrupted schema, or an invalid business transaction that can *never* succeed—this naive retry logic creates a severe system-wide failure. The consumer immediately pulls the rejected message back from the queue, fails again, and re-enqueues it. 

```
[ Main Queue ] ---> Consumer Processes Message
      ^                      |
      | (Re-enqueue)         v
      +----------------- [ CRASH! (Poison Pill) ]
```

This "infinite retry loop" quickly exhausts database connection pools, floods application loggers, burns excessive CPU cycles, and blocks all valid messages behind it in the queue—a phenomenon known as **Head-of-Line (HoL) Blocking**.

---

## The Mental Model: Progressive Escalation and Isolation

To build a resilient message pipeline, we must segregate transient errors from permanent errors. The mental model is **Progressive Escalation with Terminal Isolation**.

We construct a multi-tiered pipeline:
1. **Immediate Retry**: Try processing again up to 3 times for immediate recovery from transient blips.
2. **Delayed Retry (Backoff)**: Route the message to a dedicated Retry Queue with a Time-to-Live (TTL) delay (e.g., 5s, 30s, 60s) before re-injecting it into the main stream. This relieves pressure on struggling downstream dependencies.
3. **Isolation (Dead Letter Queue)**: If the message exceeds the maximum retry threshold (indicating it is likely a poison pill), stop processing, strip it from the active flow, and route it to a **Dead Letter Queue (DLQ)**.

```
                  +--------------------------------+
                  |           Main Queue           | <--- New Messages
                  +--------------------------------+
                                  |
                                  v
+-----------+            +-----------------+
|   DLQ     | <--------- |    Consumer     | -- (Success) ---> [ Done ]
+-----------+ (Exceeded  +-----------------+
  (Terminal    Max Retries)       | (Transient Failure)
  Isolation)                      v
                  +--------------------------------+
                  |          Retry Queue           |
                  |     (Exponential Delay)        |
                  +--------------------------------+
```

This guarantees that the main queue remains unblocked, allowing healthy transactions to process smoothly while isolating problematic messages for manual inspection.

---

## Implementing a Resilient Consumer with DLQ Fallback

The following TypeScript code implements a robust message processor featuring payload validation, retry-count tracking, and automatic DLQ routing.

```typescript
interface Message {
  id: string;
  payload: string;
  metadata: {
    retryCount: number;
    maxRetries: number;
  };
}

class QueueService {
  public async publishToDLQ(msg: Message, reason: string): Promise<void> {
    console.warn(`[DLQ ENQUEUE] Message ID ${msg.id} sent to DLQ. Reason: ${reason}`);
    // Code to publish message directly to DLQ broker exchange
  }

  public async publishToRetryQueue(msg: Message): Promise<void> {
    msg.metadata.retryCount++;
    console.log(`[RETRY ENQUEUE] Message ID ${msg.id} delayed. Retry attempt: ${msg.metadata.retryCount}`);
    // Code to publish to delay queue (TTL expiration sends back to main queue)
  }
}

export class OrderProcessingConsumer {
  constructor(private queueService: QueueService) {}

  public async onMessageReceived(message: Message): Promise<void> {
    try {
      // 1. Strict Format Validation (Detect Poison Pills Immediately)
      const data = this.parseAndValidatePayload(message.payload);
      
      // 2. Execute Business Logic
      await this.processOrder(data);
      console.log(`[SUCCESS] Message ${message.id} processed.`);
    } catch (error: any) {
      this.handleFailure(message, error);
    }
  }

  private handleFailure(message: Message, error: Error): void {
    const isPoisonPill = error instanceof SyntaxError || error.message.includes('INVALID_SCHEMA');

    if (isPoisonPill || message.metadata.retryCount >= message.metadata.maxRetries) {
      // Move to Dead Letter Queue immediately
      this.queueService.publishToDLQ(message, error.message);
    } else {
      // Route to Delayed Retry Queue for transient errors
      this.queueService.publishToRetryQueue(message);
    }
  }

  private parseAndValidatePayload(payload: string) {
    // Throws SyntaxError if JSON is malformed (Poison Pill)
    const parsed = JSON.parse(payload);
    if (!parsed.orderId || !parsed.amount) {
      throw new Error('INVALID_SCHEMA: Missing required fields');
    }
    return parsed;
  }

  private async processOrder(order: any): Promise<void> {
    // Mock processing logic (may throw transient Database errors)
  }
}
```

---

## Architectural Guardrails and Trade-offs

1. **DLQ Monitoring**: An unmonitored DLQ is useless; it is just a slow memory leak on your disk. Set up active alerts (e.g., PagerDuty) on the size of the DLQ to notify developers immediately when poison pills are detected.
2. **Metadata Context Preservation**: When writing a message to the DLQ, always append diagnostic headers containing the error message, the stack trace, the failing worker's hostname, and the original ingestion timestamp.
3. **Idempotency**: Because messages are retried across multiple consumers, your downstream services must be fully idempotent to avoid duplicate mutations (e.g., billing a credit card twice).
