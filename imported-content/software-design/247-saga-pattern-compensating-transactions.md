# Designing Sagas: Writing Idempotent and Commutative Compensating Transactions

In a monolithic application, transactions are simple. You wrap multiple database operations in a `BEGIN TRANSACTION` and `COMMIT` block. If anything fails, the database automatically performs a `ROLLBACK`, guaranteeing atomicity.

In a microservice architecture, databases are isolated. You cannot span a standard ACID transaction across a `FlightService`, a `HotelService`, and a `PaymentService`. If the payment fails, how do you "rollback" the flight that was already booked on a different server? 

The answer is the **Saga Pattern**—a sequence of local transactions where each step publishes an event to trigger the next. But Sagas introduce a massive architectural challenge: explicit **Compensating Transactions**.

## The Problem: The Distributed Rollback

Imagine a vacation booking application:
1. `FlightService` books a seat (Success).
2. `HotelService` books a room (Success).
3. `PaymentService` charges the credit card (Fails - Insufficient Funds).

Because `FlightService` and `HotelService` have already committed their data to their respective databases, the overarching transaction is now in an inconsistent state. The user has a flight and hotel reserved, but hasn't paid. 

### The Mental Model: The Un-Doing

In the real world, if you buy a coffee and then realize you left your wallet at home, the barista doesn't magically "rollback" time. The barista executes a new, explicit action: they pour the coffee down the drain. 

A Compensating Transaction is exactly that: a programmatic "undo" operation. 

## Implementing the Saga State Machine (Orchestration)

To manage these distributed steps, we use the **Orchestrated Saga** pattern. A central coordinator (the Saga Orchestrator) tracks the state of the transaction.

```text
[Saga Orchestrator]
  |
  |-- 1. Execute(BookFlight) -> OK
  |-- 2. Execute(BookHotel) -> OK
  |-- 3. Execute(ChargeCard) -> FAIL!
  |
  | (Initiate Compensation Phase)
  |-- 4. Compensate(CancelHotel) -> OK
  |-- 5. Compensate(CancelFlight) -> OK
```

When Step 3 fails, the Orchestrator works backward, firing `Cancel` commands for the preceding steps. 

## The Golden Rules of Compensating Transactions

Writing a compensation is not as simple as executing an `UPDATE` statement. In a distributed, asynchronous environment, networks fail, messages are duplicated, and events arrive out of order. Compensations must adhere to two mathematical properties: **Idempotency** and **Commutativity**.

### 1. Idempotency (Safe to Retry)

If the Orchestrator sends a `CancelHotel` command, but the network drops the ACK, the Orchestrator will assume it failed and send it again. 

Your compensation logic must be **Idempotent**—meaning no matter how many times it executes, the end state remains the same. 

```typescript
// BAD: Not Idempotent
async function cancelHotel(reservationId) {
    // If called twice, it throws an error the second time!
    const res = await db.reservations.findById(reservationId);
    if (!res) throw new Error("Not found"); 
    await db.reservations.delete(reservationId);
}

// GOOD: Idempotent
async function cancelHotel(reservationId) {
    // Upsert to a definitive state. If already cancelled, do nothing.
    await db.reservations.update(
        { id: reservationId },
        { status: "CANCELLED" },
        { upsert: true }
    );
}
```

### 2. Commutativity (Order Independence)

In asynchronous systems, the compensation might arrive *before* the original action! 

Imagine the Orchestrator fires `BookHotel`. The network slows down. A timeout triggers the Orchestrator to abort the Saga, so it fires `CancelHotel`. The `CancelHotel` message arrives at the `HotelService` *first*.

If the operations are not **Commutative** (meaning $A + B$ must equal $B + A$), the system will break. 

To solve this, use an **Idempotency Key** or state tracking. 

```typescript
async function handleHotelCommand(command) {
    const state = await db.tracking.get(command.transactionId);

    if (command.type === "CANCEL") {
        // Record the cancellation, even if we haven't seen the booking yet!
        await db.tracking.set(command.transactionId, "CANCELLED");
        return;
    }

    if (command.type === "BOOK") {
        // If the cancel arrived first, reject the booking!
        if (state === "CANCELLED") {
            console.log("Booking aborted; compensation arrived earlier.");
            return; 
        }
        await executeBooking();
    }
}
```

By ensuring compensating transactions are idempotent and commutative, you guarantee that your microservices can gracefully recover from failure, restoring system consistency without relying on the impossible dream of distributed ACID locks.