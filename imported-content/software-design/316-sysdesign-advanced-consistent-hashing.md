# Advanced System Design: Consistent Hashing

## The Problem
Imagine you are building a distributed Redis cache with 5 servers. To decide which server holds a specific piece of data (e.g., `user_123`), you use a simple modulo hash: `server_index = hash("user_123") % 5`. 

This works perfectly until a server crashes. Suddenly, you have 4 servers. The formula becomes `hash("user_123") % 4`. Because the modulo divisor changed, nearly *every single key* will now hash to a different server. Your cache hit rate drops to zero, and a massive wave of cache misses instantly crushes your backend database. 

We need a hashing algorithm where adding or removing a node only affects the data sitting on that specific node.

## The Mental Model
Stop thinking of your servers as an array (`[0, 1, 2, 3, 4]`). Instead, think of a massive roulette wheel or a 360-degree clock face (a "Hash Ring"). Both the servers and the data are placed somewhere on the edge of this wheel.

## How Consistent Hashing Works

1. **The Ring:** We create a massive mathematical ring, typically representing numbers from $0$ to $2^{32}-1$.
2. **Placing Servers:** We take the IP address or ID of our servers (Node A, Node B, Node C), run them through a hash function (like SHA-1), and place them on the ring.
3. **Placing Data:** When a request for `user_123` arrives, we hash the key "user_123" using the *same* hash function, placing the data point somewhere on the ring.
4. **Routing:** To find out which server holds the data, we start at the data's position on the ring and move **clockwise** until we encounter the first server.

```mermaid
graph TD
    subgraph Hash Ring
        direction circle
        Data1(Key 1) -.-> |Clockwise| NodeA((Node A))
        Data2(Key 2) -.-> |Clockwise| NodeB((Node B))
        Data3(Key 3) -.-> |Clockwise| NodeC((Node C))
        Data4(Key 4) -.-> |Clockwise| NodeA
    end
```

### Handling Failures
If Node B crashes, it is removed from the ring. According to our clockwise rule, any data that previously belonged to Node B will now naturally fall to the next server in line (Node C). 
Crucially, the data belonging to Node A and Node C *does not move*. Only $1/N$ of the data (where N is the number of servers) is remapped.

### The Unbalanced Problem (Virtual Nodes)
If you only have 3 servers on a massive ring, they might clump together randomly, meaning one server ends up responsible for 80% of the ring.
To solve this, we introduce **Virtual Nodes (V-Nodes)**. Instead of hashing Node A once, we hash it 100 times using slight variations (`NodeA_1`, `NodeA_2`, `NodeA_100`). We do this for all servers. 

The ring is now populated with hundreds of virtual nodes, perfectly distributing the load. When a virtual node intercepts data, it routes it back to the physical server it represents.

## Architectural Takeaway
Consistent hashing is the fundamental routing algorithm for almost every modern distributed system that partitions state. It is the core routing mechanism behind Amazon DynamoDB, Apache Cassandra, Riak, and massive CDN edge routers like Akamai. Use it whenever you need to dynamically scale a stateful fleet of servers without causing catastrophic data migrations.