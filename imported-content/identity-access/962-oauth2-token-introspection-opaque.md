# OAuth 2.0 Token Introspection (RFC 7662): Validating Opaque Tokens across Microservices

## The Problem
While JSON Web Tokens (JWTs) allow microservices to validate authorization autonomously, they pose significant risks. JWTs expose internal claims (user roles, emails) if intercepted, and their stateless nature makes instant revocation difficult. To maximize security, especially for external-facing APIs, enterprises use **Opaque Tokens**—random, meaningless strings. Since microservices cannot decode opaque tokens natively, they require a fast, secure mechanism to validate them against the Authorization Server.

## Architecture: The Introspection Flow
OAuth 2.0 Token Introspection (RFC 7662) defines a standardized protocol for a Resource Server (Microservice) to query the Authorization Server to determine the active state and metadata of an opaque token.

```text
+--------+       +-------------------+       +----------------------+
|        |       |                   |       |                      |
| Client |------>| Resource Server   |------>| Authorization Server |
|        | Token | (Microservice)    | POST  | (Introspection Endpoint)|
+--------+       |                   |<------|                      |
                 +-------------------+ JSON  +----------------------+
```

## The Introspection Request
The Resource Server must authenticate itself with the Authorization Server (usually via Basic Auth or mTLS) before querying the token state. This prevents arbitrary parties from scanning token validity.

### Implementation: Introspection Middleware (Node.js)

```typescript
import axios from 'axios';
import { Request, Response, NextFunction } from 'express';

const INTROSPECTION_URL = 'https://auth.example.com/oauth2/introspect';
const CLIENT_ID = process.env.RS_CLIENT_ID;
const CLIENT_SECRET = process.env.RS_CLIENT_SECRET;

async function introspectToken(token: string) {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  
  const response = await axios.post(
    INTROSPECTION_URL,
    new URLSearchParams({ token: token }).toString(),
    {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  return response.data;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).send('Missing token');

  try {
    const introspectionResponse = await introspectToken(token);

    // Check the 'active' boolean flag defined by RFC 7662
    if (introspectionResponse.active !== true) {
      return res.status(401).send('Token inactive or revoked');
    }

    // Attach verified context to request
    req.user = {
      sub: introspectionResponse.sub,
      scope: introspectionResponse.scope,
    };
    
    next();
  } catch (err) {
    console.error('Introspection failed', err);
    return res.status(500).send('Internal Server Error');
  }
}
```

## Performance Bottlenecks & Caching
Querying the Authorization Server on every API request introduces severe latency and can take down the auth service under high load.

### Solution: Local Token Caching
Resource Servers must cache the introspection response locally for a short duration. The cache TTL should be balanced against the acceptable window of vulnerability (e.g., 60 seconds).

```typescript
import NodeCache from 'node-cache';
const tokenCache = new NodeCache({ stdTTL: 60 }); // Cache for 60 seconds

async function introspectWithCache(token: string) {
  const cachedResponse = tokenCache.get(token);
  if (cachedResponse) {
    return cachedResponse; // Return cache hit
  }

  // Fallback to network request
  const response = await introspectToken(token);
  
  if (response.active) {
    // Only cache active tokens
    tokenCache.set(token, response);
  }
  
  return response;
}
```

## Phantom Tokens (Split Tokens)
To achieve the best of both worlds (stateless internal validation + opaque external exposure), API Gateways often implement the Phantom Token pattern.
1. The Auth Server issues a signed JWT.
2. The API Gateway strips the JWT, stores it in a cache, and returns a generated opaque reference string to the client.
3. When the client makes a request, the API Gateway swaps the opaque string back to the JWT and forwards it to the internal microservices.
This avoids introspection network overhead internally while keeping tokens secure externally.
