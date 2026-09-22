# Distributed ID Generation: Designing Twitter Snowflake for Monotonic 64-bit Sorting

## The Problem: The MySQL Auto-Increment Bottleneck
In a distributed system, relying on a single relational database for auto-incrementing primary keys creates a severe bottleneck and a single point of failure. Conversely, using UUIDs (Universally Unique Identifiers) solves the distribution problem but introduces new issues: UUIDs are 128-bit strings, making them massive, and they are completely random. When random UUIDs are inserted into a B-Tree index in a database, it causes severe index fragmentation and page faults.

We need a distributed ID generator that produces IDs that are:
1. Globally unique.
2. 64-bit integers (fits in a standard `BIGINT` for efficient indexing).
3. Roughly time-sortable (monotonic).

## The Solution: Twitter Snowflake Architecture
Twitter's Snowflake algorithm solves this by composing a 64-bit integer from multiple distinct parts: a timestamp, a machine ID, and a local sequence number.

### The 64-bit Structure
```text
 1 bit  |   41 bits       |   10 bits    |   12 bits
--------+-----------------+--------------+--------------
 Unused | Timestamp (ms)  | Machine ID   | Sequence No.
```

1. **1 bit (Sign bit):** Always 0 to ensure the ID is a positive integer.
2. **41 bits (Timestamp):** Milliseconds since a custom epoch (e.g., Twitter epoch). 41 bits gives us ~69 years of IDs. Since the timestamp occupies the most significant bits, the IDs are time-sortable.
3. **10 bits (Machine ID):** Identifies the worker node generating the ID. This allows 1,024 unique generator nodes in the cluster, ensuring global uniqueness without coordination.
4. **12 bits (Sequence Number):** A local counter that increments for every ID generated on the same machine within the same millisecond. Resets to 0 every millisecond. Supports 4,096 IDs per millisecond per node.

## Handling Edge Cases

### The Clock Going Backwards
If the system clock on a worker node synchronizes via NTP and jumps backwards, the node could generate duplicate IDs. 
**Mitigation:** The generator must cache the last timestamp it used. If the current time is less than the last timestamp, it must either pause and wait until time catches up, or throw an exception.

### Sequence Overflow
If a node receives more than 4,096 requests in a single millisecond, the sequence overflows.
**Mitigation:** Block and spin-wait until the next millisecond ticks over.

## Code Example: Snowflake Implementation
```go
type Snowflake struct {
    sync.Mutex
    lastTimestamp int64
    machineID     int64
    sequence      int64
}

const (
    Epoch      = 1609459200000 // Custom Epoch (Jan 1, 2021)
    MachineBits = 10
    SeqBits     = 12
    MaxSeq      = -1 ^ (-1 << SeqBits)
    MachineShift = SeqBits
    TimeShift   = SeqBits + MachineBits
)

func (s *Snowflake) Generate() int64 {
    s.Lock()
    defer s.Unlock()

    now := time.Now().UnixNano() / 1e6 // milliseconds
    if now < s.lastTimestamp {
        panic("Clock moved backwards")
    }

    if now == s.lastTimestamp {
        s.sequence = (s.sequence + 1) & MaxSeq
        if s.sequence == 0 {
            // Sequence exhausted, wait for next ms
            for now <= s.lastTimestamp {
                now = time.Now().UnixNano() / 1e6
            }
        }
    } else {
        s.sequence = 0
    }

    s.lastTimestamp = now

    id := ((now - Epoch) << TimeShift) |
        (s.machineID << MachineShift) |
        s.sequence

    return id
}
```

By embedding time directly into the bits of a 64-bit integer, Snowflake provides distributed, highly available, and database-friendly unique identifiers.
