# OIDC Federated Identity: Managing Multi-Account SSO and ID Token Verification

## The Problem: Issuer Confusion and JWKS Exhaustion in Multi-Tenant Federation

In a multi-account or multi-tenant Software-as-a-Service (SaaS) architecture, supporting OpenID Connect (OIDC) federation with varying external Identity Providers (IdPs)—such as Okta, Azure AD, and Google Workspace—introduces severe security and performance bottlenecks. Developers frequently fall victim to two major vulnerabilities: **Issuer Confusion** and **JWKS Endpoint Exhaustion/DoS**.

Issuer Confusion occurs when an application accepts a validly signed ID token from IdP A but processes it as if it belonged to IdP B, simply because the code failed to enforce strict boundaries between the token’s issuer (`iss`) claim, its cryptographic signature, and the tenant context.

On the other hand, signature validation requires fetching the IdP's JSON Web Key Set (JWKS). If your service fetches keys from the IdP on every request, it introduces high latency and risks rate-limiting. Conversely, if it caches keys indefinitely without handling rotation, or allows unauthenticated requests to trigger immediate cache-invalidation fetches, malicious actors can trigger a JWKS denial-of-service (DoS) or bypass verification during a legitimate key rollover.

---

## Architectural Blueprint

The architecture below separates identity discovery, token routing, and signature verification. A Tenant-to-Issuer registry maps incoming requests to trusted issuers. A safe verification engine handles cryptographic validation with resilient JWKS caching.

```
+------------+             +-------------+             +-----------------+             +-------------+
| Client SPA |             | API Gateway |             | Tenant Registry |             | External IdP|
+------------+             +-------------+             +-----------------+             +-------------+
      |                           |                             |                             |
      | 1. Submit ID Token        |                             |                             |
      |-------------------------->|                             |                             |
      |                           | 2. Resolve Tenant Route     |                             |
      |                           |---------------------------->|                             |
      |                           | <---------------------------|                             |
      |                           |    Trusted Issuers Map      |                             |
      |                           |                             |                             |
      |                           | 3. Validate issuer match    |                             |
      |                           |    and fetch cached JWKS    |                             |
      |                           |---------------------------------------------------------->|
      |                           |                             |                             | 4. Fetch JWK
      |                           | <---------------------------------------------------------|    (If rotated)
      |                           |    Verify Signature & Claims|                             |
      |                           |                             |                             |
      | 5. Establish Session      |                             |                             |
      |<--------------------------|                             |                             |
```

---

## Technical Implementation

Below is a robust Node.js/TypeScript implementation for verifying OIDC ID tokens in a multi-tenant environment. It includes secure JWKS caching, automatic key rotation handling, and strict claim validation.

```typescript
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// Define the structure of our trusted tenant configuration
interface TenantConfig {
  tenantId: string;
  expectedIssuer: string;
  expectedAudience: string;
  jwksUri: string;
}

// Memory-backed registry (In production, load this from a secure database/cache)
const tenantRegistry = new Map<string, TenantConfig>([
  [
    'tenant-alpha',
    {
      tenantId: 'tenant-alpha',
      expectedIssuer: 'https://login.alpha.com',
      expectedAudience: 'client_id_alpha_123',
      jwksUri: 'https://login.alpha.com/.well-known/jwks.json',
    },
  ],
  [
    'tenant-beta',
    {
      tenantId: 'tenant-beta',
      expectedIssuer: 'https://auth.beta.org/oauth2',
      expectedAudience: 'client_id_beta_456',
      jwksUri: 'https://auth.beta.org/oauth2/v1/keys',
    },
  ],
]);

// Map to cache JWKS clients per tenant to prevent cold-start overhead
const jwksClientsCache = new Map<string, jwksClient.JwksClient>();

function getJwksClientForTenant(config: TenantConfig): jwksClient.JwksClient {
  let client = jwksClientsCache.get(config.tenantId);
  if (!client) {
    client = jwksClient({
      jwksUri: config.jwksUri,
      cache: true,
      cacheMaxEntries: 10,
      cacheMaxAge: 600000, // 10 minutes cache
      rateLimit: true,
      jwksRequestsPerMinute: 10, // Prevent JWKS DoS
    });
    jwksClientsCache.set(config.tenantId, client);
  }
  return client;
}

export async function verifyFederatedIdToken(
  token: string,
  claimedTenantId: string
): Promise<jwt.JwtPayload> {
  const config = tenantRegistry.get(claimedTenantId);
  if (!config) {
    throw new Error('UNTRUSTED_TENANT: Tenant registry entry not found');
  }

  // 1. Decode token unverified to extract header 'kid' (Key ID) and verify initial structure
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
    throw new Error('INVALID_TOKEN_STRUCTURE: Missing kid in header');
  }

  const { kid } = decoded.header;
  const client = getJwksClientForTenant(config);

  // 2. Fetch the public key associated with the kid
  const key = await new Promise<string>((resolve, reject) => {
    client.getSigningKey(kid, (err, signingKey) => {
      if (err) {
        return reject(new Error(`JWKS_FETCH_FAILED: ${err.message}`));
      }
      resolve(signingKey?.getPublicKey() || '');
    });
  });

  // 3. Cryptographically verify signature and check standard claim boundaries
  return new Promise<jwt.JwtPayload>((resolve, reject) => {
    jwt.verify(
      token,
      key,
      {
        issuer: config.expectedIssuer,     // Mitigates Issuer Confusion
        audience: config.expectedAudience, // Mitigates cross-tenant token replay
        algorithms: ['RS256'],             // Prevent Algorithm Confusion attacks
        clockTolerance: 30,                // 30-second skew handling
      },
      (err, verifiedPayload) => {
        if (err || !verifiedPayload || typeof verifiedPayload === 'string') {
          return reject(new Error(`TOKEN_VERIFICATION_FAILED: ${err?.message}`));
        }

        // 4. Double-check temporal requirements manually
        const now = Math.floor(Date.now() / 1000);
        if (verifiedPayload.nbf && verifiedPayload.nbf > now + 30) {
          return reject(new Error('TOKEN_NOT_YET_ACTIVE'));
        }

        resolve(verifiedPayload);
      }
    );
  });
}
```

---

## Defensive Hardening Checklist

1. **Algorithm Whitelisting**: Never allow client-controlled dynamic signing algorithms. Explicitly restrict signature validation to modern algorithms like `RS256`, `ES256`, or `EdDSA`.
2. **Dynamic Check Protection**: Never trust the `iss` claim printed in the ID token payload to resolve the JWKS endpoint dynamically unless it has been explicitly validated against a hardcoded, trusted whitelist first.
3. **Rate-Limit JWKS Requests**: Ensure your JWKS client library enforces a tight limit on outgoing HTTP requests to dynamic provider keyrings, blocking automated brute-force signature validation attacks from choking your backend's HTTP pool.
