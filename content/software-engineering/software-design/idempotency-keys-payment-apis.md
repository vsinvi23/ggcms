---
title: "Idempotency Keys: Making Payment APIs Safe to Retry"
description: "How to make non-idempotent POST requests safe under network retries using idempotency keys, including the database ledger design, race conditions, and payload-mismatch handling."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "idempotency"
  - "api-design"
  - "payment-apis"
  - "retry-pattern"
  - "distributed-systems"
---

# Idempotency Keys: Making Payment APIs Safe to Retry

## The Problem: The Ambiguity of a Failed Network Call

Networks are unreliable, and nowhere does that matter more than in payments. When a client sends `POST /charges` — "charge this credit card $50" — three outcomes are possible:

1. **Success.** The server processes the charge and returns `200 OK`.
2. **Explicit failure.** The server rejects it and returns `400 Bad Request`.
3. **Ambiguous failure.** The connection times out with no response at all.

The third case is the dangerous one. Did the request never reach the server? Or did the server successfully charge the card and the response was lost on the way back? The client genuinely cannot tell the difference.

If the client assumes failure and retries, it risks charging the customer twice. If it assumes success and doesn't retry, the user is stuck staring at a spinner and the order never completes. Neither option is acceptable for a payment API.

## The Mental Model: Cashing a Check

Imagine handing a bank teller a $50 check. They process it and hand you cash. Now imagine you suffer a moment of amnesia, walk out, turn around, and hand the same teller a photocopy of that exact check five minutes later. The teller won't pay you again — the check has a unique number, and the bank's ledger already recorded that specific check as cashed.

Idempotency keys build exactly this "check number" mechanism into an API.

## The Solution: Idempotency Keys

An operation is **idempotent** if running it multiple times produces the same result as running it once. `GET`, `PUT`, and `DELETE` are inherently idempotent by the HTTP spec's own semantics. `POST` is not — every `POST /charges` is, by default, a brand-new charge.

To make a `POST` safe to retry, the client generates a unique identifier (typically a UUIDv4) representing *this specific transaction intent*, and sends it as an `Idempotency-Key` header. The server is responsible for recognizing a repeated key and returning the original result instead of re-executing the operation.

```text
+--------+                          +--------+                      +----------+
| Client |                          |  API   |                      |    DB    |
+--------+                          +--------+                      +----------+
    |  POST /charges                    |                                |
    |  Idempotency-Key: 123-abc         |                                |
    |----------------------------------->                                |
    |                                    |  Check if key '123-abc' exists |
    |                                    |------------------------------->|
    |                                    |         Not found              |
    |                                    |<-------------------------------|
    |                                    |  Process payment ($50)         |
    |                                    |  Save {key, response} atomically|
    |                                    |------------------------------->|
    |          201 Created               |                                |
    |<----- (network dies here!) --------X                                |
    |                                    |                                |
    |  (timeout; client retries safely) |                                |
    |  POST /charges                    |                                |
    |  Idempotency-Key: 123-abc         |                                |
    |----------------------------------->                                |
    |                                    |  Check if key '123-abc' exists |
    |                                    |------------------------------->|
    |                                    |     Found! Return cached resp. |
    |                                    |<-------------------------------|
    |          201 Created (cached)      |  (payment gateway NOT called)  |
    |<------------------------------------                                |
```

## Implementing the Logic

**1. Check the ledger first.** When a request arrives, the API immediately looks up the `Idempotency-Key` in an `idempotency_keys` table (or a fast key-value store like Redis) before doing any work.

**2. Handle concurrent duplicate submissions.** What if a user double-clicks "Submit" and two identical requests race in at the same millisecond? A unique constraint on the `idempotency_key` column is what actually protects you here, not an application-level `SELECT` then `INSERT`. Whichever request wins the insert race proceeds; the loser gets a constraint violation and should respond `409 Conflict` (or `425 Too Early`) telling the client to retry the read shortly after.

**3. Detect payload mismatches.** A buggy or malicious client might reuse the same idempotency key for two *different* payloads — say, trying to change a $50 charge to $10 on the "retry." The server must hash the request body and compare it against the hash stored with the original key. A mismatch means this is not a legitimate retry; return `422 Unprocessable Entity` rather than silently executing either version.

**4. Return the cached response.** If the key exists, the payload hash matches, and the original request succeeded, return the exact same status code and body that was generated the first time — without calling the payment gateway again.

### Reference Schema and Request Flow (PostgreSQL)

```sql
CREATE TABLE idempotency_keys (
    idempotency_key   UUID PRIMARY KEY,
    request_hash      TEXT NOT NULL,
    response_status   INT,
    response_body     JSONB,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);
```

```python
import hashlib
import json

def handle_charge_request(idempotency_key: str, request_body: dict, db):
    request_hash = hashlib.sha256(
        json.dumps(request_body, sort_keys=True).encode()
    ).hexdigest()

    existing = db.fetch_one(
        "SELECT request_hash, response_status, response_body "
        "FROM idempotency_keys WHERE idempotency_key = %s",
        [idempotency_key],
    )

    if existing:
        if existing["request_hash"] != request_hash:
            return {"status": 422, "body": {"error": "idempotency key reused with a different payload"}}
        # Safe retry: return exactly what we returned the first time.
        return {"status": existing["response_status"], "body": existing["response_body"]}

    # First time seeing this key: try to claim it via the unique constraint.
    try:
        db.execute(
            "INSERT INTO idempotency_keys (idempotency_key, request_hash) VALUES (%s, %s)",
            [idempotency_key, request_hash],
        )
    except UniqueViolation:
        # Lost a race with a concurrent identical request; ask the client to retry shortly.
        return {"status": 409, "body": {"error": "request already in progress, retry shortly"}}

    result = call_payment_gateway(request_body)  # the actual charge

    db.execute(
        "UPDATE idempotency_keys SET response_status = %s, response_body = %s "
        "WHERE idempotency_key = %s",
        [result["status"], json.dumps(result["body"]), idempotency_key],
    )
    return result
```

## Architectural Trade-offs

- **Storage growth.** Every idempotency key and its response payload has to be stored, and that table grows without bound if you never clean it up. Standard practice is a 24–72 hour TTL (Redis `EXPIRE`, or a scheduled job on the Postgres table). After the TTL, the client must generate a fresh key for a new transaction attempt.
- **Added latency.** Every write now costs an extra read (check for the key) and an extra write (persist the response). For financial transactions, that single-digit-millisecond cost is trivial next to the alternative — an accidental double charge.

## Common Misconceptions

**Misconception:** "Idempotency keys make retries automatically safe."
**Reality:** They make retries safe *only if the server actually implements the check-and-store logic correctly*, including the unique constraint for the race condition and the payload-hash check. A client sending the header does nothing if the server ignores it.

**Misconception:** "GET requests need idempotency keys too."
**Reality:** `GET` is already idempotent by definition — it doesn't mutate state, so retrying it is always safe. Idempotency keys matter specifically for `POST` (and sometimes `PATCH`) requests that create or mutate state.

## Key Takeaways

- Idempotency keys turn a non-idempotent `POST` into a safely-retryable operation by giving each transaction intent a unique, client-generated identifier.
- The server must persist the key and its response atomically with the mutation, enforce a unique constraint to close the concurrent-retry race, and verify the payload hash to reject key reuse with different data.
- Keys need a TTL — this is a bounded ledger, not permanent storage.
- Idempotency keys are the foundation that makes aggressive client-side retry strategies (like exponential backoff) safe to use against payment and other state-mutating APIs.

## What to Learn Next

- Exponential backoff with jitter, the client-side retry strategy that idempotency keys make safe to use aggressively.
- The Transactional Outbox pattern, which solves the analogous "did my write really get published" ambiguity on the server-to-broker side.
- The Saga pattern's use of idempotent compensating transactions, which relies on exactly this same key/ledger technique.
