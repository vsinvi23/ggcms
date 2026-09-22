---
title: "SQL Transaction Isolation Levels: Dirty, Non-Repeatable, and Phantom Reads"
description: "A practical guide to the four ANSI SQL isolation levels, the concurrency anomalies each one prevents or allows, and how Postgres and MySQL implement them under MVCC and locking."
type: "ARTICLE"
categorySlug: "databases"
articleType: "GUIDE"
tags:
  - "sql"
  - "transaction-isolation"
  - "acid"
  - "dirty-reads"
  - "phantom-reads"
  - "mvcc"
  - "concurrency-control"
---

# SQL Transaction Isolation Levels: Dirty, Non-Repeatable, and Phantom Reads

## The Problem: Concurrency Anomalies in ACID

Relational databases guarantee ACID properties (Atomicity, Consistency, Isolation, Durability). While Atomicity ensures an operation is all-or-nothing, **Isolation** dictates how concurrent transactions behave when they access the same data simultaneously.

Imagine an e-commerce system where Transaction A reads an account balance to process a $100 purchase, while Transaction B simultaneously deposits $50 into the same account. If the database executes these without strict isolation, they overwrite each other's state, resulting in lost money and corrupted data.

Enforcing absolute isolation — where transactions queue up and execute strictly one at a time — destroys throughput. To balance data integrity with concurrency, the ANSI SQL standard defines four **isolation levels**. Choosing the wrong one either causes silent data corruption or crippling lock contention.

## The Mental Model: The Sliding Scale of Safety

Isolation levels are a trade-off. As you raise the isolation level, you eliminate specific concurrency anomalies, but incur higher CPU cost, lock wait times, and transaction rollbacks.

```text
Low Isolation (Fast) --> --> --> --> --> High Isolation (Safe, Slow)

Read Uncommitted --> Read Committed --> Repeatable Read --> Serializable
 (Allows Dirty)      (Allows Non-Rep)   (Allows Phantom)    (No Anomalies)
```

To understand the levels, first understand the three anomalies they prevent.

## The Three Anomalies

### 1. The Dirty Read

Occurs when a transaction reads data written by another transaction *that has not yet committed*.

- **Scenario:** TxA updates an item's inventory from 10 to 0. TxB reads the inventory as 0 and tells a customer the item is out of stock. TxA hits an error and rolls back, restoring inventory to 10.
- **Result:** TxB acted on data that never officially existed in the database's committed history.

### 2. The Non-Repeatable Read

Occurs when a transaction reads the same row twice but sees different data because another transaction committed an `UPDATE` in between.

- **Scenario:** TxA reads a balance of $500. TxB commits a withdrawal, changing the balance to $400. TxA re-reads the balance to verify and sees $400.
- **Result:** The data mutated underneath TxA mid-transaction, violating its isolated view.

### 3. The Phantom Read

Occurs when a transaction queries a *set* of rows twice, and a different row count comes back because another transaction committed an `INSERT` or `DELETE` matching the `WHERE` clause.

- **Scenario:** TxA runs `SELECT COUNT(*) WHERE status = 'PENDING'` and gets 5. TxB inserts a new pending order. TxA reruns the exact same query and gets 6.
- **Result:** "Phantom" rows appear out of nowhere during the transaction's lifetime.

## The Four Isolation Levels

### 1. Read Uncommitted

The lowest level. The database takes almost no locks; transactions can read uncommitted changes from other transactions.

- **Prevents:** Nothing.
- **Use case:** Practically never used in production, except for highly analytical, approximate queries where a slightly wrong answer is acceptable (e.g., estimating total table size).

### 2. Read Committed (default for Postgres and SQL Server)

Transactions only see data committed before the query began, achieved via short-lived read locks or Multi-Version Concurrency Control (MVCC) serving a previous row version.

- **Prevents:** Dirty reads.
- **Allows:** Non-repeatable reads, phantom reads.
- **Use case:** The standard for 95% of web applications — good performance, no fake data.

### 3. Repeatable Read (default for MySQL InnoDB)

When a transaction reads a row, the database guarantees that re-reading that exact row within the same transaction returns identical data, even if other transactions commit updates in the meantime. MySQL achieves this via next-key locking; Postgres uses MVCC snapshots that freeze the transaction's view of the database at a specific point in time.

- **Prevents:** Dirty reads, non-repeatable reads.
- **Allows:** Phantom reads (though Postgres and MySQL mitigate most phantoms here via MVCC).
- **Use case:** Financial calculations spanning multiple queries where row data must remain absolutely static.

### 4. Serializable

The highest isolation level. The database guarantees that concurrent transactions produce results identical to some serial (one-at-a-time) execution order. It aggressively uses range locks — locking entire index ranges to prevent new inserts that would match an in-flight query's predicate.

- **Prevents:** All anomalies.
- **Use case:** Complex financial ledgers, double-entry accounting, and any scenario where a concurrent insert into a queried range would mathematically corrupt business logic.

## Example: Choosing `SELECT FOR UPDATE` at the Right Level

```sql
-- Read Committed is usually the default; this transaction explicitly
-- upgrades to Repeatable Read for a balance check that must not drift.
BEGIN;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;

SELECT balance FROM accounts WHERE account_id = 42 FOR UPDATE;
-- balance = 500

-- ... business logic validates the withdrawal is affordable ...

UPDATE accounts SET balance = balance - 100 WHERE account_id = 42;
COMMIT;
```

`FOR UPDATE` takes a row lock so a concurrent transaction cannot modify (or, depending on the database, even read for update) the same row until this transaction commits — combining explicit locking with the chosen isolation level to guarantee the balance check and the debit are atomic with respect to other writers.

## Conclusion

Isolation levels are the critical interface between application code and data integrity. While developers default to `Read Committed` for high concurrency, systems handling billing, inventory, or complex state machines must explicitly elevate to `Repeatable Read` or `Serializable`. Understanding this trade-off lets engineers apply pessimistic locking (like `SELECT FOR UPDATE`) precisely when needed, ensuring correctness without strangling throughput.
