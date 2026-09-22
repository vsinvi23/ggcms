# OIDC Federated Identity: Managing Multi-Account SSO and ID Token Verification

## The Problem
In multi-tenant SaaS environments, users often maintain multiple identities across different organizations, leading to session overlap, incorrect account mapping, and token confusion. Relying purely on traditional OAuth2 access tokens for identity context is insufficient, as access tokens are designed for API authorization, not authentication. When a user logs in via a federated OpenID Connect (OIDC) provider, the Relying Party (RP) must securely process, validate, and manage the ID Token to guarantee the user's identity context without mixing up active sessions across different accounts.

## Architectural Architecture

```text
+-----------+        +-----------------+        +--------------------+
|           | 1.Auth |                 | 2.Auth |                    |
| User      |------->| Relying Party   |------->| Identity Provider  |
| Agent     | Request| (Your App)      | Request| (Okta, Auth0, etc) |
|           |<-------|                 |<-------|                    |
+-----------+ 5.SSO  +--------+--------+ 3.Code +--------------------+
                      |       |          & ID Token
                 6. Session   | 4. Validate
                 Mapping      v
                     +-----------------+
                     |                 |
                     | Token Validator |
                     | (JWKS cache)    |
                     +-----------------+
```

## ID Token Verification Mechanics
An ID Token is a JWT signed by the Identity Provider (IdP). Verifying it requires fetching the IdP's JSON Web Key Set (JWKS), validating the signature, and meticulously checking the claims (`iss`, `aud`, `exp`, `nonce`).

### Robust ID Token Verification (Node.js)

```typescript
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(new URL('https://idp.example.com/.well-known/jwks.json'));

async function verifyIdToken(idToken: string, expectedNonce: string) {
  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: 'https://idp.example.com/',
      audience: 'your-client-id',
    });

    if (payload.nonce !== expectedNonce) {
      throw new Error('Nonce mismatch: potential replay attack.');
    }

    // Ensure the authentication time is recent if max_age was requested
    if (payload.auth_time && (Math.floor(Date.now() / 1000) - payload.auth_time > 3600)) {
      throw new Error('Authentication too old, re-authentication required.');
    }

    return payload;
  } catch (error) {
    console.error('ID Token validation failed:', error);
    throw new Error('Invalid ID Token');
  }
}
```

## Managing Multi-Account SSO
When a user has multiple accounts (e.g., `user@corp.com` accessing both "Org A" and "Org B"), the RP must separate session state.

### Multi-Account Session Strategy
1. **Tenant-Specific Redirect URIs**: Use `https://app.example.com/login/callback/{tenant_id}`. This enforces strict logical separation during the OIDC flow.
2. **Account Selection Prompts**: Pass `prompt=select_account` to the IdP during the authorization request. This forces the IdP to ask the user which identity they intend to use, preventing automatic, silent SSO into the wrong account.
3. **Session Scoping**: Store the federated `sub` (subject identifier) tied explicitly to the `tenant_id` within the RP's session store.

```typescript
// Express.js route handling tenant-specific SSO
app.get('/login/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  const state = generateState(tenantId);
  const nonce = generateNonce();
  
  // Store state and nonce in session mapped to the tenant
  req.session[`oidc_${state}`] = { nonce, tenantId };

  const authUrl = new URL('https://idp.example.com/authorize');
  authUrl.searchParams.append('client_id', 'your-client-id');
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('scope', 'openid profile email');
  authUrl.searchParams.append('redirect_uri', `https://app.example.com/callback`);
  authUrl.searchParams.append('state', state);
  authUrl.searchParams.append('nonce', nonce);
  authUrl.searchParams.append('prompt', 'select_account'); // Enforce account selection
  
  res.redirect(authUrl.toString());
});
```

## Avoiding Sub/Email Confusion
A critical vulnerability in OIDC implementations is mapping users by `email` instead of `sub`. The `sub` claim is a unique, immutable identifier. Emails can change, be recycled, or remain unverified.

**Rule:** Always map external identities using a compound key: `(IdP_Issuer, sub)`.

```sql
-- Database schema for federated identities
CREATE TABLE federated_credentials (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    idp_issuer VARCHAR(255) NOT NULL,
    idp_subject VARCHAR(255) NOT NULL,
    UNIQUE(idp_issuer, idp_subject)
);
```

By mapping the exact `iss` and `sub`, you prevent account takeover via email spoofing across different IdPs.
