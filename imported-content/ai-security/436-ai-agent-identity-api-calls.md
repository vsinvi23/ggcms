# AI Agent Identity: Who Is Actually Making the API Call?

The rapid adoption of autonomous AI agents has introduced a critical security dilemma at the API gateway: when a downstream API is invoked, who is the principal? Is it the human user who prompted the agent, the agentic system orchestrating the workflow, or a hybrid identity combining both? Failing to cleanly resolve this identity ambiguity leads to unchecked delegation, privilege escalation, and completely untraceable audit trails.

## The Problem: The Vulnerability of Unrestricted Impersonation

Traditionally, application security models operate under simple assumptions: either a human user directly authenticates via a session cookie/JWT, or a service-to-service call is made using static machine credentials (client credentials flow). 

When autonomous agents enter the loop, they act as proxies. They dynamically interpret a user's prompt, select appropriate tools, and construct API payloads on the fly. 

```
Impersonation Pattern (Insecure):
  [Human User] --(Instructs)--> [AI Agent] --(Uses User's JWT)--> [Downstream API]
  * Problem: Downstream API cannot distinguish between direct human actions and AI-synthesized actions.

Confused Deputy Pattern (Insecure):
  [Human User] --(Instructs)--> [AI Agent] --(Uses Agent Machine Token)--> [Downstream API]
  * Problem: Downstream API loses human user context, leading to vertical or horizontal privilege escalation.
```

If an agent impersonates a user by using their raw JWT, downstream APIs cannot differentiate between a direct, deliberate user action and a malicious prompt injection attack acting through the agent. Conversely, if the agent uses a generic system-level credential, downstream access control checks are bypassed, enabling a user to instruct the agent to access resources they do not own.

To close these gaps, we need a cryptographic dual-principal model where downstream services can verify both the human initiator (the End User) and the machine executor (the AI Agent).

## Technical Architecture: Dual-Principal Authorization

The dual-principal architecture enforces that every agentic API request carries a composite credential containing both the authenticated human user context and the authenticated agent context.

```
+------------+             +------------+             +---------------------+
| Human User | --(Query)-> |  AI Agent  | --(API Run) |     API Gateway     |
|            |             |            |             |                     |
|  [JWT_user]|             | [JWT_agent]|             | [Validate & Audit]  |
+------------+             +------------+             +---------------------+
      |                          |                               |
      |                          +------(Composite Token)--------+
      |                                                          |
      v                                                          v
+--------------------------+                         +---------------------+
| Identity Provider (IDP)  |                         | Downstream Services |
+--------------------------+                         +---------------------+
```

The API Gateway decodes the composite token, verifying that:
1. The user has delegated permission to the specific agent instance.
2. The agent is currently executing an active workflow.
3. The downstream service logs both identities to ensure absolute audit non-repudiation.

## Implementation: Dual-Identity Middleware and Structured Audit Logging

The following Python middleware demonstrates how to validate a composite token containing both a user context and an agent cryptographically signed claim. It validates delegation and outputs a structured audit log that ties the physical action to the model and user.

```python
import jwt
import time
import logging
from typing import Dict, Any, Optional

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("AgentAudit")

# Simulated Key Store for verification
PUBLIC_KEYS = {
    "user_idp_pub": "USER_IDP_PUBLIC_KEY_PEM",
    "agent_pki_pub": "AGENT_SYSTEM_PUBLIC_KEY_PEM"
}

class IdentityValidationException(Exception):
    pass

class AgentIdentityGateway:
    def __init__(self, key_store: Dict[str, str]):
        self.keys = key_store

    def process_agent_request(
        self, 
        user_token: str, 
        agent_delegation_token: str, 
        target_resource: str
    ) -> Dict[str, Any]:
        """
        Validates the dual-principal credentials and logs the audit event.
        """
        try:
            # 1. Decode User Identity
            user_claims = jwt.decode(
                user_token, 
                self.keys["user_idp_pub"], 
                algorithms=["RS256"],
                options={"verify_signature": False} # Simplified for illustration
            )
            
            # 2. Decode Agent Identity and Delegation Claims
            agent_claims = jwt.decode(
                agent_delegation_token,
                self.keys["agent_pki_pub"],
                algorithms=["RS256"],
                options={"verify_signature": False} # Simplified for illustration
            )
        except Exception as e:
            raise IdentityValidationException(f"Token decoding failed: {str(e)}")

        # 3. Validate Delegation Logic
        user_id = user_claims.get("sub")
        delegated_user = agent_claims.get("delegated_on_behalf_of")
        
        if user_id != delegated_user:
            raise IdentityValidationException("Mismatched delegation claim: User ID mismatch.")

        # 4. Check Token Expiration
        current_time = time.time()
        if user_claims.get("exp", 0) < current_time or agent_claims.get("exp", 0) < current_time:
            raise IdentityValidationException("One or more credentials have expired.")

        # 5. Extract Metadata for Auditing
        audit_payload = {
            "timestamp": int(current_time),
            "event": "API_CALL_DELEGATED",
            "principal_user": user_id,
            "principal_agent": agent_claims.get("iss"),
            "agent_instance": agent_claims.get("agent_instance_id"),
            "model_version": agent_claims.get("model_spec", {}).get("version"),
            "target_resource": target_resource,
            "workflow_id": agent_claims.get("workflow_id")
        }

        # Emitting deterministic structured audit log
        logger.info(f"AUDIT_RECORD: {audit_payload}")
        return audit_payload

# Demonstration execution
if __name__ == "__main__":
    gateway = AgentIdentityGateway(PUBLIC_KEYS)
    
    # Mock tokens
    mock_user_jwt = "header.eyJzdWIiOiAidXNlcl84MjM0IiwgImV4cCI6IDI3MDAwMDAwMDB9.signature"
    mock_agent_jwt = (
        "header.eyJpc3MiOiAiYWdlbnRfb3JjaGVzdHJhdG9yIiwgImFnZW50X2luc3RhbmNlX2lkIjogImFndF85OTkyMSIs "
        "ImRlbGVnYXRlZF9vbl9iZWhhbGZfb2YiOiAidXNlcl84MjM0IiwgIndvcmtmbG93X2lkIjogIndmb180ODk0MyIsICJtb"
        "2RlbF9zcGVjIjogeyJtb2RlbCI6ICJnbW4tMS41IiwgInZlcnNpb24iOiAicHJvLTAwMSJ9LCAiZXhwIjogMjcwMDAwMDAwMH0.signature"
    )

    try:
        record = gateway.process_agent_request(
            user_token=mock_user_jwt,
            agent_delegation_token=mock_agent_jwt,
            target_resource="/api/v1/user/financials"
        )
        print("Authorization Succeeded and Audit Logged Successfully.")
    except IdentityValidationException as err:
        print(f"Authorization Blocked: {err}")
