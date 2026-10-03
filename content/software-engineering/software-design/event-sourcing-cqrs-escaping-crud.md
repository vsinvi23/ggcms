---
title: "Event Sourcing and CQRS: Escaping the CRUD Bottleneck"
description: "Why overwriting state with UPDATE destroys business history, how Event Sourcing replaces it with an immutable append-only log, and how CQRS splits reads and writes into independently optimized paths."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "DEEP_DIVE"
tags:
  - "event-sourcing"
  - "cqrs"
  - "microservices"
  - "eventual-consistency"
  - "distributed-systems"
  - "domain-driven-design"
---

# Event Sourcing and CQRS: Escaping the CRUD Bottleneck

> Decouple reads from writes with CQRS, and replace destructive state overwrites with an immutable, replayable log of business events.

## The Problem: The Destructive Nature of UPDATE and DELETE

Most web applications are built on CRUD (Create, Read, Update, Delete). When a user changes their address, the application runs an `UPDATE` statement, and the old value is gone forever, overwritten in place.

This works fine until you need to answer a question CRUD databases were never designed to answer: *how* did the system arrive at its current state? A CRUD table only knows the *current* state — it has state amnesia about everything that led to it.

If you look at a bank account row and see `balance: $50`, you can't tell from the row alone whether the user deposited $50 once, deposited $100 and withdrew $50, or an administrator manually corrected a billing error. The business intent behind every mutation was destroyed the moment the `UPDATE` ran. If a regulator later asks "what was this account's balance exactly three weeks ago at 2:00pm?", a pure CRUD system with no purpose-built audit trail simply cannot answer.

## Why the Problem Is Hard: One Database, Two Contradictory Jobs

In a normalized CRUD schema, the same database engine has to serve two workloads that want opposite things:

1. **Writes** need to be strict, normalized (3NF), locked, and ACID — optimized for correctness.
2. **Reads**, especially dashboards, need to be denormalized, flattened, and fast — optimized for speed.

Forcing one schema and one engine to satisfy both leads to the familiar failure mode: a UI dashboard triggers a 15-table `JOIN`, that query competes for locks with the write path, and under real traffic you get index bloat and deadlocks.

## A Simple Mental Model: The Accountant's Ledger

Event Sourcing borrows directly from double-entry bookkeeping.

```
     STANDARD CRUD DATABASE                    EVENT-SOURCED LEDGER
  ==========================             ================================
  Balance: $200 (current state only)     Event 1: AccountCreated ($0)
                                          Event 2: SalaryDeposited (+$500)
                                          Event 3: RentPaid (-$300)
                                          --------------------------------
                                          Derived balance = $200
```

An accountant never uses an eraser (`UPDATE`) or white-out (`DELETE`). A mistake gets a *reversing entry*, appended after it, never a rewrite of history. The ledger is an immutable, append-only log of facts; the current balance is simply the result of replaying every entry from the start.

## Under the Hood: Event Sourcing Paired with CQRS

Event Sourcing is almost always deployed alongside **CQRS** (Command Query Responsibility Segregation), which formalizes the idea that reading and writing are different operations deserving different data paths.

```text
                              +------------------+
                              |   Frontend UI    |
                              +--------+---------+
                                       |
              1. Send Command                    5. Read Query
              (e.g. "Add Item to Cart")           (fetch dashboard)
                                       |
        +------------------------------+     +------------------------------+
        |         WRITE PATH           |     |          READ PATH           |
        |  (Command Side)              |     |  (Query Side)                |
        |                               |     |                              |
        | +---------------------+       |     |  +------------------------+  |
        | | Command Handler     |       |     |  | Query Handler          |  |
        | | (validates business |       |     |  | (no JOINs, no locks)   |  |
        | |  rules)             |       |     |  +-----------+------------+  |
        | +----------+----------+       |     |              ^               |
        |            | 2. append        |     |              | 6. fast fetch |
        |            v                  |     |  +-----------+------------+  |
        | +---------------------+       |     |  | Read DB                |  |
        | | Event Store         |       |     |  | (Redis / Elasticsearch |  |
        | | (append-only,       |       |     |  |  / MongoDB)            |  |
        | |  e.g. Kafka,        |       |     |  +------------------------+  |
        | |  EventStoreDB)      |       |     |              ^               |
        | +----------+----------+       |     |              |               |
        +------------|------------------+     +--------------|---------------+
                      |                                       |
                3. publish event asynchronously                |
                      v                                       |
              +---------------------+     4. update materialized view
              | Projection Engine   |------------------------->
              | (async worker)      |
              +---------------------+
```

**1. The command side (write path).** A user action such as "add item to cart" arrives as a **command**, not a direct state mutation. The command handler validates business rules ("is the item in stock?"). If valid, it generates an immutable **event** (`ItemAddedToCartEvent`) and appends it to the event store. No `UPDATE` ever happens — the write side only ever performs inserts, which is why it stays fast even under heavy write load.

**2. The projection engine (the bridge).** An asynchronous worker picks up newly appended events and translates each business event into a flat, read-optimized document.

**3. The query side (read path).** The projector writes that flattened document into a dedicated read database (MongoDB, Elasticsearch, Redis). When the UI loads a dashboard, it queries this database directly — no joins, because the data was already pre-flattened specifically for that view.

## The Cost: Eventual Consistency

This architecture introduces the hardest concept in distributed systems: **eventual consistency**. Because the projection engine runs asynchronously, there's a real, physical delay — milliseconds to seconds — between the event being committed to the store and the read database reflecting it.

If a user clicks "Add to Cart" and the UI immediately re-queries the read database, the cart might still appear empty. The user assumes the button is broken and clicks it five more times.

**Engineering mitigations:**
- **Optimistic UI updates** — update the local DOM/state immediately on the client, without waiting for the read-side confirmation.
- **Push notification on projection completion** — the frontend subscribes over a WebSocket and refreshes only once the projector signals the read model is updated, instead of polling blindly.

## Code Example: Event Sourcing a Shopping Cart

The following Python example shows an event-sourced aggregate. Its state is never mutated by ordinary setters — it's mutated strictly by applying events, and it can rebuild itself entirely from its event history.

```python
import uuid
from typing import List, Dict, Any
from datetime import datetime

# --- DOMAIN EVENTS ---
# Events are written in the past tense: they represent immutable facts.
class Event:
    pass

class CartCreatedEvent(Event):
    def __init__(self, cart_id: str, customer_id: str):
        self.cart_id = cart_id
        self.customer_id = customer_id
        self.timestamp = datetime.utcnow()

class ItemAddedEvent(Event):
    def __init__(self, cart_id: str, sku: str, price: float):
        self.cart_id = cart_id
        self.sku = sku
        self.price = price
        self.timestamp = datetime.utcnow()

class ItemRemovedEvent(Event):
    def __init__(self, cart_id: str, sku: str):
        self.cart_id = cart_id
        self.sku = sku
        self.timestamp = datetime.utcnow()


# --- THE AGGREGATE (event-sourced entity) ---
class ShoppingCart:
    def __init__(self):
        self.id = None
        self.customer_id = None
        self.items: Dict[str, float] = {}
        self.is_active = False
        # Events not yet persisted to the event store.
        self._uncommitted_events: List[Event] = []

    # --- COMMAND METHODS (business logic validation) ---
    @classmethod
    def create(cls, customer_id: str):
        cart = cls()
        event = CartCreatedEvent(str(uuid.uuid4()), customer_id)
        cart._apply(event)
        cart._uncommitted_events.append(event)
        return cart

    def add_item(self, sku: str, price: float):
        if not self.is_active:
            raise ValueError("Cannot add items to an inactive cart!")
        if price < 0:
            raise ValueError("Price cannot be negative!")

        event = ItemAddedEvent(self.id, sku, price)
        self._apply(event)
        self._uncommitted_events.append(event)

    def remove_item(self, sku: str):
        if sku not in self.items:
            raise ValueError("Item not in cart!")

        event = ItemRemovedEvent(self.id, sku)
        self._apply(event)
        self._uncommitted_events.append(event)

    # --- EVENT APPLICATION (the only place state actually changes) ---
    def _apply(self, event: Event):
        if isinstance(event, CartCreatedEvent):
            self.id = event.cart_id
            self.customer_id = event.customer_id
            self.is_active = True
        elif isinstance(event, ItemAddedEvent):
            self.items[event.sku] = event.price
        elif isinstance(event, ItemRemovedEvent):
            del self.items[event.sku]

    # --- REHYDRATION (rebuild state purely from history) ---
    @classmethod
    def load_from_history(cls, events: List[Event]):
        cart = cls()
        for event in events:
            cart._apply(event)
        return cart


if __name__ == "__main__":
    print("[*] Simulating command path...")
    cart = ShoppingCart.create("user_9983")
    cart.add_item("SKU-MACBOOK", 1200.00)
    cart.add_item("SKU-MOUSE", 50.00)
    cart.remove_item("SKU-MOUSE")

    # In production these events go to Kafka/EventStoreDB, not a local list.
    database_event_stream = cart._uncommitted_events

    print("\n--- Immutable event log saved to the store ---")
    for e in database_event_stream:
        print(f"[{e.timestamp.strftime('%H:%M:%S')}] {type(e).__name__} -> {vars(e)}")

    print("\n--- Rebuilding state after a simulated restart ---")
    restored_cart = ShoppingCart.load_from_history(database_event_stream)
    print(f"Restored Cart ID: {restored_cart.id}")
    print(f"Restored Items: {restored_cart.items}")
```

## Security Analysis: The Immutability Guarantee

Event Sourcing has a direct benefit for **repudiation** threats. In a CRUD database, a malicious insider with write access can run an `UPDATE` on a transaction amount, and there's no cryptographic proof of what happened unless someone built elaborate audit triggers.

In a true Event Sourcing architecture:
- The event store is **append-only** — `UPDATE`/`DELETE` privileges are revoked at the database IAM layer, not just discouraged by convention.
- Events can be hash-chained, similar to a blockchain ledger. Tampering with a historical event on disk breaks the chain's cryptographic signature, which is detectable and should alert your security operations team immediately.

## Common Misconceptions

**Misconception:** "Rebuilding state from millions of events will take forever."
**Reality:** Event-sourced systems use **snapshots**. Every N events, the system serializes the current calculated state as a snapshot. Loading an entity means fetching the latest snapshot and replaying only the handful of events that occurred after it — not the entire history.

**Misconception:** "CQRS should be used for every microservice."
**Reality:** CQRS adds real architectural cost — a second database, a message broker, and eventual-consistency debugging. Reserve it for genuinely high-contention, high-value bounded contexts (an order engine, a payment ledger). A simple user-preferences service should stay plain CRUD.

## Pause and Think

> If a user invokes their GDPR "right to be forgotten," how do you delete their data when the event store is strictly append-only?

### Answer

You don't delete the events — you use **crypto-shredding**. When the user's account is created, their PII is encrypted with a dedicated symmetric key, unique to that user, and only the encrypted payload is ever written into events. When a deletion request arrives, you delete that one encryption key from your KMS. The historical events remain in the immutable log — satisfying the append-only guarantee — but the PII inside them becomes permanently unrecoverable ciphertext, satisfying the deletion requirement.

## Key Takeaways

- Standard CRUD destroys historical business intent every time an `UPDATE` or `DELETE` runs.
- Event Sourcing stores state as an append-only sequence of immutable facts, enabling perfect auditability and point-in-time reconstruction.
- CQRS physically separates the read and write paths, letting writes stay strict and normalized while reads stay flat and fast.
- The trade-off for both patterns is eventual consistency between the write path and the read-optimized projections, which your UI must be designed around.

## What to Learn Next

- Domain-Driven Design concepts — Aggregates, Bounded Contexts, Ubiquitous Language — which Event Sourcing is usually built on top of.
- The Transactional Outbox pattern, for guaranteeing atomicity between a database write and publishing the corresponding event.
- The Saga pattern (Choreography vs Orchestration), for coordinating multi-step business transactions across CQRS-based microservices.
