# Sharding Relational Databases: Hash-based vs Range-based

## The Problem: The Single Machine Bottleneck
Relational databases like PostgreSQL and MySQL are traditionally monolithic. They scale *vertically*: when you run out of CPU, memory, or disk space, you buy a bigger server. However, vertical scaling has physical limits and becomes exponentially expensive. 

When your dataset reaches terabytes in size, or your queries per second (QPS) exceed what a single disk controller can handle, a single server is no longer viable. Queries slow down as indexes stop fitting into RAM. 

To solve this, we must scale *horizontally* across multiple machines. In the database world, partitioning data across multiple independent database servers is called **Sharding**. 

## The Mental Model: Dividing the Ledger
Imagine a physical library containing 10 million books. A single librarian cannot possibly serve all patrons at once. 

To solve this, you build four separate library buildings (Shards). But how do you decide which book goes to which building? You need a deterministic rule—a **Shard Key**—so patrons instantly know which building to visit to find their book. 

If you use the Author's Last Name as the Shard Key, you are using a routing algorithm. The two most prominent algorithms in distributed systems are **Range-based Sharding** and **Hash-based Sharding**.

```text
[ Application Client ]
         |
         v
  [ Routing Layer / Proxy ] (Decides where data lives)
      /      |      \
     /       |       \
[Shard A] [Shard B] [Shard C]
```

## Strategy 1: Range-Based Sharding
Range-based sharding divides data based on continuous ranges of the Shard Key.

For example, if our Shard Key is `User_ID`:
- **Shard A:** Users 1 to 1,000,000
- **Shard B:** Users 1,000,001 to 2,000,000
- **Shard C:** Users 2,000,001 to 3,000,000

Alternatively, you could shard by `Timestamp` (e.g., Shard A gets Jan-Mar, Shard B gets Apr-Jun).

### Advantages
1. **Range Queries are Lightning Fast:** If you need to query "All users from ID 500 to 600", the routing layer knows all those users live on Shard A. It sends a single query to a single machine. 
2. **Easy to Implement:** The routing table is small and easy to understand.

### Disadvantages: The Hotspot Problem
Range-based sharding is notorious for creating **Hotspots** (unbalanced load). 

If you shard by `User_ID`, and user IDs are sequentially generated, all new sign-ups will hit Shard C. Shard A and B will sit idle (mostly reads from older users), while Shard C's CPU maxes out processing 100% of the new user write traffic. The exact problem you tried to solve (a bottleneck) just moved to Shard C.

## Strategy 2: Hash-Based Sharding
Hash-based sharding applies a cryptographic hash function (like MD5 or MurmurHash) to the Shard Key, and uses the modulo operator to determine the target shard.

`Target_Shard = Hash(Shard_Key) % Number_Of_Shards`

For example:
- `Hash("User_104") % 3 = Shard B`
- `Hash("User_105") % 3 = Shard A`
- `Hash("User_106") % 3 = Shard C`

### Advantages
1. **Perfectly Even Distribution:** Because hash functions output pseudorandom numbers, the data is distributed completely evenly across all shards. 
2. **No Hotspots:** Even if you ingest sequential `User_IDs` at a massive rate, the writes are spread equally across Shards A, B, and C simultaneously.

### Disadvantages
1. **Scatter-Gather Range Queries:** If you need to query "All users from ID 500 to 600", the routing layer has no idea where they are. It must send the query to *all three shards* in parallel, wait for the responses, and merge them together in memory (Scatter-Gather). This is highly inefficient.
2. **Resharding is a Nightmare:** Notice the modulo operator: `% Number_Of_Shards`. If you add a 4th shard to handle more load, the denominator changes from `% 3` to `% 4`. Suddenly, the mathematical location of 90% of your data changes. You must migrate almost your entire database to new servers. *(Note: This is solved by using **Consistent Hashing**, which maps data to a hash ring rather than a fixed number of shards).*

## Choosing the Right Strategy

### When to use Range-based:
- Your application heavily relies on scanning ranges of data (e.g., retrieving time-series data for a specific month).
- You can find a Shard Key that naturally distributes read/write load (e.g., sharding by `Customer_ZipCode` if your traffic is geographically uniform).

### When to use Hash-based:
- You need extreme write throughput.
- Queries primarily look up individual records by their exact ID (e.g., Key-Value access patterns like loading a specific user's profile).
- Data distribution is skewed, and you must guarantee balanced storage and CPU usage.

Sharding introduces immense operational complexity. You lose the ability to perform cross-shard SQL `JOIN`s, and maintaining ACID transactions across multiple shards (Distributed Transactions) is notoriously slow. Sharding should always be your last resort after you have exhausted read-replicas, caching, and vertical scaling.