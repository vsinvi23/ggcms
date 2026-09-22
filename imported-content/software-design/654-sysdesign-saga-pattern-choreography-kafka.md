# Decentralized Sagas: Designing Event-Driven Choreography Workflows over Kafka

## The Problem: Distributed Transactions Without Locking

In monolithic architectures, a multi-step workflow spanning different domains (e.g., placing an order, reserving inventory, charging a card) is handled via a single ACID database transaction. If charging the card fails, a `ROLLBACK` instantly reverses the inventory reservation.

In a microservices architecture, domains own their independent databases. Two-Phase Commit (2PC) distributed locks across network boundaries cause severe latency and cascading failures. The modern solution is the **Saga Pattern**, which breaks a distributed transaction into a sequence of local transactions. 

Sagas come in two flavors: *Orchestration* (a central controller dictates commands) and *Choreography* (services react to domain events autonomously). Choreography, often implemented over an event streaming platform like Kafka, maximizes decoupling but requires rigorous design to handle failures.

## Event-Driven Choreography

In Choreography, there is no central orchestrator. Each service listens for specific domain events, performs its local database transaction, and publishes a new event signaling its outcome. 

If a step fails, the system must trigger **Compensating Transactions**—events designed specifically to undo the work of previous steps.

## ASCII Architecture: Happy Path vs. Compensation

**Happy Path:**
```text
 [Order Service] ──(OrderCreated)──▶ [Kafka Topic] 
                                            │
 ┌──────────────────────────────────────────┘
 ▼
 [Inventory Service] (Reserves Items)
         │
         └──(InventoryReserved)──▶ [Kafka Topic]
                                            │
 ┌──────────────────────────────────────────┘
 ▼
 [Payment Service] (Charges Card)
         │
         └──(PaymentSucceeded)───▶ [Kafka Topic] ──▶ [Order Service] (Marks Complete)
```

**Failure & Compensation Path:**
```text
 [Inventory Service] ──(InventoryReserved)──▶ [Kafka Topic]
                                                    │
 ┌──────────────────────────────────────────────────┘
 ▼
 [Payment Service] (Card Declined!)
         │
         └──(PaymentFailed)──────▶ [Kafka Topic]
                                          │
 ┌────────────────────────────────────────┘
 ▼
 [Inventory Service] (Listens for PaymentFailed)
         │
         └──▶ Executes Compensation: Restores Inventory
```

## Implementation: State Machine and Idempotency

When implementing choreography, services must handle out-of-order events, network retries, and duplicate messages from Kafka. **Idempotency** and local state tracking are mandatory.

Below is a conceptual Go implementation of an Inventory Service participating in a Saga. It utilizes an Idempotency Key (the Order ID) to ensure compensation is safe.

```go
package saga

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
)

type Event struct {
	OrderID string `json:"order_id"`
	Type    string `json:"type"`
	Payload []byte `json:"payload"`
}

type KafkaProducer struct {
	// ... stub
}
func (k *KafkaProducer) Publish(eventType, orderID string) {}

type InventoryHandler struct {
	DB    *sql.DB
	Kafka *KafkaProducer
}

// HandleEvent is invoked by the Kafka consumer loop
func (h *InventoryHandler) HandleEvent(ctx context.Context, msg []byte) {
	var event Event
	json.Unmarshal(msg, &event)

	switch event.Type {
	case "OrderCreated":
		h.reserveInventory(ctx, event)
	case "PaymentFailed":
		h.compensateInventory(ctx, event)
	}
}

func (h *InventoryHandler) reserveInventory(ctx context.Context, event Event) {
	// 1. Begin local transaction
	tx, _ := h.DB.BeginTx(ctx, nil)
	defer tx.Rollback()

	// 2. Idempotency Check: Has this order already been processed?
	var exists bool
	tx.QueryRow("SELECT true FROM inventory_reservations WHERE order_id = $1", event.OrderID).Scan(&exists)
	if exists {
		return // Already reserved, ignore duplicate
	}

	// 3. Execute business logic
	_, err := tx.Exec("UPDATE products SET stock = stock - 1 WHERE id = $1", "ITEM-123")
	if err != nil {
		// Business failure: Publish failure event
		h.Kafka.Publish("InventoryFailed", event.OrderID)
		return
	}

	// 4. Record local state for future compensation
	tx.Exec("INSERT INTO inventory_reservations (order_id, status) VALUES ($1, 'RESERVED')", event.OrderID)

	// 5. Commit local DB and Publish success event (Transactional Outbox pattern assumed)
	tx.Commit()
	h.Kafka.Publish("InventoryReserved", event.OrderID)
}

func (h *InventoryHandler) compensateInventory(ctx context.Context, event Event) {
	tx, _ := h.DB.BeginTx(ctx, nil)
	defer tx.Rollback()

	// 1. Verify we actually have a reservation to compensate
	var status string
	err := tx.QueryRow("SELECT status FROM inventory_reservations WHERE order_id = $1 FOR UPDATE", event.OrderID).Scan(&status)
	if err != nil || status != "RESERVED" {
		return // Nothing to compensate, or already compensated
	}

	// 2. Undo the work
	tx.Exec("UPDATE products SET stock = stock + 1 WHERE id = $1", "ITEM-123")
	tx.Exec("UPDATE inventory_reservations SET status = 'COMPENSATED' WHERE order_id = $1", event.OrderID)
	
	tx.Commit()
	log.Printf("Order %s compensated.", event.OrderID)
}
```

## Architectural Trade-offs

1. **Cognitive Load:** Choreography is highly decentralized. Understanding the full workflow requires tracing event flows across multiple repositories. There is no single place in the code that describes the "Order Process."
2. **Cyclic Dependencies:** Care must be taken to prevent event loops where Service A reacts to Service B, which reacts to Service A infinitely.
3. **The Outbox Pattern:** Publishing to Kafka and committing to a local database are two distinct operations. To guarantee atomic execution of both, the **Transactional Outbox** pattern must be used alongside the choreography handlers.

Choreography excels in highly decoupled, high-throughput systems, provided the engineering culture enforces strict event schema governance and rigorous idempotency constraints.
