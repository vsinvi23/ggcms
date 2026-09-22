# The Incident Lifecycle: Orchestrating Preventive, Detective, and Corrective Controls

## The Problem: The Myth of Absolute Prevention
Many software developers build applications on a single, flawed assumption: **"If our preventive controls are strong enough, we will never be breached."** They spend 100% of their security budget on inputs like web firewalls, input validation, and API authentication.

But in real-world systems, prevention eventually fails. Zero-day exploits are discovered, credentials are leaked, and misconfigurations occur. If your system lacks mechanisms to identify and remediate an active compromise, the impact of a breach is catastrophic:
- Attackers can siphon database data slowly over months because no alarms go off.
- High-severity database corruption goes unnoticed, overriding backups.

Resilient security architectures treat security as a continuous lifecycle. We must balance our defense posture across three control types: **Preventive**, **Detective**, and **Corrective**.

---

## The Control Lifecycle Timeline

Controls are mapped to their execution temporal position relative to a security incident:

```
        PRE-INCIDENT                    DURING INCIDENT                   POST-INCIDENT
+---------------------------+    +---------------------------+    +---------------------------+
|    PREVENTIVE CONTROLS    |    |    DETECTIVE CONTROLS     |    |    CORRECTIVE CONTROLS    |
|                           |    |                           |    |                           |
|  - API Gateway Auth       |===>|  - Intrusion Detection    |===>|  - Session Revocation     |
|  - Input Validation       |    |  - Audit Log Anomalies    |    |  - Automatic Fallback     |
|  - Database Constraints   |    |  - Real-time Alerting     |    |  - DB Transaction Rollback|
+---------------------------+    +---------------------------+    +---------------------------+
       (Blocks Attack)                   (Alerts Breach)                (Repairs & Recovers)
```

---

## Technical Control Classification

1. **Preventive Controls (Active Gating):** Operate before an incident occurs. Their purpose is to block unauthorized activity.
2. **Detective Controls (Continuous Monitoring):** Operate during or immediately after an incident. Their purpose is to identify, log, and alert on security policy violations or system anomalies.
3. **Corrective Controls (Auto-Remediation):** Operate post-incident. Their purpose is to mitigate damage, roll back compromised states, quarantine components, and restore operational integrity.

---

## Technical Implementation: Self-Healing Security Pipeline in Python

This Python implementation models a transaction system. It contains:
- **Preventive Checks:** Restricts illegal inputs and excessive initial request volumes.
- **Detective Engine:** Conducts stateful "velocity checks" (traffic volume over time) to identify rapid, automated credential stuffing or transaction abuse.
- **Corrective Actions:** Automatically locks the compromised account, cancels/rolls back the offending database transaction, and alerts administrators.

```python
import time
from typing import Dict, List, Tuple

class AccountDatabase:
    def __init__(self):
        self.balances: Dict[str, float] = {"acc_1001": 5000.0, "acc_1002": 1500.0}
        self.locked_accounts: Set[str] = set()
        self.transaction_history: List[Dict[str, Any]] = []

    def get_balance(self, account_id: str) -> float:
        return self.balances.get(account_id, 0.0)

    def update_balance(self, account_id: str, amount: float):
        if account_id in self.balances:
            self.balances[account_id] = amount

class SecurityPipeline:
    def __init__(self, db: AccountDatabase):
        self.db = db
        # Detective State: tracks timestamps of requests per account
        # account_id -> list of timestamps
        self.request_log: Dict[str, List[float]] = {}
        # Maximum transactions allowed per 5 seconds before triggering detective alert
        self.velocity_threshold = 3 

    def process_transaction(self, sender: str, recipient: str, amount: float) -> Tuple[bool, str]:
        # --- 1. PREVENTIVE CONTROL ---
        # Block transaction if account is locked
        if sender in self.db.locked_accounts:
            return False, "TRANSACTION REJECTED: Account is locked due to security policy."

        # Validate basic parameters (Input Sanitization & Constraints)
        if amount <= 0:
            return False, "TRANSACTION REJECTED: Transaction amount must be positive."

        sender_balance = self.db.get_balance(sender)
        if sender_balance < amount:
            return False, "TRANSACTION REJECTED: Insufficient funds."

        # --- 2. DETECTIVE CONTROL (Velocity Monitoring) ---
        now = time.time()
        if sender not in self.request_log:
            self.request_log[sender] = []
        
        # Prune logs older than 5 seconds
        self.request_log[sender] = [t for t in self.request_log[sender] if now - t < 5.0]
        self.request_log[sender].append(now)

        # Evaluate if anomaly threshold is crossed
        if len(self.request_log[sender]) > self.velocity_threshold:
            print(f"[DETECTIVE ALERT] Anomaly detected on '{sender}'. Rate of request exceeded threshold!")
            # Trigger corrective action immediately
            self._trigger_corrective_action(sender, last_attempted_amount=amount)
            return False, "TRANSACTION REJECTED: Security anomaly triggered. Account quarantined."

        # Execute Transaction (Temporary state)
        original_sender_bal = sender_balance
        original_recipient_bal = self.db.get_balance(recipient)

        self.db.update_balance(sender, original_sender_bal - amount)
        self.db.update_balance(recipient, original_recipient_bal + amount)
        
        # Log Transaction
        self.db.transaction_history.append({
            "sender": sender,
            "recipient": recipient,
            "amount": amount,
            "timestamp": now,
            "rollback_state": (sender, original_sender_bal, recipient, original_recipient_bal)
        })

        return True, "TRANSACTION SUCCESSFUL"

    def _trigger_corrective_action(self, account_id: str, last_attempted_amount: float):
        """
        --- 3. CORRECTIVE CONTROL ---
        Automatically executes damage control and state rollback.
        """
        print(f"[CORRECTIVE ACTION] Initiating containment procedure for '{account_id}'...")
        
        # Isolation: Lock the account to prevent further drain
        self.db.locked_accounts.add(account_id)
        print(f"[CORRECTIVE] Account '{account_id}' has been LOCKED.")

        # State Rollback: Revert any transaction processed in the last 2 seconds of the storm
        now = time.time()
        for txn in reversed(self.db.transaction_history):
            if txn["sender"] == account_id and (now - txn["timestamp"]) < 2.0:
                s_id, s_bal, r_id, r_bal = txn["rollback_state"]
                self.db.update_balance(s_id, s_bal)
                self.db.update_balance(r_id, r_bal)
                print(f"[CORRECTIVE] Rolled back transaction of ${txn['amount']} to {r_id}.")

# --- Verification Simulation ---
if __name__ == "__main__":
    db = AccountDatabase()
    pipeline = SecurityPipeline(db)

    print("--- Initial Database Balances ---")
    print(f"Alice (sender): ${db.get_balance('acc_1001')}")
    print(f"Bob (recipient): ${db.get_balance('acc_1002')}")

    # 1. Test Preventive: Negative transfer
    print("\nExecuting transaction: -100 USD")
    ok, msg = pipeline.process_transaction("acc_1001", "acc_1002", -100.0)
    print(msg)

    # 2. Test Normal transaction (Below detective thresholds)
    print("\nExecuting normal transaction: 100 USD")
    ok, msg = pipeline.process_transaction("acc_1001", "acc_1002", 100.0)
    print(msg)
    print(f"Alice Balance: ${db.get_balance('acc_1001')}")

    # 3. Test Attack Storm (Velocity threshold exceeded)
    print("\n--- Attack Simulation: Triggering high velocity transactions ---")
    pipeline.process_transaction("acc_1001", "acc_1002", 100.0)
    pipeline.process_transaction("acc_1001", "acc_1002", 100.0)
    # This fourth rapid transaction should trigger the Detective and Corrective flow
    ok, msg = pipeline.process_transaction("acc_1001", "acc_1002", 100.0)
    print(msg)

    # Verify final states
    print("\n--- Post-Incident Database Balances ---")
    print(f"Alice (sender): ${db.get_balance('acc_1001')} (Should be restored to 4900.0)")
    print(f"Bob (recipient): ${db.get_balance('acc_1002')} (Should be restored to 1600.0)")
    print(f"Is Alice's Account Locked? {'acc_1001' in db.locked_accounts}")
```

---

## Aligning to Incident Response Frameworks (NIST SP 800-61)

A balanced control strategy matches the lifecycle steps outlined in the NIST Computer Security Incident Handling Guide:
- **Preparation & Prevention:** Deploying structural preventive controls like mTLS, parameterized SQL, and robust MFA.
- **Detection & Analysis:** Utilizing SIEM platforms, Intrusion Detection Systems (IDS), and anomalies analyzers to capture the moment a policy boundary is violated.
- **Containment, Eradication & Recovery:** Designing corrective software routines—like automated token blocklists, host isolation, and zero-loss database point-in-time recoveries—to minimize system impact without needing slow human manual intervention.
