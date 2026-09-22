# Broken Access Control: Bypassing UI Filters to Hit API Endpoints

Broken Access Control routinely ranks as the number one risk in the OWASP Top 10. A primary driver of this trend is the modern separation of concern between frontend client applications (React, Angular, Vue) and stateless backend APIs. Developers frequently fall into the trap of implementing access controls in the presentation layer—hiding buttons, disabling links, and protecting UI routes—while leaving the raw API endpoints wide open.

---

## The Problem: The Illusion of Frontend Security

In single-page applications (SPAs), security is often treated as an aesthetic concern. A developer might write logic that hides the "Delete User" button if the current user's role is not `ADMIN`. 

```javascript
// AESTHETIC SECURITY IN THE FRONTEND
{user.role === 'ADMIN' && (
    <button onClick={deleteUser}>Delete User Account</button>
)}
```

This code successfully prevents a non-admin user from *seeing* the button. However, the underlying functionality depends on a network call to a backend API (e.g., `DELETE /api/users/:id`). 

If the backend does not independently verify that the requester is an authorized administrator, the system is fundamentally broken. Frontend applications execute entirely inside the client’s browser, which is an untrusted environment. An attacker can inspect the javascript bundle, map out the API structure, and use command-line utilities (like `curl`) or intercepting proxies (like Burp Suite) to execute requests directly against the API.

```
+--------------------+               +-----------------------+               +----------------------+
|  Attacker Browser  |               |  Client UI (React)    |               |  Backend Server API  |
+--------------------+               +-----------------------+               +----------------------+
          |                                      |                                       |
          |  1. Inspects JS source / bundles     |                                       |
          |=====================================>|                                       |
          |                                      |                                       |
          |  2. Discovers admin endpoint path:   |                                       |
          |     "DELETE /api/v1/users/:id"       |                                       |
          |<=====================================|                                       |
          |                                      |                                       |
          |  3. Bypasses React UI entirely and   |                                       |
          |     sends direct HTTP request        |                                       |
          |----------------------------------------------------------------=============>|
          |     DELETE /api/v1/users/99          |                               |       |
          |     Authorization: Bearer attacker-token                             |       |
          |                                                                      |  4. Backend deletes  |
          |                                                                      |     user 99 without  |
          |                                                                      |     role check!      |
          |                                                                      |<===================   |
          |  5. 200 OK (User Deleted)            |                               |                       |
          |<---------------------------------------------------------------------|                       |
```

---

## Vulnerable Code: The Trusting API Endpoint

Consider an Express.js backend route designed to handle administrative configurations:

```javascript
// VULNERABLE EXPRESS CONTROLLER
const express = require('express');
const app = express();

// A generic authentication middleware that extracts user details from a JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    // Assume jwt.verify validates signature and returns { userId: 42, role: "USER" }
    req.user = verifyToken(token); 
    next();
};

// VULNERABLE ENDPOINT: Authenticates identity but fails to authorize the role!
app.post('/api/v1/system/settings', authenticateToken, async (req, res) => {
    const { settings } = req.body;
    
    // CRITICAL FLAW: The endpoint trusts that because the request was sent, 
    // the user must have had permission to do so (relying on UI buttons being hidden).
    try {
        await updateSystemSettings(settings);
        return res.status(200).json({ message: "Settings updated successfully." });
    } catch (err) {
        return res.status(500).json({ error: "Database update failed." });
    }
});
```

### The Exploit Vector

The attacker logs in with a standard low-privileged account, receives their JWT, and crafts a direct API request bypass:

```bash
curl -X POST https://api.target-app.com/api/v1/system/settings \
  -H "Authorization: Bearer <low_privilege_user_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"settings": {"allow_public_registrations": true, "mfa_required": false}}'
```

Because the API verifies *who* the user is (authentication) but neglects to verify *what permissions* they have (authorization), the request succeeds.

---

## Robust Mitigation: Backend Role & Permission Gatekeeping

To eliminate Broken Access Control, you must treat every incoming request to an API endpoint as potentially hostile. Authorization checks must be executed on the server, immediately after authentication and before any business logic or database query runs.

The industry standard is to implement **RBAC (Role-Based Access Control)** or **ABAC (Attribute-Based Access Control)** middleware.

### Production-Ready Authorization Middleware (Node.js/Express)

Here is a secure implementation that implements defensive, scope-based permission checks at the middleware layer.

```javascript
// authz.middleware.js

/**
 * Middleware factory to restrict access based on user roles.
 * @param {string[]} allowedRoles - List of roles permitted to access the endpoint.
 */
const authorizeRoles = (allowedRoles) => {
    return (req, res, next) => {
        // Step 1: Ensure authentication middleware has already run and populated req.user
        if (!req.user) {
            return res.status(401).json({
                error: "Unauthorized",
                code: "USER_NOT_AUTHENTICATED",
                details: "Access denied. Authentication is required before authorization."
            });
        }

        const { role } = req.user;

        // Step 2: Validate the user's role against the permitted roles
        if (!allowedRoles.includes(role)) {
            // Log security event internally (avoid exfiltrating too much detail in client response)
            console.warn(`[SECURITY ALERT] Unauthorized access attempt: User ${req.user.id} with role '${role}' tried to access endpoint restricted to [${allowedRoles.join(', ')}].`);
            
            return res.status(403).json({
                error: "Forbidden",
                code: "INSUFFICIENT_PERMISSIONS",
                details: "You do not have the required permissions to perform this action."
            });
        }

        // Step 3: Complete authorization check successfully
        next();
    };
};

module.exports = { authorizeRoles };
```

### Securing the Endpoint

We apply the role gatekeeper directly to our routes:

```javascript
const express = require('express');
const { authenticateToken } = require('./auth.middleware');
const { authorizeRoles } = require('./authz.middleware');
const app = express();

// SECURE ENDPOINT: Multi-layered middleware execution
app.post(
    '/api/v1/system/settings',
    authenticateToken,                       // Layer 1: Authenticate identity
    authorizeRoles(['ADMIN', 'SUPER_ADMIN']), // Layer 2: Authorize specific roles
    async (req, res) => {
        const { settings } = req.body;
        try {
            await updateSystemSettings(settings);
            return res.status(200).json({ message: "Settings updated successfully." });
        } catch (err) {
            return res.status(500).json({ error: "System failure." });
        }
    }
);
```

---

## Architectural Protections

1. **Deny by Default:** Design your routing engine or API gateway to block all endpoints unless they are explicitly annotated as public.
2. **Stateless Claims (JWTs):** Embed permission claims or roles directly within a cryptographically signed JWT. Ensure the signature is verified using a strong algorithm (such as RS256) on every request before extracting these claims.
3. **Automated Integration Testing:** Write automated integration tests that simulate low-privileged users hitting administrative endpoints, asserting that they consistently receive HTTP `403 Forbidden` responses.
