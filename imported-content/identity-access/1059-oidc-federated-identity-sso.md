# OIDC Federated Identity: Managing Multi-Account SSO and ID Token Verification

In multi-tenant SaaS platforms or complex enterprise environments, managing identity federation across multiple distinct Identity Providers (IdPs) presents significant security and architectural challenges. A single application must securely authenticate users from Azure AD, Okta, Google Workspace, and keycloak instances without suffering from issuer confusion attacks, JWK endpoint exhaustion, or key verification bypasses.

---

## The Problem: Issuer Confusion and Key Management Bottlenecks

When an application relies on federated OpenID Connect (OIDC) providers, the core validation logic must dynamically verify ID Tokens (JWTs). A naive implementation presents critical vulnerabilities:

1. **Issuer Confusion (RFC 8252):** If the validation routine accepts any token signed by *any* trusted IdP without strictly binding the token's expected issuer (`iss`) and client ID (`aud`) to the tenant requesting authentication, an attacker can present an ID token issued by tenant A's Okta instance to gain access to tenant B's resources.
2. **JWKS Rate-Limit Abuse & Denial of Service:** A malicious user can trigger authentications with custom, unverified headers pointing to spoofed keys or send rapid requests containing arbitrary key IDs (`kid`). If the application fetches the JSON Web Key Set (JWKS) on every signature check, it exposes itself to egress network resource exhaustion and third-party rate limits.
3. **Improper Signature Validation:** Allowing the token to specify its signing algorithm dynamically (e.g., trusting `alg: "none"` or dynamically parsing an arbitrary public key from headers) can bypass signature enforcement entirely.

---

## Technical Architecture: Federated OIDC Validation Proxy

To mitigate these risks, insert a dedicated Identity Proxy / Verification layer between the client, the API Gateway, and the multiple federated IdPs. This layer isolates issuer-specific trust anchors and implements proactive JWKS caching.

```
+--------+             +--------------+             +-------------------+             +--------------+
| Client |             | Identity     |             | Redis / Local     |             | Federated    |
| (SPA)  |             | Proxy        |             | JWKS Cache        |             | IdP (Okta)   |
+--------+             +--------------+             +-------------------+             +--------------+
    |                         |                               |                              |
    | 1. Submit ID Token      |                               |                              |
    |------------------------>|                               |                              |
    |                         | 2. Extract Header & claim     |                              |
    |                         |    (iss, kid)                 |                              |
    |                         |------------------------------>|                              |
    |                         | 3. Cache Hit? (Public Keys)   |                              |
    |                         |<------------------------------|                              |
    |                         |                               |                              |
    |                         | [Cache Miss]                  |                              |
    |                         | 4. Fetch JWKS Metadata        |                              |
    |                         |------------------------------------------------------------->|
    |                         | 5. Return JWKS (JSON keys)    |                              |
    |                         |<-------------------------------------------------------------|
    |                         |                               |                              |
    |                         | 6. Update Cache (TTL 10m)     |                              |
    |                         |------------------------------>|                              |
    |                         |                               |                              |
    |                         | 7. Signature Verification     |                              |
    |                         |    & Claim Checks             |                              |
    |                         |    (iss, aud, exp, nonce)     |                              |
    |                         |--+                            |                              |
    |                         |  | Self-                      |                              |
    |                         |<-+ Validation                 |                              |
    |                         |                               |                              |
    | 8. Authenticated Session|                               |                              |
    |<------------------------|                               |                              |
```

---

## Production-Grade Code: Multi-Tenant Token Validator

Below is a robust Node.js/TypeScript implementation for verifying federated ID tokens. It enforces strict issuer boundaries, implements secure JWKS retrieval with caching, protects against algorithm confusion, and rates limits key fetch operations.

```typescript
import { createRemoteJWKSet, jwtVerify, JWTVerifyResult } from 'jose';

// Type definitions for Multi-Tenant SSO Configuration
interface TenantOIDCConfig {
  tenantId: string;
  issuer: string;
  clientId: string;
  jwksUri: string;
}

// Memory-backed registry of trusted federated identity providers
const TENANT_REGISTRY: Map<string, TenantOIDCConfig> = new Map([
  [
    'tenant-corp-a',
    {
      tenantId: 'tenant-corp-a',
      issuer: 'https://okta.corp-a.com/oauth2/default',
      clientId: '0oa1234abcdEFGH56789',
      jwksUri: 'https://okta.corp-a.com/oauth2/default/v1/keys',
    },
  ],
  [
    'tenant-corp-b',
    {
      tenantId: 'tenant-corp-b',
      issuer: 'https://login.microsoftonline.com/corp-b-tenant-id/v2.0',
      clientId: 'application-client-id-uuid-here',
      jwksUri: 'https://login.microsoftonline.com/corp-b-tenant-id/discovery/v2.0/keys',
    },
  ],
]);

// Keep-alive remote JWKS client cache to prevent dynamic endpoint hammering
const jwksClientsCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwksClientForTenant(config: TenantOIDCConfig) {
  let jwksClient = jwksClientsCache.get(config.tenantId);
  if (!jwksClient) {
    jwksClient = createRemoteJWKSet(new URL(config.jwksUri), {
      cooldownDuration: 30000, // Rate limit: refetch at most once every 30s
      timeoutDuration: 5000,   // HTTP timeout after 5s
    });
    jwksClientsCache.set(config.tenantId, jwksClient);
  }
  return jwksClient;
}

/**
 * Validates a federated ID token for a targeted tenant.
 * Protects against issuer confusion, key spoofing, and invalid algorithms.
 */
export async function verifyFederatedIdToken(
  rawToken: string,
  targetTenantId: string,
  expectedNonce?: string
): Promise<JWTVerifyResult> {
  const tenantConfig = TENANT_REGISTRY.get(targetTenantId);
  if (!tenantConfig) {
    throw new Error(`Authentication aborted: Tenant [${targetTenantId}] is not registered.`);
  }

  const jwksSet = getJwksClientForTenant(tenantConfig);

  try {
    const result = await jwtVerify(rawToken, jwksSet, {
      issuer: tenantConfig.issuer,       // Enforces exact issuer string match
      audience: tenantConfig.clientId,   // Enforces client-id restriction
      algorithms: ['RS256', 'ES256'],    // Enforce strong algorithms; bans "none" and symmetric HMAC
    });

    const { payload } = result;

    // Verify expirations and timing claims
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new Error('Federated Token validation failed: ID Token is expired.');
    }

    // Verify nonce protection against replay attacks
    if (expectedNonce && payload.nonce !== expectedNonce) {
      throw new Error('Federated Token validation failed: Nonce mismatch.');
    }

    return result;
  } catch (error: any) {
    throw new Error(`OIDC Cryptographic Handshake Verification Failed: ${error.message}`);
  }
}
```

## Key Verification Best Practices

1. **Explicit Algorithm Whitelisting:** Never trust the `alg` header field implicitly. Restrict allowed verification algorithms strictly to asymmetric signing algorithms (e.g., `RS256`, `ES256`).
2. **Dynamic Route Insulation:** Never let a client request specify the `jwksUri` directly in the payload or headers. Retrieve the JWKS URI strictly from local database tenant configs lookup.
3. **JWK Caching Rules:** Store parsed public certificate keys in memory or a fast distributed cache (such as Redis) with a strict TTL (typically 10 to 60 minutes) to absorb signature verification cycles.
