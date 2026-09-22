# Privileged Access Management (PAM): Engineering Just-in-Time Zero-Standing Privileges

## The Problem: The Danger of Standing Privileges
In many engineering organizations, developers, database administrators, and SREs have permanent admin access to production environments. This is known as **Standing Privileges**. 

Standing privileges represent a massive, constant threat vector:
1. **Compromised Endpoints:** If a developer's laptop is infected or their session tokens are stolen, the attacker gains permanent administrative access.
2. **Insider Threat:** Rogue or disgruntled employees can execute unauthorized commands at any time.
3. **Audit Failure:** Auditing who performed a specific production command is extremely difficult when using shared or static master accounts.

To secure administrative pathways, organizations must adopt **Privileged Access Management (PAM)** guided by the principle of **Zero-Standing Privileges (ZSP)** using **Just-In-Time (JIT) access elevation**.

---

## Core Pillars of Privileged Access Management

A modern PAM architecture relies on four pillars:

```
+-------------------------------------------------------------+
|                     Modern PAM Pillars                      |
+------------------------------+------------------------------+
| 1. Credential Vaulting       | 2. Session Isolation & Audit |
| Store & rotate static keys   | Proxy & record sessions      |
| automatically.               | to prevent raw connections.  |
+------------------------------+------------------------------+
| 3. Just-In-Time (JIT)        | 4. Ephemeral Credentials     |
| Elevate permissions on-      | Use dynamic, short-lived     |
| demand with auto-expiration. | tokens (e.g., AWS STS).      |
+------------------------------+------------------------------+
```

---

## Technical Architecture: Just-In-Time (JIT) Access Broker

The modern way to implement PAM is through a JIT Broker pattern. Rather than giving SREs static SSH keys or AWS root credentials, SREs request access, get approved, and are vended an ephemeral credential valid for a limited window (e.g., 1 hour).

```
+-----------+                    +--------------+
| SRE/Admin |                    | Approval/IdP |
+-----+-----+                    +------+-------+
      |                                 |
      | 1. Request JIT                  | 2. Approve Request
      |    Access (1 Hour)              v
      |   +-----------------------------+
      +-->|     JIT Credential Broker   |
          |       (PAM Gateway)         |
          +--------------+--------------+
                         |
                         | 3. Vend Ephemeral
                         |    Credentials
                         v
                  +------+------+
                  | Target Cloud| (AWS/Kubernetes/
                  |  Production |  Database)
                  +-------------+
```

1. **Request:** The user authenticates and requests access to a target resource for a specific duration.
2. **Approval:** The system evaluates automated policies (e.g., has a Jira ticket been created? Is there an active incident on PagerDuty?) or routes the request to an authorized human approver.
3. **Generation:** The PAM Broker talks to the Cloud provider / Vault to generate dynamic, short-lived tokens (e.g., temporary database roles, AWS IAM assumed-role credentials, SSH CA certificates).
4. **Enforcement & Expiry:** Once the TTL (Time-To-Live) expires, the cloud provider or broker automatically revokes the credential, ensuring Zero Standing Privileges.

---

## Technical Implementation: JIT Credential Broker in Python

The following Python code implements a fully functional Just-In-Time access broker. It registers resources, manages requests, vends temporary tokens with a cryptographic signature, and simulates an active cleanup worker to purge expired access.

```python
import time
import hmac
import hashlib
import json
from typing import Dict, Any, Optional

class JITBroker:
    def __init__(self, secret_key: str):
        self.secret_key = secret_key.encode('utf-8')
        # In-memory storage of active, authorized JIT leases
        # lease_id -> lease_info
        self.leases: Dict[str, Dict[str, Any]] = {}

    def request_access(self, requester: str, resource_id: str, duration_sec: int, jira_ticket: str) -> Optional[str]:
        """
        Processes and automatically verifies JIT requests.
        If a valid ticket is provided, vends a signed ephemeral access token.
        """
        # Validate business justification
        if not jira_ticket.startswith("INC-") and not jira_ticket.startswith("OPS-"):
            print(f"[JIT ERROR] Refused access for {requester} to {resource_id}: Missing valid Jira ticket context.")
            return None

        lease_id = f"lease_{requester}_{int(time.time())}"
        expires_at = time.time() + duration_sec
        
        # Generate dynamic secret token (HMAC-SHA256 signature of lease details)
        payload = f"{requester}:{resource_id}:{expires_at}:{jira_ticket}"
        token = hmac.new(self.secret_key, payload.encode('utf-8'), hashlib.sha256).hexdigest()

        self.leases[lease_id] = {
            "requester": requester,
            "resource_id": resource_id,
            "expires_at": expires_at,
            "jira_ticket": jira_ticket,
            "token": token,
            "status": "ACTIVE"
        }
        
        print(f"[JIT SUCCESS] Vended JIT Access Lease '{lease_id}' for {requester} to access {resource_id}. TTL: {duration_sec}s")
        return lease_id

    def verify_access(self, lease_id: str, presented_token: str) -> bool:
        """
        Enforcement point (PEP) checks this. Validates signature and checks expiry.
        """
        lease = self.leases.get(lease_id)
        if not lease:
            print(f"[PEP DENIED] Lease ID '{lease_id}' not found.")
            return False

        if lease["status"] == "EXPIRED":
            print(f"[PEP DENIED] Lease ID '{lease_id}' has already expired.")
            return False

        # Validate token cryptographic signature
        payload = f"{lease['requester']}:{lease['resource_id']}:{lease['expires_at']}:{lease['jira_ticket']}"
        expected_token = hmac.new(self.secret_key, payload.encode('utf-8'), hashlib.sha256).hexdigest()
        
        if not hmac.compare_digest(expected_token, presented_token):
            print("[PEP DENIED] Cryptographic token tampering detected.")
            return False

        # Check TTL expiration
        if time.time() > lease["expires_at"]:
            lease["status"] = "EXPIRED"
            print(f"[PEP DENIED] Lease '{lease_id}' expired at {lease['expires_at']}. Current time: {time.time()}")
            return False

        print(f"[PEP ALLOWED] Active lease validated for {lease['requester']} on {lease['resource_id']}.")
        return True

    def run_reaper_daemon(self):
        """Simulates a background process that continuously invalidates expired leases."""
        now = time.time()
        for lease_id, lease in list(self.leases.items()):
            if lease["status"] == "ACTIVE" and now > lease["expires_at"]:
                lease["status"] = "EXPIRED"
                print(f"[DAEMON PURGE] Dynamic cleanup: Purged and revoked lease '{lease_id}' for {lease['requester']}")

# --- Verification Simulation ---
if __name__ == "__main__":
    # Initialize the broker with a secure system key
    broker = JITBroker(secret_key="system_crypto_vault_key_abc123")

    # 1. Developer Alice requests access to DB without valid justification
    alice_lease = broker.request_access(
        requester="alice_dev", 
        resource_id="postgres-prod-db", 
        duration_sec=2, # short TTL for testing
        jira_ticket="NO_JUSTIFICATION"
    )

    # 2. SRE Bob requests access with an approved Incident ticket
    bob_lease_id = broker.request_access(
        requester="bob_sre", 
        resource_id="kubernetes-prod-cluster", 
        duration_sec=1, # Very short TTL to trigger expiration
        jira_ticket="INC-40012"
    )
    
    if bob_lease_id:
        token = broker.leases[bob_lease_id]["token"]
        
        # Verify access immediately (should succeed)
        broker.verify_access(bob_lease_id, token)
        
        # Simulate wait to trigger expiry
        print("\n--- Simulating 2-second delay to trigger TTL timeout ---")
        time.sleep(2)
        
        # Background daemon purges expired leases
        broker.run_reaper_daemon()
        
        # Verify access again (should fail)
        broker.verify_access(bob_lease_id, token)
```

---

## Tooling Landscapes: Enterprise PAM vs. Modern Cloud-Native

Modern organizations usually select from three prominent PAM architectures:

### 1. HashiCorp Vault (Dynamic Secrets Engine)
Generates real credentials on the fly (e.g., dynamically spins up database users and runs SQL `DROP USER` after TTL, or assumes AWS IAM roles via STS). Ideal for service-to-service calls and machine identities.

### 2. Teleport (Modern Access Plane)
Acts as a unified SSH/Kubernetes proxy. Instead of keys, it issues ephemeral SSH/X.509 client certificates signed by its internal CA. It records SRE terminal sessions into video-like log structures for audits.

### 3. CyberArk (Enterprise Vault)
The classic enterprise heavyweight. It operates by storing existing static admin passwords in a secure vault, automatically rotating them, and injecting them into sessions via privileged session managers, preventing human access to raw credentials.
