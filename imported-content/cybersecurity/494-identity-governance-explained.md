# Identity Governance and Administration (IGA): Designing Separation of Duties & Access Attestation

## The Problem: Entitlement Creep and Toxic Access
When users are hired, they receive a baseline set of permissions. As they move across departments or take on temporary projects, they request and receive new access rights. However, their old privileges are rarely revoked. This security degradation is known as **Entitlement Creep** (or Privilege Creep).

Left unmanaged, entitlement creep leads to two severe security failures:
1. **Orphaned Accounts:** Departed employees whose active directory profiles remain enabled, leaving open backdoors into corporate resources.
2. **Toxic Combinations / SoD Violations:** A single user holding conflicting privileges. For example, a financial analyst who can both **create** an invoice and **approve** payments, or a developer who can both **write** code and **deploy** it to production without a peer review.

To prevent financial fraud and intellectual property theft, systems must be designed around **Identity Governance and Administration (IGA)**, incorporating robust **Access Reviews** and **Separation of Duties (SoD)**.

---

## The Core Pillars of IGA

An effective IGA framework manages the identity lifecycle and enforces structural constraints:

```
                  +-----------------------------------+
                  |      IGA Governance Lifecycle     |
                  +-----------------+-----------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
            v                                               v
+-----------------------+                       +-----------------------+
|  Identity Lifecycle   |                       |    Access Control     |
|   (Joiner-Mover-      |                       |       Enforcement     |
|   Leaver System)      |                       |  (SoD & Least Priv)   |
+-----------+-----------+                       +-----------+-----------+
            |                                               |
            +-----------------------+-----------------------+
                                    |
                                    v
                        +-----------------------+
                        |  Access Attestation   |
                        | (Continuous Reviews/  |
                        |      Certifications)  |
                        +-----------------------+
```

### 1. Separation of Duties (SoD)
SoD is a control where a critical business process is split between multiple identities. There are two types:
- **Static SoD (Role-level):** A user cannot belong to both `Billing_Creator` and `Billing_Approver` groups simultaneously.
- **Dynamic SoD (Transaction-level):** A user can belong to both groups, but cannot approve a specific invoice they created.

### 2. Access Attestation (Reviews)
A system-wide periodic campaign where resource owners or managers must explicitly certify that a user's permissions are still required. If the manager fails to respond, the system should default to revoking the access (Secure-by-Default).

---

## Technical Implementation: SoD Enforcement & Attestation Engine in Python

Here is an enterprise-grade Python script simulating an IGA engine that loads user entitlements, checks for static and dynamic SoD violations, and conducts an automated attestation (review) campaign.

```python
from typing import List, Dict, Set, Tuple

class UserEntitlement:
    def __init__(self, username: str, roles: Set[str], department: str):
        self.username = username
        self.roles = roles
        self.department = department

class IdentityGovernanceEngine:
    def __init__(self, static_sod_rules: List[Tuple[str, str]]):
        self.static_sod_rules = static_sod_rules  # List of conflicting role pairs
        self.users: Dict[str, UserEntitlement] = {}

    def register_user(self, user: UserEntitlement):
        self.users[user.username] = user

    def check_static_sod_violations(self, username: str) -> List[str]:
        """
        Scans a user's assigned roles to detect static toxic combinations.
        """
        user = self.users.get(username)
        if not user:
            return []

        violations = []
        for role_a, role_b in self.static_sod_rules:
            if role_a in user.roles and role_b in user.roles:
                violations.append(f"Conflict: User holds both '{role_a}' and '{role_b}' (Static SoD violation)")
        return violations

    def enforce_dynamic_sod(self, transaction_creator: str, transaction_approver: str, amount: float) -> bool:
        """
        Enforces transaction-level SoD. A user cannot approve their own transaction.
        """
        if transaction_creator == transaction_approver:
            print(f"[DYNAMIC SoD DENIED] Blocked transaction of ${amount}. Creator and Approver must be distinct identities.")
            return False
        
        print(f"[DYNAMIC SoD PASSED] Transaction of ${amount} approved. Creator: {transaction_creator}, Approver: {transaction_approver}")
        return True

    def trigger_attestation_campaign(self, certifier_manager: str) -> Dict[str, Any]:
        """
        Simulates generating an access review catalog for a manager.
        """
        review_catalog = {}
        for username, user in self.users.items():
            review_catalog[username] = {
                "roles_to_certify": list(user.roles),
                "action_required": "Manager Attestation (APPROVE/REVOKE)"
            }
        return {
            "campaign_id": f"campaign_{int(time_point())}",
            "certifier": certifier_manager,
            "items": review_catalog
        }

    def process_attestation_response(self, username: str, decisions: Dict[str, str]):
        """
        Processes responses from access certification.
        If decision is 'REVOKE', the role is stripped from the user.
        """
        user = self.users.get(username)
        if not user:
            return

        for role, decision in decisions.items():
            if decision == "REVOKE":
                if role in user.roles:
                    user.roles.remove(role)
                    print(f"[REVOKED] Stripped role '{role}' from '{username}' due to manager attestation decision.")
            elif decision == "APPROVE":
                print(f"[APPROVED] Retained role '{role}' for '{username}'.")

def time_point():
    import time
    return time.time()

# --- Verification Simulation ---
if __name__ == "__main__":
    # Define Toxic Combinations
    toxic_rules = [
        ("Invoice_Creator", "Invoice_Approver"),
        ("Code_Developer", "Production_Deployer")
    ]

    iga = IdentityGovernanceEngine(static_sod_rules=toxic_rules)

    # Register users
    # Alice has accumulated toxic combinations over time
    alice = UserEntitlement("alice_smart", {"Invoice_Creator", "Invoice_Approver", "Auditor"}, "Finance")
    # Bob has clean separated roles
    bob = UserEntitlement("bob_builder", {"Code_Developer"}, "Engineering")

    iga.register_user(alice)
    iga.register_user(bob)

    # 1. Check for Static SoD Violations
    print("=== Scanning for Static SoD Violations ===")
    alice_violations = iga.check_static_sod_violations("alice_smart")
    for v in alice_violations:
        print(v)
    
    print(f"Bob Violations count: {len(iga.check_static_sod_violations('bob_builder'))}")

    # 2. Enforce Dynamic SoD
    print("\n=== Evaluating Dynamic Transaction-level SoD ===")
    iga.enforce_dynamic_sod(transaction_creator="alice_smart", transaction_approver="alice_smart", amount=150000.0)
    iga.enforce_dynamic_sod(transaction_creator="alice_smart", transaction_approver="bob_builder", amount=150000.0)

    # 3. Simulate Attestation (Manager Review Campaign)
    print("\n=== Access Certification / Attestation Campaign ===")
    campaign = iga.trigger_attestation_campaign(certifier_manager="chief_financial_officer")
    
    # Manager decides to clean up Alice's toxic credentials
    alice_decisions = {
        "Invoice_Creator": "APPROVE",
        "Invoice_Approver": "REVOKE" # Strip the approver role to fix the violation
    }
    
    iga.process_attestation_response("alice_smart", alice_decisions)

    # Re-evaluate static violations for Alice
    print("\n=== Post-Attestation Scan for Alice ===")
    post_violations = iga.check_static_sod_violations("alice_smart")
    if not post_violations:
        print("Success! No SoD violations remain for Alice.")
```

---

## Identity Governance Best Practices

To architect robust identity structures:
- **Deploy Joiner-Mover-Leaver automation:** Integrate your IGA engine directly with HR systems (such as Workday or BambooHR). A resignation in HR must trigger instant, automated de-provisioning of all IT accounts (Leaver).
- **Reject "Rubber-Stamp" Approvals:** Force managers to review metadata, last-login logs, and usage details within the attestation UI. If a user hasn't exercised a permission in 90 days, auto-revoke it.
- **Implement Dual-Custody:** For critical systems (e.g., DNS record updates or deployment of root certificates), require two distinct authorized identities to enter MFA tokens before execution.
