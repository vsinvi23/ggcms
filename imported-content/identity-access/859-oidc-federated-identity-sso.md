# OIDC Federated Identity: Managing Multi-Account SSO and ID Token Verification

## The Problem: The Risk of Dynamic Discovery in Multi-Tenant OIDC RPs

When implementing an OpenID Connect (OIDC) Relying Party (RP) that supports federated Single Sign-On (SSO) across multiple external identity providers (IdPs), security boundaries must be tightly enforced. In a multi-tenant or multi-account architecture, a common anti-pattern is trust-on-first-use metadata fetching. 

If the RP dynamically fetches the OpenID Provider Discovery document (`/.well-known/openid-configuration`) based on an arbitrary, user-supplied issuer URL (`iss`), the system is highly vulnerable to two severe attacks:
1. **Server-Side Request Forgery (SSRF):** An attacker triggers the RP to send outbound HTTP requests to internal IP addresses or sensitive local endpoints under the guise of an "issuer URL".
2. **Cross-Tenant Identity Spoofing:** An attacker registers an arbitrary external IdP (under their control) and signs ID tokens containing claims matching target accounts, tricking the RP into logging the attacker into a victim's tenant space.

To mitigate these risks, the RP must implement strict domain validation on issuer discovery, enforce absolute isolation of cryptographic public keys (JWKS) per tenant, and parse the resulting ID tokens with exhaustive signature and boundary checks.

---

## Technical Architecture

The following diagram illustrates the secure handshake, SSRF check, discovery configuration parsing, and ID token verification loop:

```
+-------------+         1. Initiates federated login          +---------------+
|             | --------------------------------------------> |               |
|             |                                               |               |
|             |         2. Validate issuer domain (SSRF check) |               |
|             |            [Allowed list check / DNS Check]   |               |
|             |                                               |               |
|             |         3. GET /.well-known/openid-conf       |    Relying    |
|   Identity  | <-------------------------------------------- |     Party     |
|   Provider  |                                               |     (RP)      |
|    (IdP)    |         4. Returns JSON containing JWKS URI   |               |
|             | --------------------------------------------> |               |
|             |                                               |               |
|             |         5. Dynamic check of JWKS URI          |               |
|             |         6. GET /jwks.json                     |               |
|             | <-------------------------------------------- |               |
|             |                                               |               |
|             |         7. Returns Public Keys (JWK)          |               |
|             | --------------------------------------------> |               |
+-------------+                                               +---------------+
                                                                      |
                                                                      | 8. Verify JWT signature,
                                                                      |    issuer, audience, 
                                                                      |    and tenant claims.
                                                                      v
                                                              +---------------+
                                                              | Successful    |
                                                              | Session       |
                                                              +---------------+
```

---

## Core Challenges & Mitigations

### 1. SSRF Mitigation during OIDC Discovery
When a tenant requests federation, they supply an Issuer Identifier. Before performing GET requests to `https://<supplied-issuer>/.well-known/openid-configuration`, the RP must run strict validation. Allow lists should be checked using regular expressions or specific DNS resolution filtering. Private network IPs (RFC 1918), loopbacks, and link-local addresses must be blacklisted at the network layer or within the HTTP client.

### 2. JWKS Caching and Key-Pinning
Public keys must be cached to avoid requesting the JWKS endpoint on every API call. This caching layer is vulnerable to Denial of Service (DoS) if an attacker spams requests with synthetic Key IDs (`kid`), forcing the RP to constantly fetch the JWKS. High-quality RPs implement an LRU cache with a strict rate-limiter for backchannel fetches.

### 3. Verification of Identity Claims
Once the public key is retrieved, signature validation is performed. The verification engine must explicitly enforce that the `iss` matches the configured identity provider, the `aud` matches the RP client identifier, and token validity bounds (`exp`, `nbf`, `iat`) are met.

---

## Code Implementation: TypeScript

The following implementation leverages `jose` and custom logic to securely resolve, parse, and verify multi-tenant OIDC configurations.

```typescript
import { jwtVerify, createRemoteJWKSet } from 'jose';
import axios from 'axios';
import { URL } from 'url';

interface TenantConfig {
  tenantId: string;
  expectedIssuer: string;
  expectedAudience: string;
  allowedDomains: string[];
}

export class OIDCFederationManager {
  private jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

  constructor(private config: TenantConfig) {}

  /**
   * Sanitizes and validates the issuer URL to prevent SSRF attacks.
   */
  private validateIssuerUrl(issuerUrl: string): URL {
    const parsedUrl = new URL(issuerUrl);
    
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('SSRF Block: Only HTTPS protocol is allowed.');
    }

    const host = parsedUrl.hostname;
    
    // Prevent access to local networks/private IP ranges
    const isLocal = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host);
    if (isLocal) {
      throw new Error('SSRF Block: Access to private networks is forbidden.');
    }

    // Verify host against tenant allowed domains
    const isDomainAllowed = this.config.allowedDomains.some(domain => 
      host === domain || host.endsWith('.' + domain)
    );

    if (!isDomainAllowed) {
      throw new Error('Federation Block: Issuer domain is not in the approved tenant allowlist.');
    }

    return parsedUrl;
  }

  /**
   * Fetches the OpenID Discovery configuration securely.
   */
  public async fetchDiscoveryMetadata(issuerUrl: string): Promise<string> {
    const sanitizedIssuer = this.validateIssuerUrl(issuerUrl);
    const discoveryUrl = `${sanitizedIssuer.origin}/.well-known/openid-configuration`;

    const response = await axios.get(discoveryUrl, {
      timeout: 5000,
      maxRedirects: 0, // Prevent redirect loops/SSRF redirection
      headers: { 'User-Agent': 'Serenya-Federation-Engine/1.0' }
    });

    if (!response.data || typeof response.data.jwks_uri !== 'string') {
      throw new Error('OIDC Discovery failed: missing jwks_uri.');
    }

    return response.data.jwks_uri;
  }

  /**
   * Verifies the OIDC ID Token against the dynamic JWKS.
   */
  public async verifyIDToken(idToken: string, issuerUrl: string): Promise<any> {
    const jwksUri = await this.fetchDiscoveryMetadata(issuerUrl);

    // Dynamic JWKS validation set with client-side caching
    let jwksSet = this.jwksCache.get(jwksUri);
    if (!jwksSet) {
      jwksSet = createRemoteJWKSet(new URL(jwksUri), {
        cooldownDuration: 30000, // 30 seconds rate-limiting on key fetches
        timeout: 5000,
      });
      this.jwksCache.set(jwksUri, jwksSet);
    }

    const { payload } = await jwtVerify(idToken, jwksSet, {
      issuer: this.config.expectedIssuer,
      audience: this.config.expectedAudience,
      clockTolerance: '2 minutes'
    });

    // Enforce Tenant claim isolation check
    if (payload.tid && payload.tid !== this.config.tenantId) {
      throw new Error('Identity Claim Violation: Tenant ID mismatch.');
    }

    return payload;
  }
}
```

---

## Operational Verification

To verify your configuration in production:
- Inject an ID token signed by an external, unauthorized developer key store; the validation engine must reject the signature because the issuer URL domain fails the dynamic domain validation step.
- Verify that dynamic key-rotation handles certificate upgrades without system restart, while protecting your endpoints against arbitrary network SSRF requests.
