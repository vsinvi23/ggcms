# CQRS UI Patterns: Handling Eventual Consistency with WebSockets and Polling

The Command Query Responsibility Segregation (CQRS) pattern is a powerful architectural paradigm. By physically and logically separating the write model (Commands) from the read model (Queries), teams can scale ingestion separately from data retrieval, optimize database schemas for specific access patterns, and embrace event-driven architectures.

However, CQRS introduces a notorious UX nightmare: **Eventual Consistency**.

In a traditional CRUD monolith, a write operation and a read operation target the same transactional database. If a user changes their username and the page reloads, the new name is instantly visible. In CQRS, the write updates a Command DB, emits an event, and asynchronously updates a Read DB. 

This article explores how to bridge the gap between an asynchronous backend and a user's expectation of synchronous immediacy.

## The Problem: The Synchronous Lie

Imagine a user submitting a "Create Order" form. The API receives the request, writes an `OrderCreated` event to an append-only event store (like Kafka or EventStoreDB), and immediately returns an `HTTP 202 Accepted`. 

The Single Page Application (SPA) receives the 202, transitions to a success state, and immediately routes the user to the "Order History" page. But the Read Model projection hasn't finished processing the Kafka event yet. The Order History is empty. The user hits refresh out of confusion, potentially triggering duplicate submissions. 

### The Mental Model: The Restaurant Kitchen

To solve this, we must align the system's architecture with real-world asynchronous processes. When you order food at a busy fast-casual restaurant, you don't stand at the register waiting for the burger to materialize. The cashier hands you a **buzzer** (a token) and you step aside. When the kitchen (the backend) finishes your order (the projection), the buzzer flashes (the event notification), and you retrieve your food.

## Strategy 1: Client-Side Correlation IDs and Polling

The most robust mechanism for tracking an asynchronous command is the **Correlation ID**.

1. **Generation:** The client (not the server) generates a UUID v4 (the Correlation ID) before submitting the form.
2. **Transmission:** The client passes this ID in the header (e.g., `X-Correlation-ID`) or payload of the POST request.
3. **Propagation:** The Command Handler attaches this Correlation ID to the emitted domain event.
4. **Tracking:** The UI enters a loading state. It begins polling a dedicated `/api/commands/{correlation-id}/status` endpoint.
5. **Resolution:** When the Read Model successfully processes the event, it updates a fast KV store (like Redis) marking the correlation ID as `COMPLETED`. The next poll returns success, and the UI fetches the updated data.

### The Cost of Polling

While simple to implement, short-polling (pinging every 500ms) acts as a self-inflicted DDoS attack. If 10,000 users are waiting for updates, your API gateway is flooded with 20,000 useless requests per second.

## Strategy 2: WebSocket Subscriptions and Push Notifications

To eliminate polling overhead, modern distributed systems rely on bidirectional communication channels—typically WebSockets or Server-Sent Events (SSE)—coupled with an internal Pub/Sub broker (like Redis Pub/Sub).

### The Architecture

```text
[Browser] --- (1) Submit Command (w/ Correlation ID) ---> [Command API]
   |                                                            |
   |                                                        (2) Emit Event
   |                                                            |
   +---- (3) Subscribe WS: /user/123/updates                 [Kafka Bus]
                 ^                                              |
                 |                                        (4) Projection
            [WS Server] <--- (5) Publish "View Updated" --- [Read API]
```

1. **Submission:** The user submits the command. The UI enters a loading state.
2. **Subscription:** Simultaneously, the UI establishes a WebSocket connection (or reuses an existing one) listening to a user-specific channel, such as `ws://api.internal/notifications?userId=123`.
3. **Projection & Publish:** The background worker processes the Kafka event, writes to the Read Database, and immediately publishes a lightweight notification message to Redis Pub/Sub: `{"type": "ORDER_READY", "correlationId": "abc-123"}`.
4. **Push:** The WebSocket server, subscribed to Redis, pushes this payload directly to the client.
5. **Resolution:** The UI intercepts the WebSocket message, matches the Correlation ID, removes the loading spinner, and seamlessly injects the new data into the DOM or triggers a background data refetch.

### The Illusion of Immediacy (Optimistic UI)

If sub-second latency is absolutely critical (e.g., hitting "Like" on a post), rely on **Optimistic Updates**. The UI immediately updates its local state (Redux/Zustand) assuming the backend command will succeed. If the WebSocket eventually pushes a failure event, the UI rolls back the state and surfaces an error toast. 

By utilizing Correlation IDs and WebSocket push architectures, architects can embrace the scalability of CQRS without sacrificing the crisp, synchronous feel of a modern application.