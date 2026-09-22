# RBAC vs. ABAC: Architectural Tradeoffs in Scalable Access Control

## The Problem: The Role Explosion Crisis
In the early stages of a system, access control is simple. You assign users a role—such as `Admin`, `Editor`, or `Viewer`—and gate API endpoints accordingly. This is Role-Based Access Control (RBAC). 

However, as an enterprise scales, business requirements become highly contextual. Consider these requests:
1. "Viewers can only access documents in their own department."
2. "Editors can only edit files during working hours (09:00 - 17:00) and only from corporate IP ranges."
3. "Contractors can only view documents marked with their specific project ID."

If you attempt to solve this using pure RBAC, you are forced to create specialized roles: `US_Marketing_Viewer`, `EU_Finance_Editor_WorkHours`, `Contractor_ProjectAlpha_Viewer`. This anti-pattern is known as **Role Explosion**. The system becomes unmanageable, auditing becomes impossible, and the security posture degrades.

To solve this, we must transition to Attribute-Based Access Control (ABAC), or design a hybrid architecture.

---

## Conceptual Models: Roles vs. Attributes

### Role-Based Access Control (RBAC)
RBAC binds permissions to roles, and roles to users. It is declarative, static, and highly performant because authorization is a simple set membership check.

```
[User] ---> [Assigned Roles] ---> [Associated Permissions] ---> [Resource Action]
```

### Attribute-Based Access Control (ABAC)
ABAC determines access at runtime by evaluating policies against attributes (metadata) of the **Subject** (user), **Resource** (target object), **Action** (verb), and **Environment** (context).

```
   [Subject Attributes] (e.g., Dept, IP) ---\
  [Resource Attributes] (e.g., Owner, Sec) --+---> [PDP Policy Evaluation] ---> [Allow/Deny]
    [Action Attributes] (e.g., READ, WRITE) -+
[Environment Attributes] (e.g., Time, TLS) --/
```

---

## Architectural Blueprint: The ABAC Engine (XACML Reference Model)

An enterprise ABAC architecture follows the RFC 2904 / XACML framework, separating enforcement from decision-making:

```
+------------------+             +-----------------------+
|  Subject/Client  |             |  Policy Admin (PAP)   |
+--------+---------+             +-----------+-----------+
         |                                   | (Write Policies)
         | 1. Request Access                 v
+--------v---------+    2. Ask   +-----------+-----------+
| Enforcement (PEP)|------------>|   Decision Engine     |
|   (API Gateway/  |<------------|        (PDP)          |
|    Middleware)   |   5. Decis  +-----------+-----------+
+------------------+             ^           ^
                                 |           |
                     3. Fetch    |           | 4. Fetch
                     Attributes  |           | Attributes
                               +---+       +---+
                               |PIP|       |PIP| (Database, LDAP,
                               +---+       +---+  IdP, Environment)
```

1. **Policy Enforcement Point (PEP):** Intercepts the request (e.g., API Gateway, reverse proxy, or application middleware).
2. **Policy Decision Point (PDP):** The brain that evaluates policies. It is stateless and decoupled from the application logic.
3. **Policy Information Point (PIP):** Source of truth for attributes (e.g., Redis, database, LDAP, or active request metadata).
4. **Policy Administration Point (PAP):** The repository where policies are written, versioned, and managed.

---

## Technical Implementation: RBAC & ABAC Engine in Python

Below is a robust python implementation of a decoupled Policy Decision Point demonstrating both static RBAC and dynamic, contextual ABAC evaluation.

```python
import ipaddress
from datetime import datetime, time
from typing import Dict, List, Any, Optional

class AccessRequest:
    def __init__(self, subject: Dict[str, Any], resource: Dict[str, Any], action: str, environment: Dict[str, Any]):
        self.subject = subject          # e.g., {"id": "alice", "roles": ["Editor"], "department": "Engineering"}
        self.resource = resource        # e.g., {"id": "doc_101", "department": "Engineering", "classification": "Restricted"}
        self.action = action            # e.g., "WRITE"
        self.environment = environment  # e.g., {"ip_address": "192.168.1.50", "current_time": "14:30:00"}

class PolicyDecisionPoint:
    def __init__(self, rbac_rules: Dict[str, List[str]], abac_policies: List[Dict[str, Any]]):
        self.rbac_rules = rbac_rules  # Map of role -> list of allowed permissions (e.g., "Editor" -> ["READ", "WRITE"])
        self.abac_policies = abac_policies

    def evaluate_rbac(self, request: AccessRequest) -> bool:
        """Evaluates access purely based on Subject Roles and mapped Permissions."""
        user_roles = request.subject.get("roles", [])
        for role in user_roles:
            allowed_actions = self.rbac_rules.get(role, [])
            if request.action in allowed_actions:
                return True
        return False

    def evaluate_abac(self, request: AccessRequest) -> bool:
        """Evaluates access using dynamic policies looking at multiple attributes."""
        for policy in self.abac_policies:
            if not self._match_policy_target(policy, request):
                continue
            
            # Policy matches. Evaluate the rules.
            if self._evaluate_rules(policy["rules"], request):
                return True
        return False

    def _match_policy_target(self, policy: Dict[str, Any], request: AccessRequest) -> bool:
        # Simple target matching: does this policy apply to this request action/resource-type?
        target = policy.get("target", {})
        if "action" in target and target["action"] != request.action:
            return False
        if "resource_type" in target and target["resource_type"] != request.resource.get("type"):
            return False
        return True

    def _evaluate_rules(self, rules: List[Dict[str, Any]], request: AccessRequest) -> bool:
        for rule in rules:
            rule_type = rule.get("type")
            if rule_type == "department_match":
                if request.subject.get("department") != request.resource.get("department"):
                    return False
            elif rule_type == "ip_range_restriction":
                client_ip = ipaddress.ip_address(request.environment.get("ip_address", "0.0.0.0"))
                allowed_network = ipaddress.ip_network(rule["allowed_cidr"])
                if client_ip not in allowed_network:
                    return False
            elif rule_type == "time_window":
                current_str = request.environment.get("current_time", "00:00:00")
                current = datetime.strptime(current_str, "%H:%M:%S").time()
                start = datetime.strptime(rule["start_time"], "%H:%M:%S").time()
                end = datetime.strptime(rule["end_time"], "%H:%M:%S").time()
                if not (start <= current <= end):
                    return False
            elif rule_type == "classification_check":
                if request.resource.get("classification") == "Restricted" and "Manager" not in request.subject.get("roles", []):
                    return False
        return True

# --- Verification Simulation ---
if __name__ == "__main__":
    # Define system configurations
    rbac_db = {
        "Editor": ["READ", "WRITE"],
        "Viewer": ["READ"]
    }

    abac_policies_db = [
        {
            "id": "policy_engineering_write",
            "target": {"action": "WRITE", "resource_type": "document"},
            "rules": [
                {"type": "department_match"},
                {"type": "ip_range_restriction", "allowed_cidr": "192.168.1.0/24"},
                {"type": "time_window", "start_time": "09:00:00", "end_time": "17:00:00"},
                {"type": "classification_check"}
            ]
        }
    ]

    pdp = PolicyDecisionPoint(rbac_rules=rbac_db, abac_policies=abac_policies_db)

    # Context 1: Alice wants to write to an Engineering Document during working hours from corporate IP
    req1 = AccessRequest(
        subject={"id": "alice", "roles": ["Editor"], "department": "Engineering"},
        resource={"id": "doc_101", "type": "document", "department": "Engineering", "classification": "General"},
        action="WRITE",
        environment={"ip_address": "192.168.1.45", "current_time": "14:30:00"}
    )

    # Context 2: Bob tries to do the same but from a public IP (10.0.0.5)
    req2 = AccessRequest(
        subject={"id": "bob", "roles": ["Editor"], "department": "Engineering"},
        resource={"id": "doc_101", "type": "document", "department": "Engineering", "classification": "General"},
        action="WRITE",
        environment={"ip_address": "10.0.0.5", "current_time": "14:30:00"}
    )

    print(f"RBAC Evaluation (Alice): {pdp.evaluate_rbac(req1)}")  # True - Alice is Editor
    print(f"ABAC Evaluation (Alice): {pdp.evaluate_abac(req1)}")  # True - Matches all environment/resource conditions
    print(f"RBAC Evaluation (Bob): {pdp.evaluate_rbac(req2)}")    # True - Bob is Editor
    print(f"ABAC Evaluation (Bob): {pdp.evaluate_abac(req2)}")    # False - Fails IP restriction
```

---

## Architectural Comparison & Hybrid Tradeoffs

| Criterion | Role-Based Access Control (RBAC) | Attribute-Based Access Control (ABAC) |
| :--- | :--- | :--- |
| **Complexity** | Low (O(U + R)) | High (Requires policy language engine) |
| **Performance** | Sub-millisecond (Direct lookup) | Higher latency (Rule execution and attribute fetching) |
| **Scalability** | Suffers role explosion under complex rules | Extremely high; dynamic rules require no new roles |
| **Auditability** | Easy (Who has which role?) | Complex (Requires dry-run simulations) |

### The Hybrid Compromise: Role-Centric ABAC
For high-scale systems, the recommended architecture is **Role-Centric ABAC**.
Under this pattern, roles are passed into the ABAC engine as just another subject attribute. The engine first performs a coarse-grained RBAC filter (e.g., `Does the user have the Editor role?`), and then applies fine-grained ABAC attributes (e.g., `Is this the owner? Is the IP correct?`). This keeps policies clean, minimizes database roundtrips, and prevents both Role Explosion and performance degradation.
