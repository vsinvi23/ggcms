---
title: "Twitter Snowflake: Distributed 64-bit ID Generation"
description: "How Twitter Snowflake generates globally unique, roughly time-sortable 64-bit IDs without a central database bottleneck, with a full BigInt-based TypeScript implementation and its operational failure modes."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "DEEP_DIVE"
tags:
  - "distributed-id-generation"
  - "twitter-snowflake"
  - "bigint"
  - "distributed-systems"
  - "database-indexing"
---

# Twitter Snowflake: Distributed 64-bit ID Generation

## The Problem: The High-Scale Identity Bottleneck

In a distributed system, generating globally unique identifiers at high throughput is a major architectural challenge. Relational databases traditionally rely on auto-incrementing integer keys. In a multi-region distributed system, this introduces a single point of failure and a severe write bottleneck: every application instance must continuously lock a central database sequence to obtain the next ID.

An alternative is UUID v4. UUIDs can be generated locally without a database round trip, but they are 128 bits long — double the storage of a standard 64-bit integer — and they are completely random, with no chronological ordering. When used as primary keys in indexing engines like MySQL's InnoDB, the random insertion pattern causes massive index fragmentation, page splits, and write-throughput collapse under load.

```
Relational auto-increment : single-point bottleneck, lock contention on every insert.
UUID v4 (random)          : non-monotonic, fragments B-Tree indexes, 128-bit storage bloat.
```

We need an ID generation strategy that requires **zero coordination** at generation time, fits in a compact **64-bit** space, and remains **roughly sortable by time** (monotonic) to preserve database index insertion performance.

## The Mental Model: Component-Based Bit Allocation

The **Twitter Snowflake** pattern solves this by constructing a 64-bit identifier out of three components packed into fixed bit ranges, instead of a random number: a timestamp, a node identifier, and a per-millisecond sequence counter.

```
   1 bit        41 bits (timestamp)              10 bits (node)        12 bits (sequence)
+--------+---------------------------------+------------------------+--------------------+
| unused | ms elapsed since custom epoch   | datacenter + worker id | counter, resets/ms |
|  (0)   | (~69 years of range)            | (up to 1024 nodes)     | (0-4095 per node)  |
+--------+---------------------------------+------------------------+--------------------+
 bit 63    bits 62-22                        bits 21-12               bits 11-0
```

Because the most significant bits (after the unused sign bit) encode time, Snowflake IDs are naturally monotonic within the resolution of the clock: an ID minted later always has a numerically larger value than one minted earlier (barring clock drift — see below). That property makes Snowflake IDs fully compatible with high-performance B-Tree index insertions, unlike random UUIDs.

### Why 41 / 10 / 12 and not some other split

The split is a capacity trade-off, not an arbitrary constant:

- **41 bits of timestamp** → `2^41` milliseconds ≈ 69.7 years from a custom epoch. Using milliseconds since a *custom* epoch (e.g. your company's founding date) instead of the Unix epoch buys back decades of usable range versus using all 41 bits from 1970.
- **10 bits of node ID** → `2^10 = 1024` concurrently running worker processes across all datacenters, without any of them needing to coordinate on ID generation.
- **12 bits of sequence** → `2^12 = 4096` IDs per node per millisecond, i.e. up to 4,096,000 IDs/sec per node before the generator has to spin-wait for the next millisecond tick.

## Implementing Twitter Snowflake with BigInt in TypeScript

In JavaScript/TypeScript, standard numbers are IEEE-754 double-precision floats with only 53 bits of safe integer precision — not enough for a 64-bit ID. We must use `BigInt` throughout to avoid silent precision loss.

```typescript
export class SnowflakeGenerator {
  // 1. Bit allocation constants
  private readonly workerIdBits = 10n;
  private readonly sequenceBits = 12n;

  // 2. Max values derived via bit shifting: (-1n << N) sets N low bits to 0,
  //    XOR with -1n flips them all to 1, producing "N ones" as an unsigned max.
  private readonly maxWorkerId = -1n ^ (-1n << this.workerIdBits); // 1023
  private readonly maxSequence = -1n ^ (-1n << this.sequenceBits); // 4095

  // 3. Shift offsets: worker id sits above the sequence bits,
  //    the timestamp sits above both.
  private readonly workerIdShift = this.sequenceBits;
  private readonly timestampLeftShift = this.sequenceBits + this.workerIdBits;

  // Custom epoch: 2026-01-01T00:00:00.000Z (pick a fixed date for your system)
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

  /** Generates the next Snowflake ID. Not safe to call concurrently
   *  from multiple threads against the same instance without an
   *  external lock — see the Node.js caveat below. */
  public generate(): bigint {
    let timestamp = BigInt(Date.now());

    if (timestamp < this.lastTimestamp) {
      // Clock moved backwards (e.g. NTP correction) — refuse to generate
      // rather than risk emitting a duplicate or lower ID.
      throw new Error(
        `Clock moved backwards! Rejecting generation for ${this.lastTimestamp - timestamp}ms.`
      );
    }

    if (timestamp === this.lastTimestamp) {
      // Same millisecond as the previous call: increment the sequence.
      this.sequence = (this.sequence + 1n) & this.maxSequence;
      if (this.sequence === 0n) {
        // Sequence overflowed (4096 IDs already minted this ms) — spin
        // until the clock ticks over to the next millisecond.
        while (timestamp <= this.lastTimestamp) {
          timestamp = BigInt(Date.now());
        }
      }
    } else {
      // New millisecond: reset the sequence counter.
      this.sequence = 0n;
    }

    this.lastTimestamp = timestamp;

    // 4. Pack timestamp | workerId | sequence into one 64-bit integer.
    return (
      ((timestamp - this.customEpoch) << this.timestampLeftShift) |
      (this.workerId << this.workerIdShift) |
      this.sequence
    );
  }
}

// Usage
const generator = new SnowflakeGenerator(7); // worker id 7 of up to 1024
const id = generator.generate();
console.log(id.toString()); // e.g. "7394857204958273" — send as a STRING, see below
```

## Architectural Guardrails and Trade-offs

1. **System clock drift.** If NTP corrects a worker's clock backward, the generator above throws rather than emitting a duplicate or non-monotonic ID. In production, pair this with alerting: a clock rollback is a signal something is wrong with time sync on that host, not just a code path to swallow silently.
2. **Worker ID coordination.** Worker IDs must be unique across the *entire* running fleet at any point in time. Common approaches: a Kubernetes StatefulSet's ordinal index (`pod-0`, `pod-1`, ...), a lease held in ZooKeeper/etcd/Consul acquired at startup, or a fixed per-datacenter/per-shard assignment baked into deployment config. Reusing a worker ID across two simultaneously running processes reintroduces the collision risk Snowflake exists to prevent.
3. **JSON serialization of BigInt.** JSON has no native 64-bit integer type, and JavaScript's `JSON.stringify` throws on `BigInt` by default. Always serialize Snowflake IDs as **strings** (`"7394857204958273"`) at the API boundary — sending them as JSON numbers risks truncation to 53-bit float precision in any client that parses them as `Number`.
4. **Single-instance concurrency.** The `generate()` method above mutates `this.sequence`/`this.lastTimestamp` without a mutex. In Node.js's single-threaded event loop this is safe as long as `generate()` contains no `await`; if you port this pattern to a multi-threaded runtime (Go, Java, Rust), guard the critical section with a mutex or use atomics.

## Key Takeaways

- Central auto-increment sequences and random UUIDs both fail at distributed scale — one is a coordination bottleneck, the other destroys index locality.
- Snowflake packs timestamp, node ID, and a sequence counter into a single 64-bit integer, requiring zero coordination between nodes at generation time.
- The timestamp occupying the high bits makes IDs roughly monotonic, which keeps B-Tree index insertions sequential and fast.
- Worker ID assignment and clock-drift handling are the two operational risks that actually break Snowflake in production — both are solvable with proper orchestration tooling, not code alone.
