# Distributed ID Generation: Designing Twitter Snowflake for Monotonic 64-bit Sorting

## The Problem: The High-Scale Identity Bottleneck

In a distributed system, generating globally unique identifiers at high throughput is a major architectural challenge. Relational databases traditionally rely on auto-incrementing integer keys. However, in a multi-region distributed system, this approach introduces a single point of failure (SPOF) and a severe write bottleneck, as multiple application instances must continuously lock a central database table to obtain the next ID.

An alternative is UUID (Universally Unique Identifier) Version 4. While UUIDs can be generated locally without a central database roundtrip, they are 128 bits long—consuming double the storage of standard 64-bit integers. More critically, UUID v4 is completely random and lacks chronological ordering (non-monotonic). When used as primary keys in indexing engines like MySQL’s InnoDB, the random insertion pattern causes massive index fragmentation, page splits, and catastrophic write degradation under load.

```
Relational Auto-increment: Single-point bottleneck, locking delays.
UUID v4 (Random):            Non-monotonic, fragments database B-Trees, 128-bit bloat.
```

We need an ID generation strategy that requires zero coordination, fits in a compact 64-bit space, and remains roughly sortable by time (monotonic) to preserve database index insertion performance.

---

## The Mental Model: Component-Based Bit Allocation

The **Twitter Snowflake** pattern solves this by constructing a 64-bit unique identifier using bit allocation. Instead of generating a random number, the ID is mathematically structured as a composite value of time, node origin, and a localized sequence counter.

A standard Snowflake ID allocates its 64 bits as follows:

```
 1 Bit      41 Bits (Timestamp)           10 Bits (Node ID)    12 Bits (Sequence)
+-------+-------------------------------+---------------------+------------------+
| Unused| ms elapsed since custom epoch | Datacenter + Worker | Increments per ms|
|  (0)  |  (Allows ~69 years of range)   | (Up to 1024 nodes)  | (Resets to 0)    |
+-------+-------------------------------+---------------------+------------------+
```

Because the most significant bits (excluding the unused sign bit) represent time, Snowflake IDs are naturally monotonic. Over time, generated IDs increase in value, making them fully compatible with high-performance B-Tree index insertions.

---

## Implementing Twitter Snowflake with BigInt in TypeScript

In JavaScript/TypeScript, standard numbers are double-precision floats (53-bit precision). To safely manipulate 64-bit integers without precision loss, we must use `BigInt`.

```typescript
export class SnowflakeGenerator {
  // 1. Bit Allocation Constants
  private readonly unusedBits = 1n;
  private readonly timestampBits = 41n;
  private readonly workerIdBits = 10n;
  private readonly sequenceBits = 12n;

  // 2. Max limits via bit shifting
  private readonly maxWorkerId = -1n ^ (-1n << this.workerIdBits); // 1023
  private readonly maxSequence = -1n ^ (-1n << this.sequenceBits); // 4095

  // 3. Shift Offsets
  private readonly workerIdShift = this.sequenceBits;
  private readonly timestampLeftShift = this.sequenceBits + this.workerIdBits;

  // Custom Epoch: 2026-01-01T00:00:00.000Z
  private readonly customEpoch = 1767225600000n;

  private workerId: bigint;
  private sequence = 0n;
  private lastTimestamp = -1n;

  constructor(workerId: number) {
    const workerBigInt = BigInt(workerId);
    if (workerBigInt < 0n || workerBigInt > this.maxWorkerId) {
      throw new Error(`Worker ID must be between 0 and ${this.maxWorkerId}`);
    }
    this.workerId = workerBigInt;
  }

  // 4. Thread-Safe ID Generation
  public synchronizedGenerate(): bigint {
    let timestamp = BigInt(Date.now());

    if (timestamp < this.lastTimestamp) {
      // Clock drift protection
      throw new Error(`Clock moved backwards! Rejecting generation for ${this.lastTimestamp - timestamp}ms.`);
    }

    if (timestamp === this.lastTimestamp) {
      // Same millisecond: increment sequence
      this.sequence = (this.sequence + 1n) & this.maxSequence;
      if (this.sequence === 0n) {
        // Sequence overflow: block until next millisecond
        while (timestamp <= this.lastTimestamp) {
          timestamp = BigInt(Date.now());
        }
      }
    } else {
      // New millisecond: reset sequence
      this.sequence = 0n;
    }

    this.lastTimestamp = timestamp;

    // 5. Shift components into final 64-bit integer
    return (
      ((timestamp - this.customEpoch) << this.timestampLeftShift) |
      (this.workerId << this.workerIdShift) |
      this.sequence
    );
  }
}
```

---

## Architectural Guardrails and Trade-offs

1. **System Clock Drift**: If a worker node synchronization process (like NTP) adjusts the system clock backward, the Snowflake generator will fail with an error or emit duplicate IDs. Ensure your code detects drift and implements a brief spin-lock wait or throws a clear circuit-breaker exception.
2. **Worker ID Coordination**: Worker IDs must be absolutely unique within the cluster. Use a dynamic registry like Consul, ZooKeeper, or Kubernetes stateful set indexes to allocate worker IDs automatically upon service startup.
3. **JS Numeric Loss**: JSON does not support `BigInt` natively. When transmitting Snowflake IDs to web browsers, always serialize them as strings (`"7394857204958273"`) to prevent catastrophic truncation.
