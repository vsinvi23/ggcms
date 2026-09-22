# OAuth for AI Agents: Token Exchange and Scoped Delegations

Autonomous AI agents act as digital proxies, fetching data, updating systems, and communicating with external APIs. To authenticate these agents securely, developers often rely on static api-keys or broad OAuth 2.0 client credentials. However, these patterns suffer from a fatal flaw: they provide broad, unscoped access. If an agent is hijacked via prompt injection, the attacker inherits full access to the target systems. Securing autonomous workers requires a transition to RFC 8693 (OAuth 2.0 Token Exchange).

## The Problem: The Security Gap of Broad Machine Delegation

The typical OAuth 2.0 Client Credentials flow is designed for service-to-service communication. It assumes the caller is a trusted backend system performing system-level operations. 

When an AI agent uses Client Credentials, it operates as a single super-user. The target API cannot determine which human user initiated the request, nor can it limit the agent's access to only that user's data.

```
Insecure Pattern (Client Credentials):
  [User A] -> [AI Agent] --(Client Credentials Token)--> [Target API] 
  * Vulnerability: The token grants access to data for User A, User B, and User C.

Secure Pattern (RFC 8693 Token Exchange):
  [User A] -> [AI Agent] --(Exchanges User JWT)-------> [OAuth Auth Server]
                                                            |
                                                            v (Issues Scoped Token)
  [Target API] <-----------(Limited Token: Actor context)---+
```

Conversely, if the agent directly uses the user's raw authorization token, it possesses too much power. If the task is merely to "check shipping status," the agent does not need a token that can also "delete user profile." 

To secure autonomous workers, we must dynamically trade the broad user context for a short-lived, task-specific token using the Token Exchange standard.

## Technical Architecture: RFC 8693 Token Exchange

RFC 8693 defines a structured protocol for exchanging an existing token (the `subject_token`) for a new token containing down-scoped permissions and a verified delegator chain.

```
+------------+             +------------+             +----------------------+
|  AI Agent  | --(Exch)--> | OAuth Auth | --(Issue)-->|       AI Agent       |
|            |             |   Server   |             |                      |
| - Sub_Token|             | - Validate |             | - Scoped Actor Token |
| - Act_Token|             | - Downscope|             |   (Read-Only, Shipping)
+------------+             +------------+             +----------------------+
                                                                 |
                                                                 v
                                                      +----------------------+
                                                      |   Downstream Service |
                                                      +----------------------+
```

The exchange payload specifies:
1. `subject_token`: The user's original OAuth access token.
2. `actor_token`: The agent's authenticated workload token.
3. `requested_token_type`: A scoped access token.
4. `scope`: A restricted subset of permissions (e.g., `shipping:read`).

The authorization server verifies both tokens and returns an access token containing an `act` (actor) claim detailing the delegation path.

## Implementation: Simulating an RFC 8693 Token Exchange Gateway

The following Python script simulates an OAuth 2.0 Authorization Server that implements Token Exchange. It accepts a user token and an agent client-credential claim, validates them, down-scopes the requests, and issues a highly restricted actor token.

```python
import jwt
import time
from typing import Dict, Any, List

# HMAC secret for demonstration
IDP_SECRET = "oauth_idp_secret_key"

class TokenExchangeServer:
    def __init__(self, secret: str):
        self.secret = secret

    def exchange_token(
        self,
        subject_token: str,
        actor_client_id: str,
        requested_scopes: List[str]
    ) -> str:
        """
        Implements RFC 8693 Token Exchange. Trading user context for a scoped agent token.
        """
        try:
            # 1. Decode and validate subject token (the User JWT)
            user_claims = jwt.decode(subject_token, self.secret, algorithms=["HS256"])
        except jwt.PyJWTError:
            raise PermissionError("Invalid subject token (User context).")

        # 2. Enforce strict down-scoping
        user_scopes = user_claims.get("scope", [])
        for requested_scope in requested_scopes:
            if requested_scope not in user_scopes:
                raise PermissionError(f"Escalation Attempted: {requested_scope} not allowed.")

        # 3. Mint the Actor Token (exclusively for the Agent Workload)
        now = int(time.time())
        token_payload = {
            "iss": "http://identity.serenya.internal",
            "sub": user_claims["sub"],       # Subject remains the user
            "aud": "http://api.shipping.service",
            "exp": now + 600,                # Tight lifetime (10 minutes)
            "scope": requested_scopes,       # Restricted subset
            "act": {
                "client_id": actor_client_id  # Cryptographic proof of the delegate
            }
        }

        return jwt.encode(token_payload, self.secret, algorithm="HS256")

# Verification Simulation
if __name__ == "__main__":
    server = TokenExchangeServer(IDP_SECRET)

    # 1. Create a broad user token (Authorized for read, write, and delete)
    broad_user_payload = {
        "sub": "user_id_9921",
        "scope": ["shipping:read", "shipping:write", "billing:read"]
    }
    broad_user_token = jwt.encode(broad_user_payload, IDP_SECRET, algorithm="HS256")

    # 2. Agent requests a highly restricted token to read shipping info
    print("Initiating Scoped Token Exchange for Agent...")
    try:
        agent_scoped_token = server.exchange_token(
            subject_token=broad_user_token,
            actor_client_id="shipping_agent_01",
            requested_scopes=["shipping:read"]
        )
        print("Token Exchange Successful!")
        
        # Decode output to verify structure
        decoded_actor = jwt.decode(agent_scoped_token, IDP_SECRET, algorithms=["HS256"])
        print(f"Issued JWT Payload:\n{decoded_actor}")
        
    except PermissionError as err:
        print(f"Exchange Blocked: {err}")

    # 3. Malicious Agent attempt to escalate privilege to billing
    print("\nSimulating Privilege Escalation Attempt...")
    try:
        server.exchange_token(
            subject_token=broad_user_token,
            actor_client_id="shipping_agent_01",
            requested_scopes=["billing:write"]  # Not in user's scope!
        )
    except PermissionError as err:
        print(f"Successfully Blocked Privilege Escalation: {err}")
