---
title: "OIDC Federated Identity: Multi-Tenant SSO and ID Token Verification"
description: "How to safely federate OpenID Connect across multiple external IdPs in a multi-tenant SaaS, avoiding issuer confusion and JWKS exhaustion, with a hardened Node.js verification implementation."
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "openid-connect"
  - "federated-identity"
  - "multi-tenant"
  - "jwks"
  - "id-token-verification"
  - "sso"
---

# OIDC Federated Identity: Multi-Tenant SSO and ID Token Verification

## The Problem: Issuer Confusion and JWKS Exhaustion in Multi-Tenant Federation

In a multi-tenant SaaS, supporting OpenID Connect (OIDC) federation with varying external Identity Providers (IdPs) — Okta, Azure AD, Google Workspace — introduces two recurring vulnerabilities: **issuer confusion** and **JWKS endpoint exhaustion/DoS**.

Issuer confusion happens when an application accepts a validly signed ID token from IdP A but processes it as if it belonged to IdP B, because the code never enforced strict boundaries between the token's `iss` claim, its cryptographic signature, and the tenant context it was issued for.

Signature validation also requires fetching the IdP's JSON Web Key Set (JWKS). Fetch it on every request and you add latency and risk rate-limiting. Cache it indefinitely, or let unauthenticated requests trigger cache-invalidation fetches, and an attacker can trigger a JWKS denial-of-service or slip through during a legitimate key rollover window.

---

## Architectural Blueprint

The architecture separates identity discovery, token routing, and signature verification. A tenant-to-issuer registry maps incoming requests to trusted issuers, and a verification engine handles cryptography with resilient, rate-limited JWKS caching.

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

Below is a Node.js/TypeScript implementation for verifying OIDC ID tokens in a multi-tenant environment: a per-tenant trusted-issuer registry, rate-limited JWKS caching, and strict claim validation.

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

// Memory-backed registry (in production, load this from a secure database/cache)
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

1. **Algorithm Whitelisting**: Never allow client-controlled dynamic signing algorithms. Explicitly restrict verification to modern algorithms like `RS256`, `ES256`, or `EdDSA` — never `none`.
2. **No Dynamic Issuer Discovery from the Token Itself**: Never trust the `iss` claim in the ID token payload to resolve the JWKS endpoint dynamically unless it has first been validated against a hardcoded, trusted tenant registry (as shown above).
3. **Rate-Limit JWKS Requests**: Ensure your JWKS client enforces a tight limit on outgoing HTTP requests to external provider keyrings, blocking attempts to force expensive re-fetches on every request.
4. **Reject Missing `kid`**: A token whose header lacks a `kid` cannot be safely mapped to a specific signing key — reject it rather than guessing which key to try.
