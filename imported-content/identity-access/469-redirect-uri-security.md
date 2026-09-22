# Redirect URI Security in OAuth 2.0: Preventing Authorization Code Exfiltration

## The Problem: The Wildcard Exfiltration Vulnerability
In the OAuth 2.0 Authorization Code Flow, the **Redirect URI** is the critical parameter that dictates where the Authorization Server sends the single-use Authorization Code after a user authenticates. 

Because of configuration complexity in corporate systems (where developers might deploy to multiple staging, preview, or development ports), team members often implement **lax Redirect URI validation algorithms** on the Authorization Server. Classic mistakes include:
1.  **Wildcard Subdomain Matching:** Allowing `https://*.company.com/callback`.
2.  **Regex Partial Matching:** Allowing any URI that *contains* `company.com/callback` (e.g., `https://attacker-company.com/callback`).
3.  **Path Traversal Vulnerabilities:** Allowing `https://company.com/callback/../../open-redirect?url=http://attacker.com`.

If an attacker can trick the Authorization Server into accepting a redirect destination under their control (either directly or via an open redirector page on the victim's domain), **the browser will deliver the Authorization Code directly to the attacker's server.** The attacker can then exchange this stolen code for high-privilege Access and Refresh tokens, fully compromising the user's account.

---

## Technical Architectures: Code Exfiltration Flow

### The Attack Vector (Lax Wildcard/Regex Validation)
The Authorization Server is configured to match redirect URIs loosely.

```
Client App (Attacker Modified Link)                              Authorization Server
        |                                                                |
        | 1. GET /authorize?client_id=123                                |
        |    &redirect_uri=https://company.com/oauth/../../attacker.com  |
        |--------------------------------------------------------------->|
        |                                                                | (Server checks: does it start
        |                                                                |  with https://company.com? Yes.
        |                                                                |  Permits the authorization.)
        |                                                                |
        |                                                                | [User Authenticates & Consents]
        |                                                                |
        | 2. Redirect: 302 Found                                         |
        |    Location: https://company.com/oauth/../../attacker.com?code=XYZ
        |<---------------------------------------------------------------|
        |
        v (Browser normalizes path and follows redirect)
   https://attacker.com?code=XYZ (Code Delivered to Attacker!)
```

---

## Technical URI Vulnerability Comparison

| Validation Pattern | Configured Allowed URI | Attack Input URI | Result | Vulnerability Detail |
| :--- | :--- | :--- | :--- | :--- |
| **Wildcard Subdomain** | `https://*.company.com` | `https://attacker.company.com` | **EXPLOITED** | Attacker registers a free hosting account on a shared corporate subdomain. |
| **Partial String** | `company.com` | `https://attacker-company.com` | **EXPLOITED** | Simple substring match succeeds because domain names overlap. |
| **Path Traversal** | `https://company.com/oauth` | `https://company.com/oauth/../dev/blog` | **EXPLOITED** | Path traversal directory navigation leads to an unmonitored part of the site. |
| **Exact String Match** | `https://company.com/oauth` | `https://company.com/oauth/../dev/blog` | **BLOCKED** | Server rejects the string instantly because characters do not match exactly. |

---

## Implementation: Strict Redirect URI Matcher Engine
Below is a highly robust TypeScript implementation for an Authorization Server that performs absolute, secure validation of Redirect URIs. It blocks wildcard exploits, path traversal attacks, and port manipulation tricks.

```typescript
import { URL } from 'url';

interface ClientRegistration {
  clientId: string;
  allowedRedirectUris: string[]; // Absolute, exact string representations
}

const clientDb: Map<string, ClientRegistration> = new Map([
  [
    'client_app_abc',
    {
      clientId: 'client_app_abc',
      allowedRedirectUris: [
        'https://app.company.com/oauth/callback',
        'https://api-sandbox.company.com/v1/callback'
      ]
    }
  ]
]);

/**
 * Validates the incoming redirect_uri against the client's registered list.
 * STRICT: No wildcards, no query parameter stripping, no port manipulation, absolute match.
 */
export function validateRedirectUri(clientId: string, incomingUriString: string): boolean {
  const registration = clientDb.get(clientId);
  if (!registration) {
    return false;
  }

  // Prevent URL parser trickery by verifying we have a valid absolute URL layout
  let incomingUrl: URL;
  try {
    incomingUrl = new URL(incomingUriString);
  } catch (err) {
    return false; // Malformed URL input
  }

  // Enforce HTTPS in production environments (permit localhost only in strict dev configurations)
  if (incomingUrl.protocol !== 'https:' && incomingUrl.hostname !== 'localhost') {
    return false;
  }

  // Exact Match Check (RFC 8252 & OAuth 2.1 Security Best Practices requirement)
  const isExactMatch = registration.allowedRedirectUris.includes(incomingUriString);
  if (!isExactMatch) {
    return false;
  }

  // DEFENSIVE DEPTH: Even if exact match is found, verify parsing properties to block directory traversal or parser bugs
  const hasDirectoryTraversal = incomingUriString.includes('/..') || incomingUriString.includes('../');
  if (hasDirectoryTraversal) {
    return false;
  }

  // Block parameter hijacking: Verify that the parser doesn't resolve attributes differently from raw string checks
  const pathParts = incomingUrl.pathname.split('/');
  if (pathParts.includes('..') || pathParts.includes('.')) {
    return false; // Path navigation characters detected
  }

  return true;
}
```

## Defensive Architecture Rules
1.  **Exact Match Only:** Do not implement "intelligent" string matching, prefix matching, or glob matching under any circumstances. Require clients to register every single callback URL down to the exact path and parameters.
2.  **Block Query Parameter Appending:** Do not allow clients to send dynamic query parameters *inside* the `redirect_uri` parameter (e.g., `redirect_uri=https://myclient.com/callback?userId=123`). Instead, enforce the use of the standard **`state`** parameter to pass application context securely in an encrypted or signed format.
3.  **Localhost Loopback Restrictions:** For native apps that must run on dynamic loopback ports (localhost), authorize only the exact localhost IP addresses (`127.0.0.1` or `::1`) instead of the string domain `localhost`. Keep the path strict and ensure the port validation logic allows port variation *only* if the client is explicitly verified as a native desktop or mobile application.
