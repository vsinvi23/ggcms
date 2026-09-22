---
title: "SQL vs NoSQL: ACID, the CAP Theorem, and Choosing a Data Model"
description: "Why relational databases enforce ACID guarantees at the cost of horizontal scale, how the CAP theorem forces NoSQL systems to choose CP or AP, and side-by-side schema examples in PostgreSQL and MongoDB/DynamoDB for the same domain model."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "sql"
  - "nosql"
  - "cap-theorem"
  - "acid"
  - "eventual-consistency"
  - "database-design"
---

# SQL vs NoSQL: ACID, the CAP Theorem, and Choosing a Data Model

## The Problem

Every system needs to store state, and for decades the relational database (RDBMS/SQL) was the default answer. As internet-scale traffic and unstructured data grew, relational databases hit real horizontal-scaling limits, and the industry responded with NoSQL databases — trading strict correctness guarantees for distributed scalability. Which family you choose is arguably the single most consequential decision in a system's design, because it is expensive to reverse later.

## The Mental Model

- **SQL (relational)** is a strict, hyper-organized accounting ledger. Every row has a rigid, pre-defined structure (schema); changing that structure requires a formal migration. In exchange, the ledger is mathematically guaranteed never to be internally inconsistent.
- **NoSQL (non-relational)** is a flexible filing cabinet. You can drop in JSON documents, key-value pairs, or graph edges without declaring their shape upfront. It scales by adding more cabinets — but a document placed in cabinet A might take a moment to appear in cabinet B.

## SQL and ACID Guarantees

Relational databases (PostgreSQL, MySQL) normalize data into tables linked by foreign keys and enforce **ACID**:

- **Atomicity** — a transaction (deduct $10 from Alice, credit $10 to Bob) happens entirely or not at all.
- **Consistency** — declared constraints, foreign keys, and triggers are always enforced.
- **Isolation** — concurrent transactions don't observe each other's partial effects.
- **Durability** — once committed, data survives a crash or power loss.

```sql
-- A relational schema enforces referential integrity and atomicity at the DB layer.
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_name VARCHAR(255) NOT NULL,
    balance_cents BIGINT NOT NULL CHECK (balance_cents >= 0)
);

BEGIN;
UPDATE accounts SET balance_cents = balance_cents - 1000 WHERE id = 'alice-uuid';
UPDATE accounts SET balance_cents = balance_cents + 1000 WHERE id = 'bob-uuid';
COMMIT; -- both updates land, or neither does — the CHECK constraint prevents overdraft
```

SQL databases scale **vertically** (a bigger machine). Horizontal scaling — sharding across many machines — is notoriously hard, because enforcing ACID guarantees across network boundaries (distributed transactions, two-phase commit) introduces real latency and complexity.

## NoSQL and the CAP Theorem

NoSQL databases (MongoDB, DynamoDB, Cassandra) drop cross-document joins and multi-row ACID guarantees, which makes the data far easier to partition across nodes. This trade-off is formalized by the **CAP theorem**: a distributed system can only guarantee two of the following three properties simultaneously:

1. **Consistency** — every read reflects the most recent write.
2. **Availability** — every request gets a non-error response.
3. **Partition tolerance** — the system keeps operating despite network splits between nodes.

Because network partitions (P) are a fact of life in any distributed system, the real-world choice is between **CP** (consistency, sacrifice availability during a partition) and **AP** (availability, sacrifice strict consistency).

```text
                 SQL Approach                          NoSQL (AP) Approach
      App ──▶ [ Master RDBMS ]                 App ──▶ [ Node A ]
                     │  strict replication              App ──▶ [ Node B ]
                     ▼                                   App ──▶ [ Node C ]
               [ Standby ]                        Node A ⇄ Node B ⇄ Node C
                                                    (gossip / async replication)
      Focus: ACID, vertical scale             Focus: CAP trade-offs, horizontal scale
```

### Eventual Consistency

Many NoSQL systems choose Availability. If a node is unreachable, the system keeps accepting writes anyway. The trade-off is **eventual consistency**: writing a value on Node A and immediately reading from Node B may return stale data. Given enough time with no further writes, all nodes converge.

### The Same Domain, Two Data Models

```sql
-- PostgreSQL: a normalized order with line items requires a JOIN.
CREATE TABLE orders (id UUID PRIMARY KEY, customer_id UUID NOT NULL, status TEXT);
CREATE TABLE order_items (order_id UUID REFERENCES orders(id), sku TEXT, qty INT);

SELECT o.id, o.status, i.sku, i.qty
FROM orders o JOIN order_items i ON i.order_id = o.id
WHERE o.customer_id = 'c-123';
```

```javascript
// MongoDB: the same order is a single denormalized document — no JOIN needed,
// at the cost of the schema no longer being enforced by the database itself.
db.orders.insertOne({
  _id: "order-789",
  customerId: "c-123",
  status: "PLACED",
  items: [
    { sku: "SKU-1", qty: 2 },
    { sku: "SKU-2", qty: 1 },
  ],
});

db.orders.find({ customerId: "c-123" }); // one round trip, whole order embedded
```

## When to Choose Which

**Choose SQL when:**
- You're handling financial transactions, inventory, or billing — correctness beats raw scale.
- Your data has complex relationships requiring heavy JOINs.
- Schema integrity is non-negotiable.
- (Note: modern NewSQL systems like CockroachDB and Google Spanner offer horizontal scaling *with* ACID, blurring this line — but they're a distinct, more complex engineering trade-off than either classic option.)

**Choose NoSQL when:**
- You need rapid, flexible iteration without formal schema migrations.
- You're storing large volumes of unstructured or semi-structured data — logs, social feeds, IoT telemetry.
- You need extreme write throughput and can tolerate eventual consistency.
- You're building a pure key-value cache (Redis) or document store (MongoDB) where each record stands alone.

## Architectural Takeaway

"SQL vs NoSQL" isn't a single global decision for a whole company — it's a per-workload decision. Many production systems use PostgreSQL for the transactional core (orders, billing, accounts) and a NoSQL store for a specific high-volume, loosely-structured workload (session data, activity feeds, search indices) sitting right next to it.
