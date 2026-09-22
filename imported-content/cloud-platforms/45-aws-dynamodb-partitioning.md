# AWS DynamoDB Internals: Partition Keys, Sort Keys, and Replication

> Explore the underlying storage architecture of AWS DynamoDB, analyze how data is sharded across physical partitions, evaluate eventual vs. strong read consistency, and understand global replication mechanics.

---

## What We Are Going to Learn

In this deep-dive guide to managed NoSQL databases, we will pull back the curtain on **Amazon DynamoDB** to study how it delivers single-digit millisecond latency at any scale.

Specifically, we will cover:
1. **Consistent Hashing and Key Partitioning:** How the partition key (hash key) determines where data is physically written.
2. **Physical Partition Limits:** The structural limits of DynamoDB storage nodes (10 GB storage, 3,000 RCUs, and 1,000 WCUs).
3. **Partition Splitting:** How DynamoDB splits storage nodes on-the-fly to handle data growth and high traffic.
4. **Replication & Consistency:** How Paxos consensus manages local consistency, and how Global Tables synchronize data globally.

---

## The Problem: Scaling NoSQL Database Throughput Beyond a Single Node

Traditional databases are bounded by the physical hardware of the host server. When database size grows into terabytes, or write traffic hits hundreds of thousands of operations per second, a single machine's CPU, disk I/O, and network bandwidth are overwhelmed.

Simply adding replica read nodes can offload query traffic, but it does not solve the **Write Scaling Problem**. To scale write operations horizontally, a database must shard (partition) its datasets across a cluster of independent storage machines, ensuring that:
* Writes are distributed evenly to avoid any single master bottlenecks.
* Every query knows exactly which node holds the requested data without scanning the entire cluster.
* Network and disk failures do not cause catastrophic data corruption or total service outages.

---

## Why the Problem Is Hard: Consistent Hashing, Replication, and Latency SLA

Sharding is conceptually simple but incredibly difficult to execute in high-volume, low-latency production environments:
1. **Dynamic Scaling:** As data volume grows, partitions must split dynamically without blocking incoming reads or writes.
2. **No Single Point of Failure:** The cluster must replicate data across physical zones while keeping write latencies under 10 milliseconds.
3. **Throughput Allocation:** If a database tablespace is provisioned with 10,000 write units, those units must be distributed fairly across the shard cluster to prevent a single hot key from starving adjacent keys of performance.

---

## A Simple Mental Model: The Sharded Post Office Boxes

Think of DynamoDB's partitioning engine like a massive wall of Post Office (P.O.) Boxes inside a sorting facility.

```
                          PARTITION ROUTING VIA HASH FUNCTION
   =============================================================================
   [ Client Request ] ---> HASH(PartitionKey) ---> HASH VALUE (e.g., 0xA4F2)
                                                         │
                                    ┌────────────────────┴────────────────────┐
                                    ▼ (0x0000 - 0x5FFF)                       ▼ (0x6000 - 0xFFFF)
                            [ Physical Partition 1 ]                  [ Physical Partition 2 ]
                            ┌──────────────────────┐                  ┌──────────────────────┐
                            │ Storage: 4 GB / 10GB │                  │ Storage: 9.8 GB/10GB │
                            │ Items sorted by:     │                  │                      │
                            │ Sort Key ("Date")    │                  │  ** TRIGGERS SPLIT** │
                            └──────────────────────┘                  └──────────┬───────────┘
                                                                                 │
                                                                   ┌─────────────┴─────────────┐
                                                                   ▼ (0x6000 - 0xAFFF)         ▼ (0xB000 - 0xFFFF)
                                                            [ Partition 2A ]            [ Partition 2B ]
                                                            Storage: 4.9 GB             Storage: 4.9 GB
```

* **The Partition Key (Hash Key):** Passed through an internal hash function (like MD5) to produce a 128-bit hash value. This value maps directly to a specific physical partition box.
* **The Sort Key (Range Key):** Determines the physical order of item storage *within* that partition box. All items sharing the same Partition Key are stored contiguously, sorted by their Sort Key.

---

## Under the Hood: DynamoDB Sharding and Physical Partitions

DynamoDB tables are composed of one or more physical storage nodes called **Physical Partitions**. Each physical partition is a highly isolated slice of storage and compute.

### The Immutable Physical Partition Limits
A single physical partition is bound by three strict hardware and software limits:
* **Max Storage Capacity:** 10 Gigabytes (GB).
* **Max Read Throughput:** 3,000 Read Capacity Units (RCUs) per second.
* **Max Write Throughput:** 1,000 Write Capacity Units (WCUs) per second.

*(Note: 1 RCU = one strongly consistent read of up to 4 KB per second, or two eventually consistent reads. 1 WCU = one write of up to 1 KB per second).*

If your dataset exceeds 10 GB, or your application demands more than 1,000 WCUs or 3,000 RCUs on a single partition, DynamoDB must perform a **Partition Split**.

---

## The Solution: Partition Splitting and Global Replication

### 1. Partition Splitting Mechanics
When a partition's limits are breached, DynamoDB automatically provisions a new physical storage node and splits the existing partition's key range in half. 

For example, if physical partition 2 holds keys hashing from `0x6000` to `0xFFFF`, it splits into:
* **Partition 2A:** Hosting keys `0x6000` to `0xAFFF`.
* **Partition 2B:** Hosting keys `0xB000` to `0xFFFF`.

During the split, DynamoDB copies data buffers in the background. Once synchronized, the router (Request Router) is updated with the new hash boundaries. **The split is completely transparent and causes zero downtime to active connections.**

### 2. High Availability: Three-Node Replication Groups
To ensure high availability, every physical partition is replicated across three Storage Nodes spanning different AWS Availability Zones (AZs) within a region. This is called a **Replication Group**.

```
                           THREE-NODE REPLICATION GROUP (Paxos)
   =============================================================================
             [ Request Router ]
                    │
                    ▼ (Writes routed to Paxos Leader)
          ┌──────────────────┐
          │  Storage Node A  │ (Paxos Leader in AZ-1)
          └───────┬──┬───────┘
                  │  │ (Asynchronous replication logs)
        ┌─────────┘  └─────────┐
        ▼                      ▼
  ┌──────────────┐       ┌──────────────┐
  │Storage Node B│       │Storage Node C│
  │(Follower-AZ2)│       │(Follower-AZ3)│
  └──────────────┘       └──────────────┘
```

* **Paxos Consensus:** One storage node in the replication group is elected as the **Leader**, and the other two act as **Followers**.
* **The Write Path:** Writes are always routed to the Leader. The Leader writes to its local SSD and replicates the changes to its Followers. Once at least one Follower acknowledges receipt of the write log (achieving a Paxos quorum of 2 out of 3 nodes), the write is considered committed, and a success response is returned to the client.
* **The Read Path:**
  * **Eventually Consistent Reads (Default):** The Request Router randomly queries any storage node in the replication group. If it queries a Follower that hasn't received the latest Paxos log, the read may return slightly stale data.
  * **Strongly Consistent Reads:** The Request Router forces the query to go directly to the Paxos Leader, guaranteeing the absolute latest committed version of the data at the cost of double the RCU usage.

### 3. Active-Active Global Tables
For cross-region active-active replication, DynamoDB uses **Global Tables**. Under the hood, this uses **DynamoDB Streams** to capture every insert, update, or delete on a local table. The change log is read by an internal replication worker and applied to peer tables in remote AWS regions asynchronously (typically within 1 second).

---

## Hands-On Architecture: Provisioning and Optimizing DynamoDB Schema

Let's design a highly optimized DynamoDB schema using the AWS CLI, and inspect its throughput parameters.

### 1. Create a DynamoDB Table with Partition and Sort Keys
We will create a multi-tenant `Orders` table.
* **Partition Key:** `TenantId` (ensures tenant workloads are distributed across different physical partitions).
* **Sort Key:** `OrderId` (allows us to query specific orders within a tenant).

```bash
aws dynamodb create-table \
    --table-name TenantOrders \
    --attribute-definitions \
        AttributeName=TenantId,AttributeType=S \
        AttributeName=OrderId,AttributeType=S \
    --key-schema \
        AttributeName=TenantId,KeyType=HASH \
        AttributeName=OrderId,KeyType=RANGE \
    --billing-mode PROVISIONED \
    --provisioned-throughput \
        ReadCapacityUnits=1000,WriteCapacityUnits=500
```

### 2. Verify Table Partitioning Metrics via AWS CloudWatch CLI
Because we provisioned 500 WCUs and 1000 RCUs, and because the maximum storage size of a partition is 10 GB, DynamoDB calculates the initial partition allocation.

You can query CloudWatch to see if your table is getting throttled, which is a symptom of a **Hot Partition Key**:

```bash
aws cloudwatch get-metric-statistics \
    --namespace AWS/DynamoDB \
    --metric-name WriteThrottleEvents \
    --dimensions Name=TableName,Value=TenantOrders \
    --start-time 2026-06-01T00:00:00Z \
    --end-time 2026-06-01T01:00:00Z \
    --period 3600 \
    --statistics Sum
```

---

## Common Misconceptions

### Misconception 1: "Increasing provisioned throughput automatically eliminates partition throttling."
**Reality:** In older tables (or tables that grew quickly), provisioned throughput was divided **evenly** across all physical partitions. If you have 10 partitions and provision 1,000 WCUs, each partition gets only 100 WCUs. If one tenant causes 150 WCUs of write traffic on partition 3, it would get throttled, even though 900 WCUs of your table-level throughput is sitting idle! DynamoDB now uses **Adaptive Capacity** to temporarily shift unused throughput to hot partitions, but extreme skew can still cause throttling if the single physical partition cap of 1,000 WCUs is hit.

### Misconception 2: "Global Tables perform complex atomic merge operations to resolve write conflicts across regions."
**Reality:** Global Tables use a **Last-Writer-Wins (LWW)** conflict resolution protocol. If two clients update the same item in two different AWS regions at the exact same millisecond, DynamoDB compares the physical system timestamps of the updates (using NTP synchronized clocks) and applies the version with the latest timestamp. This is simple and fast, but can lead to silent data overwrites if your application requires transactional consistency.

---

## Pause and Think

> **Critical Question:** If you have a DynamoDB table with 10 physical partitions, and you suddenly experience a massive spike of 2,000 WCUs on a single partition key (e.g., `TenantId = 'EnterpriseTenantA'`), why will your writes get throttled, even if your table has provisioned 15,000 WCUs and Adaptive Capacity is fully active?

### Answer
Because a single partition key (hash key) must map to a single physical partition. A physical partition is mathematically and hardware-bounded by a hard-limit of **1,000 WCUs**. 

Even if you have infinite capacity allocated to your table, a single physical partition cannot physically exceed 1,000 WCUs. Thus, any single hot hash key that demands more than 1,000 WCUs will always be throttled. To fix this, you must introduce **Write Sharding** (appending a random suffix like `-01`, `-02` to the partition key).

---

## Key Takeaways

* **Data is sharded across physical partitions** using consistent hashing of the Partition Key.
* **Sort Keys sort data physically** within a single partition, allowing rapid range queries.
* **Physical partitions are limited to 10 GB storage**, 3,000 RCUs, and 1,000 WCUs.
* **Replication groups write to a Paxos Leader** and require a quorum (2 out of 3) for commit.
* **Eventually consistent reads bypass the Paxos Leader**, potentially returning stale data but saving 50% RCU costs.
* **Avoid hot keys by using high-cardinality values** for partition keys to distribute the load across partitions.

---

## What to Learn Next

To expand your database design expertise, explore:
* **Implementing single-table design patterns in DynamoDB to minimize query joins.**
* **Configuring DynamoDB Streams with AWS Lambda for real-time event-driven data pipelines.**
* **Using DynamoDB Accelerator (DAX) to achieve microsecond read latencies on hot items.**
