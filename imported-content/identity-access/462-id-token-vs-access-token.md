# The Architectural Boundary: ID Tokens vs. Access Tokens

## The Problem: Confusing Identity with Authorization
A critical vulnerability in modern web applications is the misuse of JSON Web Tokens (JWTs) by treating an **ID Token** as an **Access Token**, or vice versa. 

*   **Misusing an ID Token to call an API** allows an attacker to exploit mismatches in audience (`aud`) validation. Since an ID Token's audience is the client application itself, a downstream API that accepts an ID Token as authorization is verifying that the user logged into *that specific client*, not that the client is authorized to perform operations on the *API's protected resources*.
*   **Misusing an Access Token to drive client-side UI profiles** forces client applications to inspect opaque or API-specific access tokens. Access tokens are not designed for the client; they are delegated permissions meant solely for the Resource Server.

Confusing these two tokens bypasses the core security models of OpenID Connect (OIDC) and OAuth 2.0.

---

## Technical Architectures: Separation of Concerns

```
+---------------------------------------------------------------------------------+
|                                CLIENT APPLICATION                               |
|                                                                                 |
|  +--------------------+                      +-------------------------------+  |
|  |     ID Token       |                      |         Access Token          |  |
|  | (For UI Consumption) |                      | (Opaque or API-Specific JWT)  |  |
|  +---------+----------+                      +---------------+---------------+  |
|            |                                                 |                  |
|            v [Decodes & Reads]                               v [Bearer Header]  |
|  * Renders User Profile Name                                 |                  |
|  * Reads Email & Profile Pic                                 |                  |
|  * Enforces Client Session                                   |                  |
+--------------------------------------------------------------|------------------+
                                                               |
                                                               v
                                               +---------------+---------------+
                                               |        RESOURCE SERVER        |
                                               |             (API)             |
                                               +-------------------------------+
                                               |  * Validates API Audience     |
                                               |  * Inspects OAuth Scopes      |
                                               |  * Enforces RBAC permissions   |
                                               +-------------------------------+
```

### Detailed Token Comparison

| Metric | ID Token (OpenID Connect) | Access Token (OAuth 2.0) |
| :--- | :--- | :--- |
| **Primary Purpose** | Proves authentication occurred; shares user profile details with the client. | Authorizes a client application to access resources on behalf of a user. |
| **Intended Audience (`aud`)**| The **Client Application** (the Client ID of your SPA or Mobile App). | The **Resource Server** (the API identifier or URL). |
| **Consumable By** | **Client Application ONLY**. APIs must reject ID tokens. | **Resource Server (API) ONLY**. Client applications should treat them as opaque strings. |
| **Standard Format** | Must be a JSON Web Token (JWT). | Can be a JWT, but is often an opaque string or database key. |
| **Standard Claims** | `sub`, `iss`, `aud`, `exp`, `iat`, `auth_time`, `nonce`, `email`, `profile`. | `sub`, `iss`, `aud`, `exp`, `scope`, `client_id`. |

---

## Robust Code: Dual Validation Middleware
The following TypeScript implementation showcases how a backend system must strictly differentiate between validating an incoming ID Token and an Access Token to prevent authorization bypass.

```typescript
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const client = jwksClient({
  jwksUri: 'https://identity.yourdomain.com/.well-known/jwks.json'
});

interface TokenPayload extends jwt.JwtPayload {
  scp?: string; // scopes
  client_id?: string;
}

function getSigningKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  if (!header.kid) {
    return callback(new Error('Missing kid in token header'));
  }
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

/**
 * STRICT VALIDATOR FOR ACCESS TOKENS (Bearer API Authorization)
 */
export async function validateAccessToken(authHeader: string | undefined): Promise<TokenPayload> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or malformed Authorization header');
  }

  const token = authHeader.split(' ')[1];

  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getSigningKey,
      {
        issuer: 'https://identity.yourdomain.com',
        audience: 'https://api.yourdomain.com/v1', // MUST be the API resource identifier
        algorithms: ['RS256']
      },
      (err, decoded) => {
        if (err || !decoded) {
          return reject(new Error(`Access Token Verification Failed: ${err?.message}`));
        }
        
        // Assert it is an access token by checking scope or API-specific layout (lack of client UI fields)
        const payload = decoded as TokenPayload;
        if (!payload.scp && !payload.scope) {
          return reject(new Error('Access Token lacks required authorization scopes'));
        }

        resolve(payload);
      }
    );
  });
}

/**
 * STRICT VALIDATOR FOR ID TOKENS (Client Authentication Only)
 * Used if validating identity details, e.g., on a specialized profile-ingestion endpoint.
 */
export async function validateIdToken(token: string, expectedClientId: string): Promise<TokenPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getSigningKey,
      {
        issuer: 'https://identity.yourdomain.com',
        audience: expectedClientId, // MUST be the Client ID of the front-end application
        algorithms: ['RS256']
      },
      (err, decoded) => {
        if (err || !decoded) {
          return reject(new Error(`ID Token Verification Failed: ${err?.message}`));
        }

        const payload = decoded as TokenPayload;
        
        // ID token specific assertion (must contain authentication event detail)
        if (!payload.sub) {
          return reject(new Error('ID Token lacks a subject claim (sub)'));
        }

        resolve(payload);
      }
    );
  });
}
```

## Security Best Practices
1. **Never parse Access Tokens in JavaScript Frontends:** If your SPA needs user-profile data, configure OIDC to return an ID Token. Leave the Access Token completely untouched, passing it directly as an opaque string in requests.
2. **Audit your Resource Server:** Ensure that every API gateway, routing proxy, and controller endpoint verifies that the incoming token's audience matches the API's unique resource URI. Reject client-targeted tokens immediately.
3. **Nonce Validation:** For ID tokens, enforce checking the OIDC `nonce` claim in authorization code flow validation to prevent replay attacks on authentication.
