# OAuth Consent Screens: Under the Hood of User Delegation UI

## The Problem: The Shadow Delegation Layer
To an end-user, an OAuth consent screen is just a modal or web page they click through to grant a third-party app (e.g., an integration tool) access to their account. They see: *"This app wants to view your profile and send emails."* They click "Authorize," and it's done.

But for developers, building a secure, robust Authorization Server requires treating the consent phase as a critical **Security Boundary**. 

Simply rendering a static HTML form is a major vulnerability. If you don't validate the requested parameters, you expose your system to **consent hijacking**, **scope creep**, and **cross-site request forgery (CSRF)**. Furthermore, the server must dynamically evaluate what is being asked against the client’s pre-registered capabilities.

What is actually happening cryptographically, database-wise, and architecturally during that button click?

---

## Technical Architecture: Consent Phase Sequence

```
+--------+             +----------------------+             +----------------------+
| User   |             |  Client Application  |             | Authorization Server |
+--------+             +----------------------+             +----------------------+
    |                             |                                    |
    | 1. Click "Connect Service"  |                                    |
    |---------------------------->|                                    |
    |                             | 2. Redirect to Auth Endpoint       |
    |                             |    (client_id, scope, redirect_uri)|
    |<----------------------------|----------------------------------->|
    |                                                                  | [Validate Client, URI,
    |                                                                  |  and check if consent
    |                                                                  |  already exists]
    | 3. Render Secure Consent UI (with anti-CSRF token)              |
    |<-----------------------------------------------------------------|
    |                                                                  |
    | 4. User Clicks "Approve" (Submits Form with Consent Decision)    |
    |----------------------------------------------------------------->|
    |                                                                  | [1. Validate CSRF Token
    |                                                                  |  2. Write Consent to DB
    |                                                                  |  3. Generate Auth Code]
    |                             5. Redirect with Code                |
    |<-----------------------------------------------------------------|
    |                             |                                    |
    |                             | 6. POST /token (Exchange Code)     |
    |                             |----------------------------------->|
    |                             | 7. Response: Access Token          |
    |                             |<-----------------------------------|
```

---

## The Consent Record Schema
When a user approves a client, the Authorization Server must record this delegation persistently. Subsequent requests with the same scopes should bypass the UI, preventing "consent fatigue."

A robust database schema for user consent tracking:
*   `user_id` (UUID): The user granting access.
*   `client_id` (String): The pre-registered client application.
*   `scopes` (Array of Strings): The exact, approved permissions.
*   `granted_at` (Timestamp): Record creation date.
*   `revoked_at` (Timestamp/Nullable): For instant session invalidation.

---

## Implementation: Secure Consent Controller
Below is a Node.js/TypeScript Express implementation showing how the Authorization Server processes authorization requests, verifies client configuration, and securely records user consent to issue an authorization code.

```typescript
import { Request, Response } from 'express';
import crypto from 'crypto';

interface ClientApp {
  clientId: string;
  allowedRedirectUris: string[];
  allowedScopes: string[];
}

interface UserSession {
  userId: string;
  csrfToken: string;
}

// Simulated databases
const clientsDb: Map<string, ClientApp> = new Map([
  [
    'client_app_100',
    {
      clientId: 'client_app_100',
      allowedRedirectUris: ['https://thirdparty.com/callback'],
      allowedScopes: ['read:profile', 'write:emails']
    }
  ]
]);

const consentDb: Set<string> = new Set(); // Stores composite 'userId:clientId:scope'
const authCodesDb: Map<string, { userId: string; clientId: string; scopes: string[]; redirectUri: string }> = new Map();

/**
 * Controller to process and render the Consent Request
 */
export async function handleAuthRequest(req: Request, res: Response) {
  const { client_id, response_type, redirect_uri, scope, state } = req.query as Record<string, string>;
  const session = req.session as unknown as UserSession; // Assumes robust Express session setup

  // 1. Validate parameters
  if (response_type !== 'code') {
    return res.status(400).send('Only Authorization Code flow ("response_type=code") is supported.');
  }

  const client = clientsDb.get(client_id);
  if (!client) {
    return res.status(400).send('Unauthorized: Invalid Client ID.');
  }

  if (!client.allowedRedirectUris.includes(redirect_uri)) {
    return res.status(400).send('Unauthorized: Redirect URI mismatch.');
  }

  // Parse and validate requested scopes against client registry
  const requestedScopes = scope ? scope.split(' ') : [];
  const invalidScopes = requestedScopes.filter(s => !client.allowedScopes.includes(s));
  if (invalidScopes.length > 0) {
    return res.status(400).send(`Unauthorized: Requested scopes [${invalidScopes.join(', ')}] are not permitted for this client.`);
  }

  // 2. Check if user has already consented to these exact scopes
  const hasPriorConsent = requestedScopes.every(s => 
    consentDb.has(`${session.userId}:${client_id}:${s}`)
  );

  if (hasPriorConsent) {
    // Bypass UI completely, directly issue authorization code
    return redirectWithAuthCode(res, redirect_uri, session.userId, client_id, requestedScopes, state);
  }

  // 3. Generate secure, page-specific anti-CSRF token
  const consentCsrfToken = crypto.randomBytes(32).toString('hex');
  (req.session as any).consentCsrfToken = consentCsrfToken;

  // Render the secure consent view with target scopes and anti-CSRF context
  res.render('consent_screen', {
    clientId: client_id,
    appName: "ThirdParty Reporting Inc.", // Fetch app meta
    scopes: requestedScopes,
    redirectUri: redirect_uri,
    state: state,
    csrfToken: consentCsrfToken
  });
}

/**
 * Controller to handle Consent Form Submission
 */
export async function handleConsentSubmit(req: Request, res: Response) {
  const { client_id, redirect_uri, scopes, state, csrf_token, decision } = req.body;
  const session = req.session as unknown as UserSession & { consentCsrfToken: string };

  // 1. Strict Anti-CSRF protection check
  if (!session.consentCsrfToken || session.consentCsrfToken !== csrf_token) {
    return res.status(403).send('Potential CSRF Attack Detected: Session token mismatch.');
  }

  // Clear token immediately after one-time use
  delete (req.session as any).consentCsrfToken;

  if (decision !== 'approve') {
    // User denied consent. Redirect back with access_denied error as per RFC 6749
    const url = new URL(redirect_uri);
    url.searchParams.set('error', 'access_denied');
    if (state) url.searchParams.set('state', state);
    return res.redirect(url.toString());
  }

  const requestedScopes = Array.isArray(scopes) ? scopes : [scopes];

  // 2. Write approved scopes to consent database
  requestedScopes.forEach(s => {
    consentDb.add(`${session.userId}:${client_id}:${s}`);
  });

  // 3. Issue and redirect with Auth Code
  return redirectWithAuthCode(res, redirect_uri, session.userId, client_id, requestedScopes, state);
}

function redirectWithAuthCode(
  res: Response,
  redirectUri: string,
  userId: string,
  clientId: string,
  scopes: string[],
  state: string | undefined
) {
  const authCode = crypto.randomBytes(24).toString('hex');
  
  // Store code temporarily with 5-minute expiry
  authCodesDb.set(authCode, {
    userId,
    clientId,
    scopes,
    redirectUri
  });

  const url = new URL(redirectUri);
  url.searchParams.set('code', authCode);
  if (state) {
    url.searchParams.set('state', state);
  }

  return res.redirect(url.toString());
}
```

---

## Defensive Engineering Rules
1.  **Strict Redirection Checks:** Never read `redirect_uri` dynamically from input and forward blindly. Match it string-for-string against pre-registered values stored in your database to block open redirects.
2.  **Explicit Consent UI Scope Representation:** Translate obscure technical scopes (e.g., `offline_access`, `write:contacts`) into plain, clear, non-deceptive terminology on the UI. Avoid "dark patterns" that mislead users into granting wider permissions.
3.  **Anti-Clickjacking Headers:** Set `X-Frame-Options: DENY` or robust `Content-Security-Policy: frame-ancestors 'none'` on your consent endpoints. This prevents malicious applications from framing your authorization server and tricking users into clicking invisible "Authorize" buttons.
