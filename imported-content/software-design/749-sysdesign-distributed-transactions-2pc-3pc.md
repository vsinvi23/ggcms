# Distributed Transactions: The Latency and Blocking Costs of Two-Phase Commit (2PC) and Three-Phase Commit (3PC)

## The Problem: Achieving Atomicity Across Network Boundaries

In a monolithic database, ACID transactions are trivial. The database engine acquires local locks, writes to a write-ahead log (WAL), and commits or aborts. However, when data is partitioned across multiple distinct databases or microservices, ensuring that a transaction either commits everywhere or rolls back everywhere becomes a distributed consensus problem. 

If Service A deducts $100 from an account and Service B adds $100 to another account, a network partition or node failure after Service A commits but before Service B commits leads to an inconsistent system.

To solve this, distributed systems employ commit protocols, most notably the Two-Phase Commit (2PC) and Three-Phase Commit (3PC).

## Two-Phase Commit (2PC) Architecture

2PC introduces a **Coordinator** node that manages the transaction lifecycle across multiple **Participant** nodes.

### Phase 1: The Prepare Phase
The coordinator sends a `PREPARE` message to all participants. Each participant executes the transaction locally, acquires necessary locks, and writes the impending change to its WAL. It does not commit. It responds with a `YES` (ready to commit) or `NO` (abort).

### Phase 2: The Commit Phase
If *all* participants vote `YES`, the coordinator writes a commit decision to its WAL and broadcasts a `COMMIT` message. If *any* participant votes `NO`, or if a timeout occurs, the coordinator broadcasts a `ROLLBACK` message.

```text
    Coordinator                                Participant A                          Participant B
        |                                           |                                      |
        | ----------- PREPARE --------------------> |                                      |
        | ----------- PREPARE -----------------------------------------------------------> |
        |                                           | (acquires locks)                     | (acquires locks)
        | <---------- YES ------------------------- |                                      |
        | <---------- YES ---------------------------------------------------------------- |
        | (writes COMMIT to WAL)                    |                                      |
        | ----------- COMMIT ---------------------> |                                      |
        | ----------- COMMIT ------------------------------------------------------------> |
        |                                           | (commits, releases locks)            | (commits, releases locks)
        | <---------- ACK ------------------------- |                                      |
        | <---------- ACK ---------------------------------------------------------------- |
```

### The Blocking Problem in 2PC
2PC is a **blocking protocol**. If the coordinator fails *after* a participant has voted `YES` but *before* the participant receives the `COMMIT` or `ROLLBACK` message, the participant is stuck. It must hold its database locks indefinitely because it doesn't know the final outcome of the transaction. This can bring an entire database to a standstill.

## Code: Simulating 2PC Coordinator Logic

```python
import requests
import time

class Coordinator:
    def __init__(self, participants):
        self.participants = participants
        self.timeout = 5.0 # seconds

    def execute_transaction(self, transaction_data):
        # Phase 1: Prepare
        votes = []
        for p in self.participants:
            try:
                resp = requests.post(f"{p}/prepare", json=transaction_data, timeout=self.timeout)
                votes.append(resp.status_code == 200)
            except requests.exceptions.RequestException:
                votes.append(False)

        # Phase 2: Commit or Rollback
        if all(votes):
            self._broadcast("/commit", transaction_data["tx_id"])
            return "COMMITTED"
        else:
            self._broadcast("/rollback", transaction_data["tx_id"])
            return "ROLLED_BACK"

    def _broadcast(self, endpoint, tx_id):
        for p in self.participants:
            try:
                requests.post(f"{p}{endpoint}", json={"tx_id": tx_id})
            except Exception as e:
                # In real 2PC, the coordinator must retry indefinitely until ACK
                self.log_retry(p, endpoint, tx_id)
```

## Three-Phase Commit (3PC): Mitigating the Blocking Problem

To solve the blocking issue of 2PC, 3PC introduces an intermediate phase and a timeout mechanism for participants. The assumption is a fail-stop model where network partitions don't cause split-brain scenarios (which makes 3PC theoretical in many modern cloud environments, but fundamentally important to understand).

### The Three Phases
1. **CanCommit:** Coordinator asks if participants can commit. Participants reply YES/NO.
2. **PreCommit:** If all say YES, coordinator sends `PRE-COMMIT`. Participants acknowledge and transition to a state where they *know* a commit is coming, but don't commit yet.
3. **DoCommit:** Coordinator sends the final `COMMIT`.

```text
State Machine of 3PC Participant:
[INIT] ---> (Wait for CanCommit) ---> [READY] ---> (Wait for PreCommit) ---> [PRE-COMMITTED] ---> (Wait for DoCommit) ---> [COMMITTED]
```

### How 3PC Fixes Blocking
If the coordinator dies during 3PC, the participants can communicate with each other or elect a new coordinator to determine the state:
- If any participant is in the `PRE-COMMITTED` state, the new coordinator knows everyone voted YES in Phase 1, so it is safe to push everyone to `COMMITTED`.
- If no participant reached `PRE-COMMITTED`, it is safe to `ROLLBACK`.

### The Latency Cost
While 3PC mitigates blocking, it introduces an extra network round-trip. In a globally distributed system, an extra round trip adds hundreds of milliseconds of latency, holding database locks longer and severely degrading throughput. Furthermore, network partitions (the 'P' in CAP theorem) can cause 3PC to fail or cause inconsistencies, meaning it is rarely used in modern microservices.

Instead of 2PC and 3PC, modern systems rely on the **Saga Pattern**, eventual consistency, and compensating transactions to avoid distributed locking entirely.
