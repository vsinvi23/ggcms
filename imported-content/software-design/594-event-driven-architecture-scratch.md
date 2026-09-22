# Event-Driven Architecture from Scratch

## The Problem: Synchronous Coupling

Most developers start by building REST APIs. When `Service A` needs something from `Service B`, it makes an HTTP call. 

Consider a user registration flow:
1. Save user to the database.
2. Send a welcome email.
3. Add user to the analytics platform.

In a synchronous world, the `User Service` executes this sequentially:

```python
def register_user(request):
    user = db.save(request)
    
    # Synchronous HTTP calls
    email_service.send_welcome(user.email) 
    analytics_service.track_signup(user.id)
    
    return {"status": "success"}
```

This introduces massive fragility. 
*   **Latency:** The user waits for the email and analytics services to respond before the HTTP request finishes.
*   **Availability:** If the `Analytics Service` goes down, the `User Service` fails, and users cannot register.
*   **Coupling:** The `User Service` must know the exact API signatures and network addresses of downstream dependencies.

## The Solution: Fire-and-Forget Events

Event-Driven Architecture (EDA) flips the dependency graph. Instead of the `User Service` commanding other services to do work, it simply announces that something happened in the past: an **Event**.

An event is an immutable statement of fact. E.g., `UserRegisteredEvent`. 

The `User Service` fires this event into a central Message Broker and immediately returns a success response to the client. It forgets about the event entirely. Downstream services independently subscribe to the broker and react to the event.

```text
[Client] -> HTTP POST -> [User Service]
                             |
                             +-- (db.save)
                             |
                             +-- Publish: { "event": "UserRegistered", "userId": 123 }
                             v
                     [ MESSAGE BROKER ]
                             |
         +-------------------+-------------------+
         |                                       |
    [Email Service]                      [Analytics Service]
   (Consumes Event)                       (Consumes Event)
   (Sends Welcome)                        (Tracks Signup)
```

## Implementing EDA: The Core Concepts

### 1. The Producer
The producer constructs the event payload. The payload should contain enough context so consumers don't have to immediately query the producer's API for missing data (which would defeat the purpose of decoupling).

```json
// UserRegisteredEvent
{
  "eventId": "a1b2-c3d4",
  "timestamp": "2026-05-12T10:00:00Z",
  "eventType": "USER_REGISTERED",
  "payload": {
    "userId": "123",
    "email": "user@example.com",
    "tier": "free"
  }
}
```

### 2. The Broker
The message broker (e.g., RabbitMQ, Kafka, AWS EventBridge) acts as the intermediary. It handles the routing, durability, and delivery guarantees of the events. If a consumer is temporarily offline, the broker stores the event and delivers it when the consumer recovers.

### 3. The Consumer
Consumers listen to specific event types. They must be designed to be **Idempotent**. Because networks are unreliable, brokers often provide "At-Least-Once" delivery guarantees. This means a consumer might receive the same `UserRegisteredEvent` twice.

```python
# Idempotent Consumer Logic
def handle_user_registered(event):
    if db.analytics.exists(event.userId):
        # We already processed this event. Drop it.
        return 
        
    db.analytics.insert({
        "userId": event.payload.userId,
        "signupDate": event.timestamp
    })
```

## Event Carried State Transfer

A common pitfall in EDA is creating events that only contain an ID (e.g., `{"userId": 123}`). When the `Email Service` receives this, it must make a synchronous HTTP call back to the `User Service` to fetch the email address. We have accidentally recreated synchronous coupling!

To avoid this, use **Event Carried State Transfer**. The event payload must carry the state that downstream services need to do their jobs. Include the `email` directly in the event, as shown in the JSON example above.

## Conclusion

Event-Driven Architecture trades synchronous latency for asynchronous eventual consistency. It allows development teams to operate independently: you can add a new `Loyalty Points Service` that listens to `UserRegisteredEvent` without ever modifying or redeploying the `User Service`. 

While it introduces complexity in tracing and debugging (you can no longer follow a single HTTP request through the system), it is the mandatory foundation for building highly scalable, resilient microservice ecosystems.