---
title: "System Design & Distributed Microservices Interview Track"
description: "SME-level evaluation covering zero-loss write pipelines, distributed tracing, idempotency keys, database sharding, connection pooling, and circuit breaker patterns."
categorySlug: "backend-apis"
articleType: "INTERVIEW_PREP"
level: "Staff"
durationMinutes: 480
---

# System Design & Distributed Microservices Interview Track

Welcome to the Staff/Principal Engineer System Design evaluation track. This module tests your capability to design resilient, fault-tolerant, high-throughput distributed systems.

---

### Question 1: How do you architect a zero-loss write ingestion pipeline handling 500k writes/sec with PostgreSQL and Kafka?

Think Prompt: Evaluate event buffering, Change Data Capture (CDC), outbox patterns, DB connection pooling with PgBouncer, and bulk batch upserts under extreme write saturation.

Model Answer / Explanation:
1. Architectural Topology: Implement the Transactional Outbox Pattern to eliminate dual-write inconsistencies. When API gateways receive write requests, API service workers commit business domain data and an outbox record within the same PostgreSQL local ACID transaction.
2. Change Data Capture & Streaming: Deploy Debezium CDC connectors listening directly to PostgreSQL Write-Ahead Logs (WAL). Debezium streams outbox mutations asynchronously into partitioned Apache Kafka topics partitioned by entity ID (e.g. `user_id` or `tenant_id`).
3. Bulk Consumption & Connection Pooling: Downstream sink consumer workers read Kafka batches and execute high-throughput bulk upserts (`INSERT INTO target_table ... ON CONFLICT DO UPDATE`) via PgBouncer transaction-level connection poolers.
4. Resiliency & Backpressure: Deploy Token Bucket rate limiters at the NGINX/Envoy API Gateway layer. If PostgreSQL primary experience write latency spikes, Kafka buffers incoming writes on NVMe disks for up to 7 days without data loss.

Common Mistakes:
- Performing synchronous HTTP dual-writes to both PostgreSQL and Kafka in API request handlers
- Omitting fencing tokens when acquiring distributed locks during cluster failover
- Neglecting database connection starvation on PostgreSQL primary nodes during heavy write spikes

Related Concepts: Transactional Outbox, Debezium CDC, Kafka Partitioning, PgBouncer, Bulk Upsert
Related Courses: mastering-go-microservices-course, grpc-vs-rest-microservices, postgresql-indexing-and-query-tuning

---

### Question 2: How do you guarantee exact-once execution and distributed idempotency across asynchronous microservices?

Think Prompt: Analyze SHA-256 idempotency keys, Redis TTL locks, optimistic concurrency control, and saga orchestration vs choreography.

Model Answer / Explanation:
1. Client Idempotency Key Injection: Require HTTP clients to submit a unique `X-Idempotency-Key` header (UUIDv4 or SHA-256 hash of request payload) on non-idempotent operations (POST/PUT).
2. Distributed Lock & State Storage: On receiving a request, the API gateway attempts an atomic `SET key lock_value NX PX 5000` in Redis. If the key exists with a completed result, the gateway immediately returns the cached response with a `200 OK` header.
3. Transactional Execution: If the key is new, processing proceeds. Upon successful completion, the service writes the execution payload and status code to Redis with a configurable TTL (e.g., 24 hours) and commits the DB transaction.
4. Saga Orchestration: For multi-service workflows, deploy Temporal.io or an internal Saga Orchestrator that records state transitions in an append-only event store and executes compensating transactions upon downstream service failure.

Common Mistakes:
- Relying on client-provided non-unique timestamps as idempotency keys
- Releasing Redis locks before the database transaction has successfully committed
- Missing Dead Letter Queue (DLQ) processing for unrecoverable poison pill messages

Related Concepts: Idempotency Keys, Redis Distributed Locks, Saga Pattern, Dead Letter Queue, Temporal
Related Courses: mastering-go-microservices-course, domain-driven-design-principles

---

### Question 3: How do you design a multi-region distributed cache invalidation strategy with sub-10ms global reads?

Think Prompt: Evaluate cache-aside vs write-through, Redis Cluster cross-region replication, invalidation pub/sub over NATS JetStream, and stale-while-revalidate edge headers.

Model Answer / Explanation:
1. Multi-Region Read Tier: Deploy local Redis read-replicas or Cloudflare Workers KV near edge entry points. Read queries hit local cache instances, yielding p99 latency < 5ms.
2. Invalidation Events: When primary database records are updated in the primary write region, a Change Data Capture (CDC) worker emits invalidation messages (`tombstone:entity:123`) to a NATS JetStream global message fabric.
3. Edge Invalidation Workers: Lightweight edge subscriber processes receive tombstone events and evict or refresh local Redis keys within < 200ms globally.
4. Cache Headers: Serve public API assets with `Cache-Control: public, max-age=60, stale-while-revalidate=300` headers to allow browsers and edge CDNs to serve stale content while asynchronously fetching updated payloads.

Common Mistakes:
- Flushing entire cache namespaces on single entity updates
- Creating infinite invalidation loops across multi-region bidirectional synchronization setups
- Omitting explicit Time-To-Live (TTL) values on cached Redis keys

Related Concepts: Cache Invalidation, Redis Read Replicas, NATS JetStream, Stale-While-Revalidate, Edge Computing
Related Courses: postgresql-indexing-and-query-tuning, gcp-cloud-run-deployment-guide

---

### Question 4: How do you prevent cascading failures and thread starvation during upstream service outage scenarios?

Think Prompt: Evaluate circuit breakers, bulkhead isolation, adaptive token bucket rate limiting, and exponential backoff with full jitter.

Model Answer / Explanation:
1. Circuit Breakers: Wrap upstream gRPC/HTTP calls in a Circuit Breaker (e.g. Resilience4j or Go `gobreaker`). If error rates exceed 50% over a 10-second rolling window, transition to `OPEN` state and return fast fallbacks (`503 Service Unavailable`) without attempting network requests.
2. Bulkhead Isolation: Segregate worker thread pools and connection channels by upstream service. A failure in an analytics reporting service cannot exhaust connection pools used by critical payment processing endpoints.
3. Adaptive Rate Limiting: Monitor CPU saturation and HTTP latency p99. If latency exceeds SLA thresholds, dynamically reduce API Gateway rate limits using token bucket algorithms.
4. Retry Policy with Jitter: Exponential backoff equation `sleep = min(cap, base * 2^attempt) + rand(0, jitter)` prevents thundering herd spikes against recovering upstream services.

Common Mistakes:
- Executing linear retries without randomized jitter, creating severe thundering herd retry storms
- Maintaining unbounded request queues that consume memory and cause worker thread starvation
- Omitting fallback mechanisms when circuit breakers trip open

Related Concepts: Circuit Breakers, Bulkhead Pattern, Thundering Herd, Exponential Backoff, Token Bucket
Related Courses: go-concurrency-patterns, grpc-vs-rest-microservices
