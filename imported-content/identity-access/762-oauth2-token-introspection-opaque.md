# OAuth 2.0 Token Introspection: Validating Opaque Tokens across Microservices

## The Problem: Stateless Payload Leakage vs. Opaque Verification Latency

Many modern distributed systems use JSON Web Tokens (JWTs) to pass identities statelessly between microservices. However, standard JWTs have two major architectural drawbacks: **Data Exposure** and **Revocation Lag**.

Because JWTs can be easily decoded by anyone who possesses them, encoding sensitive claims (e.g., internal user roles, dynamic feature flags, or personally identifiable information) in client-accessible JWTs exposes the internal structure of your backend to the public web. Furthermore, because JWT signature validation is stateless, immediately disabling an access token across decoupled services is highly challenging without building a complex real-time revocation pipeline.

To solve this, secure architectures employ **Opaque Tokens**—randomly generated, high-entropy strings containing zero structured data. The client gets a completely meaningless handle, while microservices validate this handle in real-time. But if every downstream microservice queries the main Authorization Server (AS) database to validate the opaque token on every request, the database becomes a single point of failure and a significant latency bottleneck. 

The standard solution is **OAuth 2.0 Token Introspection (RFC 7662)**, combined with gateway-level cache coordination.

---

## Architectural Blueprint: The RFC 7662 Verification Flow

RFC 7662 defines a standard HTTP POST protocol where microservices act as Resource Servers (RS). They query the central Authorization Server's protected introspection endpoint with client-submitted opaque tokens. To keep latency low, services cache verification results locally for a short, strictly managed period.

```
+------------+             +-----------------+             +-------------------+             +---------------+
| Client SPA |             | Microservice RS |             | Local Cache (TTL) |             | Auth Server AS|
+------------+             +-----------------+             +-------------------+             +---------------+
      |                             |                                |                               |
      | 1. Request + Opaque Token   |                                |                               |
      |---------------------------->|                                |                               |
      |                             | 2. Check local token cache     |                               |
      |                             |------------------------------->|                               |
      |                             | <------------------------------|                               |
      |                             |    Cache Miss                  |                               |
      |                             |                                |                               |
      |                             | 3. POST /introspect (RFC 7662)                                 |
      |                             |    (Basic Auth or Bearer)                                      |
      |                             |--------------------------------------------------------------->|
      |                             |                                |                               | 4. Validate
      |                             | <--------------------------------------------------------------|    & Return Claims
      |                             |    JSON: { "active": true, ... }                               |
      |                             |                                |                               |
      |                             | 5. Populate Token Cache (Short TTL)                            |
      |                             |------------------------------->|                               |
      |                             |                                |                               |
      | 6. Serve Request Data       |                                |                               |
      |<----------------------------|                                |                               |
```

---

## Technical Implementation

Below is a production-ready Node.js/TypeScript middleware implementation for downstream microservices. It intercepts incoming HTTP calls, performs RFC 7662 introspection, parses standard claims, and caches the authenticated state securely with automated cache invalidation.

```typescript
import axios from 'axios';
import NodeCache from 'node-cache';

interface IntrospectionResponse {
  active: boolean;
  scope?: string;
  client_id?: string;
  username?: string;
  sub?: string;
  exp?: number;
  nbf?: number;
  aud?: string;
  iss?: string;
}

export class IntrospectionMiddleware {
  // Local cache to prevent Authorization Server bottlenecking
  private tokenCache: NodeCache;

  constructor(
    private introspectionEndpoint: string,
    private clientId: string,
    private clientSecret: string,
    cacheDefaultTtlSeconds: number = 60
  ) {
    this.tokenCache = new NodeCache({
      stdTTL: cacheDefaultTtlSeconds,
      checkperiod: 10,
      useClones: false,
    });
  }

  /**
   * Express-compatible middleware for introspecting incoming opaque tokens
   */
  public getHandler() {
    return async (req: any, res: any, next: () => void) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'invalid_request', error_description: 'Missing Bearer token' });
      }

      const opaqueToken = authHeader.substring(7);

      try {
        const tokenDetails = await this.introspectTokenWithCache(opaqueToken);
        
        if (!tokenDetails.active) {
          return res.status(401).json({ error: 'invalid_token', error_description: 'The access token is inactive or revoked' });
        }

        // Attach validated token claims to request context
        req.tokenClaims = tokenDetails;
        next();
      } catch (err) {
        console.error('CRITICAL: Token Introspection failure', err);
        // Fail closed for security safety
        return res.status(500).json({ error: 'server_error', error_description: 'Identity verification system is currently offline' });
      }
    };
  }

  private async introspectTokenWithCache(token: string): Promise<IntrospectionResponse> {
    // 1. Check local memory cache
    const cachedData = this.tokenCache.get<IntrospectionResponse>(token);
    if (cachedData) {
      return cachedData;
    }

    // 2. Perform outbound Introspection Call (RFC 7662)
    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    
    const response = await axios.post<IntrospectionResponse>(
      this.introspectionEndpoint,
      new URLSearchParams({ token }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${basicAuth}`,
          'Accept': 'application/json',
        },
        timeout: 2000, // Strict timeout to keep microservice latency low
      }
    );

    const data = response.data;

    if (!data || typeof data.active !== 'boolean') {
      throw new Error('INVALID_INTROSPECTION_RESPONSE: Response payload must contain boolean "active" claim');
    }

    // 3. Cache the introspection result if active
    if (data.active) {
      const remainingTtl = this.calculateCacheTtl(data.exp);
      if (remainingTtl > 0) {
        this.tokenCache.set(token, data, remainingTtl);
      }
    }

    return data;
  }

  private calculateCacheTtl(expSecs?: number): number {
    if (!expSecs) {
      return 30; // Default fallback TTL
    }
    const currentTimeSecs = Math.floor(Date.now() / 1000);
    const timeToExpiry = expSecs - currentTimeSecs;
    
    // Cap TTL to maximum 120 seconds to guarantee timely revocation checks
    return Math.max(0, Math.min(timeToExpiry, 120));
  }
}
```

---

## Defensive Hardening Checklist

1. **Mutual Authenticated Introspection**: Always require downstream microservices to authenticate themselves to the Authorization Server (e.g., using Client Credentials, Basic Auth, or mTLS) before querying the introspection endpoint.
2. **Cap Introspection TTL**: Keep local cache TTLs low (typically 30–60 seconds). A high TTL reintroduces the revocation lag vulnerability that opaque tokens are designed to fix.
3. **Handle Empty Scopes**: Ensure microservices validate not just the `"active": true` status, but also explicitly check the returned `scope` and `aud` fields before processing requests.
