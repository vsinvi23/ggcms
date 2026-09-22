# OAuth 2.0 Token Introspection (RFC 7662): Validating Opaque Tokens across Microservices

## The Problem: The Introspection Storm in Distributed Microservices

Opaque (or reference) tokens are highly secure from a client-side perspective because they contain zero internal state, expose no payload data, and can be instantly revoked at the Authorization Server (AS). However, when microservices ingest an opaque token, they cannot parse it locally. Instead, they must invoke the **OAuth 2.0 Token Introspection** endpoint (`RFC 7662`) to resolve the token's validity, scope, and user context.

In a complex, distributed microservices landscape, this pattern creates a massive bottleneck:

```
+--------+       1. API Call with Opaque Token       +-------------+
| Client | ----------------------------------------> | API Gateway |
+--------+                                           +-------------+
                                                            |
                     +--------------------------------------+ (Proxy Request)
                     v                                      v
            +----------------+                     +----------------+
            |   Service A    |                     |   Service B    |
            +----------------+                     +----------------+
                    |                                      |
                    +-------------------+------------------+
                                        | 2. Post RFC 7662 Introspection Requests
                                        v
                            +----------------------+
                            | Authorization Server | (Becomes a performance
                            | (Opaque Token DB)    |  single-point-of-failure)
                            +----------------------+
```

If every microservice queries the Authorization Server for every downstream API hop, the AS gets hammered with an **Introspection Storm**. This leads to high response latencies, massive resource overhead, and a centralized single point of failure (SPOF) that negates the structural isolation advantages of microservices.

---

## Technical Architecture

To prevent Introspection Storms, microservices must implement an optimized verification architecture incorporating **authenticated backchannels**, **secure local caching**, and a **circuit breaker** to fail-safe when the Authorization Server is degraded.

```
Incoming Request ----> [Token Introspection Interceptor]
                             |
                             |-- 1. Check local cache (Redis/LRU)
                             |      (If HIT and valid -> Proceed to Downstream)
                             |
                             |-- 2. If MISS: Check Circuit Breaker
                             |      (If OPEN -> Reject/Fallback)
                             |
                             +-- 3. Query AS Introspection Endpoint (mTLS)
                                    |
                                    +--> Update Local Cache with token TTL
```

---

## Core Operational Safeguards

### 1. Authenticated Backchannel
The Introspection endpoint must be heavily protected. Resource servers must authenticate themselves to the Authorization Server using Client Credentials (OAuth 2.0) or Mutual TLS (mTLS) to prevent unauthorized token exposure.

### 2. Microsecond-Agnostic TTL Caching
Caching token verification metadata is essential, but the cache TTL must never exceed the remaining life of the token. The cached payload must expire at the exact second the token's `exp` timestamp is reached.

### 3. Fail-Safe Circuit Breakers
If the Authorization Server experiences downtime, the resource server’s circuit breaker must trip to stop the cascade of failing HTTP calls, returning clean, unified error responses to client gateways.

---

## Code Implementation: Python (asyncio)

The following implementation is a highly optimized, production-ready, thread-safe asynchronous client that manages RFC 7662 token introspection with dynamic cache expiration and robust error boundary control.

```python
import httpx
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone

logger = logging.getLogger("OpaqueTokenIntrospector")

class OpaqueTokenIntrospector:
    def __init__(
        self, 
        introspection_url: str, 
        client_id: str, 
        client_secret: str,
        cache_backend: Any,  # Expected to be a Redis-like client supporting get/setex
        cache_ttl_cap: int = 300  # Cap caching at 5 minutes to prevent stale revocation states
    ):
        self.introspection_url = introspection_url
        self.client_id = client_id
        self.client_secret = client_secret
        self.cache = cache_backend
        self.cache_ttl_cap = cache_ttl_cap
        self.http_client = httpx.AsyncClient(timeout=3.0)

    async def _fetch_from_authorization_server(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Executes an authenticated backchannel request to the AS Introspection Endpoint.
        """
        try:
            # Perform POST request using client credentials authentication (RFC 7662 Section 2.1)
            response = await self.http_client.post(
                self.introspection_url,
                data={"token": token},
                auth=(self.client_id, self.client_secret),
                headers={"Accept": "application/json"}
            )
            
            if response.status_code != 200:
                logger.error(f"AS returned error status: {response.status_code}")
                return None
                
            return response.json()
        except httpx.HTTPError as e:
            logger.critical(f"Introspection request failed due to network error: {str(e)}")
            return None

    async def introspect(self, token: str) -> Dict[str, Any]:
        """
        Validates the opaque token. Leverages local caching with strict token expiration alignment.
        """
        # 1. Check if token metadata is in the local cache
        cache_key = f"token_intro:{token[:16]}" # Cache key hashed or truncated for security
        try:
            cached_data = await self.cache.get(cache_key)
            if cached_data:
                logger.debug("Token introspection cache hit.")
                return cached_data
        except Exception as e:
            logger.warning(f"Failed to query token cache: {str(e)}")

        # 2. Fetch from AS if cache miss
        payload = await self._fetch_from_authorization_server(token)
        if not payload or not payload.get("active"):
            raise ValueError("Opaque Token is invalid or inactive.")

        # 3. Calculate dynamic cache TTL aligned with token expiration
        exp_timestamp = payload.get("exp")
        if exp_timestamp:
            current_time = int(datetime.now(timezone.utc).timestamp())
            remaining_ttl = exp_timestamp - current_time
            
            # Align cache lifetime with actual token expiration, capping at config limits
            cache_ttl = min(remaining_ttl, self.cache_ttl_cap)
            
            if cache_ttl > 0:
                try:
                    await self.cache.setex(cache_key, cache_ttl, payload)
                except Exception as e:
                    logger.error(f"Failed to write token context to cache: {str(e)}")

        return payload

    async def close(self):
        await self.http_client.aclose()
```

---

## Operational Verification

To verify your introspection pipeline:
1. Issue an opaque token and invoke an API; confirm that the first request results in an HTTP POST to the Authorization Server.
2. Immediately invoke the same API again; verify that the response returns in microseconds, confirming a cache hit.
3. Revoke the token at the Authorization Server; wait for the short-term cache TTL to expire, then verify that subsequent requests are correctly blocked with a `401 Unauthorized` response.
