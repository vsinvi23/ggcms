# Redis Messaging: Ephemeral Pub/Sub vs Persistent Redis Streams

## The Problem: The High Cost of Lost Messages
Redis is universally recognized as a blazing-fast, in-memory data store. When engineers need to implement messaging, event-driven architectures, or real-time notifications, Redis is often the first tool reached for. However, developers frequently stumble by choosing the wrong Redis messaging primitive. 

Historically, Redis provided **Pub/Sub**, a highly efficient messaging system. But as architectures grew into distributed microservices requiring guaranteed delivery, Pub/Sub's fundamental flaw became apparent: it is entirely ephemeral. If a subscriber disconnects for a network blip, or if a service is deployed and briefly offline, any messages broadcast during that window are permanently lost. There is no history, no persistence, and no recovery. To solve this, Redis 5.0 introduced **Redis Streams**, fundamentally changing how robust messaging is handled in the Redis ecosystem.

## The Mental Model: Fire-and-Forget vs The Log
Understanding the difference requires shifting from a "broadcast" mental model to an "append-only log" mental model.

**Redis Pub/Sub (The Radio Broadcast)**
```text
Publisher ──(PUBLISH)──> Channel (news) ──> Subscriber A (Online - Receives)
                                        ──> Subscriber B (Offline - Misses out)
```
Pub/Sub acts like a radio tower. It broadcasts data instantly to anyone currently tuned in. Once the transmission is over, the data is gone forever.

**Redis Streams (The Append-Only Log)**
```text
Producer ──(XADD)──> Redis Stream (Log) <──(XREAD)── Consumer A
                          │             <──(XREADGROUP)── Consumer Group (Microservice cluster)
                          ├── Msg 1 (Read by A)
                          ├── Msg 2 (Pending Ack)
                          └── Msg 3 (Unread)
```
Streams act like a sequential ledger (similar to Apache Kafka). Messages are appended to a persistent log. Consumers can read from the beginning, read from the end, or track their progress using Consumer Groups. Offline consumers can seamlessly resume reading where they left off once they reconnect.

## Deep Dive: Pub/Sub Internals
In Redis Pub/Sub, the server maintains a dictionary where keys are channel names and values are linked lists of connected client pointers. When a `PUBLISH channel message` command is received, Redis iterates through the linked list and synchronously writes the message to the socket buffers of all subscribed clients. 

Because it doesn't write to disk or allocate long-term memory for the messages, Pub/Sub has incredibly low latency and high throughput. However, memory is bounded solely by the size of the outgoing network buffers. If a client is too slow to consume, the buffer fills up, and Redis will forcefully drop the client to protect itself.

## Deep Dive: Redis Streams Internals
Redis Streams implement a radically different internal data structure: the **Radix Tree** (specifically, an implementation called a Rax). 

When you use `XADD mystream * sensor_id 1234 temperature 19.8`, Redis appends an entry to the radix tree. The ID (usually an auto-generated millisecond timestamp) forms the path in the tree, allowing for highly optimized, memory-efficient lookups by time. 

Because a Stream is a persistent data structure in memory, it survives client disconnections. It is also persisted to disk if you have RDB snapshots or AOF (Append Only File) enabled. 

To manage competing consumers (like multiple instances of an order-processing microservice), Streams provide **Consumer Groups**. 

### Consumer Groups and Acknowledgements
Consumer groups allow multiple workers to cooperatively consume a single stream without processing the same message twice. 
1. **XREADGROUP**: A worker requests the next unread message. Redis marks this message as "Pending" and assigns it to that specific worker.
2. **XACK**: Once the worker successfully processes the message (e.g., writes to a database), it sends an `XACK`. Redis then removes the message from the Pending Entries List (PEL).

If a worker crashes before sending an `XACK`, the message remains in the PEL. Another worker can use the `XPENDING` and `XCLAIM` commands to detect stalled messages and reassign them, guaranteeing at-least-once delivery semantics.

## Choosing the Right Tool
The decision matrix is straightforward:
- Use **Pub/Sub** for ephemeral, fire-and-forget data where loss is acceptable. Examples include real-time UI updates (chat rooms, live sports scores), cache invalidation broadcasts, or high-frequency telemetry where the next tick replaces the current one.
- Use **Redis Streams** when message loss is unacceptable and you need durability. Examples include order processing pipelines, activity feeds, asynchronous job queues, and architectures where services need to scale horizontally and cooperatively consume events.

## Conclusion
While Pub/Sub remains an excellent tool for synchronous, transient broadcasting, it is not a robust event queue. Redis Streams brought Kafka-like durability and consumer group semantics directly into the Redis ecosystem. By understanding the memory and delivery guarantees of both, you can ensure your distributed architecture remains resilient against inevitable network partitions and service restarts.
