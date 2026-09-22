---
title: "Broken Access Control: Why UI Filters Don't Protect API Endpoints"
description: "Why hiding buttons in React/Vue/Angular is cosmetic, not security, and how to build server-side RBAC and ABAC (resource-ownership) middleware that closes the real gap attackers hit with curl and Postman."
categorySlug: "appsec-threats"
articleType: "GUIDE"
tags:
  - "broken-access-control"
  - "rbac"
  - "abac"
  - "owasp-top-10"
  - "authorization"
  - "api-security"
---

# Broken Access Control: Why UI Filters Don't Protect API Endpoints

Broken Access Control routinely ranks as the number one risk in the OWASP Top 10. A primary driver of this trend is the modern separation of concern between frontend client applications (React, Angular, Vue) and stateless backend APIs. Developers frequently fall into the trap of implementing access controls in the presentation layer — hiding buttons, disabling links, protecting UI routes — while leaving the raw API endpoints wide open.

---

## The Problem: The Illusion of Frontend Security

In single-page applications, security is often treated as an aesthetic concern. A developer might write logic that hides the "Delete User" button if the current user's role is not `ADMIN`:

```javascript
// AESTHETIC SECURITY IN THE FRONTEND — NOT A SECURITY CONTROL
{user.role === 'ADMIN' && (
    <button onClick={deleteUser}>Delete User Account</button>
)}
```

This code successfully prevents a non-admin user from *seeing* the button. However, the underlying functionality depends on a network call to a backend API (e.g., `DELETE /api/users/:id`). If the backend does not independently verify that the requester is an authorized administrator, the system is fundamentally broken.

Frontend applications execute entirely inside the client's browser, which is an untrusted environment. An attacker can inspect the JavaScript bundle, map out the API structure, and use command-line utilities (`curl`) or intercepting proxies (Burp Suite) to execute requests directly against the API, completely bypassing the UI.

```text
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

Consider an Express.js backend route designed to handle administrative configuration:

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

## Robust Mitigation: Server-Side RBAC + ABAC Gatekeeping

To eliminate Broken Access Control, treat every incoming request as potentially hostile. Authorization checks must run on the server, immediately after authentication and before any business logic or database query. Two complementary models are needed:

* **RBAC (Role-Based Access Control):** Does this user's *role* have the baseline permission this endpoint requires?
* **ABAC (Attribute-Based Access Control):** Even if the role qualifies, does this user have the specific *relationship* (e.g., ownership) to the specific resource being acted on? RBAC alone stops a `USER` from calling an admin-only route, but it does **not** stop `USER A` from editing `USER B`'s own record if both share the `USER` role — that gap is BOLA (Broken Object Level Authorization), and closing it requires an ABAC ownership check layered on top of RBAC.

```text
[ Incoming API Call ]
          |
          v
   [ Gateway Token Verification ] (JWT / OAuth2 Validation -> Extract Claims)
          |
          v
   [ RBAC Gate ] ── Does role have base permission (e.g., PROJECT_EDIT)?
          |                No ──► 403 Forbidden
          v Yes
   [ ABAC Gate ] ── Does req.user.id own/relate to the target resource?
          |                No ──► 403 Forbidden (or SUPER_ADMIN bypass)
          v Yes
   [ Business Handler ] ── Executes the state change
```

### Production-Ready Authorization Middleware (Node.js/Express)

```javascript
// --- Mock Database / Data Tier ---
const projectsDatabase = {
    'proj-901': { id: 'proj-901', ownerId: 'usr-501', status: 'DRAFT', title: 'Q1 Budget Plan' },
    'proj-902': { id: 'proj-902', ownerId: 'usr-999', status: 'COMPLETED', title: 'System Secrets' }
};

/**
 * RBAC Middleware: Verifies the user has the baseline structural permission required.
 */
const requirePermission = (requiredPermission) => {
    return (req, res, next) => {
        if (!req.user || !req.user.permissions.includes(requiredPermission)) {
            console.warn(`[BAC ALERT] RBAC bypass attempt: User ${req.user?.id || 'ANONYMOUS'} lacks permission '${requiredPermission}'`);
            return res.status(403).json({ error: 'Access Denied: Insufficient authorization' });
        }
        next();
    };
};

/**
 * ABAC Middleware: Contextually checks resource ownership (attribute relationship).
 * This is the layer that stops BOLA — RBAC alone would let any 'USER' role through.
 */
const enforceProjectOwnership = async (req, res, next) => {
    const projectId = req.params.projectId;
    const project = projectsDatabase[projectId];

    if (!project) {
        return res.status(404).json({ error: 'Resource not found' });
    }

    // Attach project instance to request context to avoid redundant database hits downstream
    req.resourceContext = { project };

    // SUPER_ADMIN role bypasses ownership constraint checks
    if (req.user.role === 'SUPER_ADMIN') {
        return next();
    }

    // Explicit attribute-based check: the user ID MUST match the owner ID of the object
    if (project.ownerId !== req.user.id) {
        console.error(
            `[BAC ALERT] Authorization Breach Attempt: User ${req.user.id} ` +
            `attempted unauthorized access to Project ${projectId} (owned by ${project.ownerId})`
        );
        // Fail securely: return a generic 403 to avoid exposing resource existence
        return res.status(403).json({ error: 'Access Denied: Resource ownership validation failed' });
    }

    next();
};

// --- API Router Enforcing Multi-Layered Server-Side Validation ---
app.patch(
    '/api/v1/projects/:projectId',
    authenticateToken,
    requirePermission('PROJECT_EDIT'),      // Layer 1: RBAC permission check
    enforceProjectOwnership,                // Layer 2: ABAC attribute/ownership check
    (req, res) => {
        const project = req.resourceContext.project;

        project.title = req.body.title || project.title;
        project.status = req.body.status || project.status;

        res.status(200).json({
            status: 'success',
            message: 'Project updated successfully',
            data: project
        });
    }
);
```

### Declarative Variant (TypeScript)

For codebases with many routes, encoding the RBAC/ABAC decision as data (rather than repeating middleware chains) keeps policies auditable in one place:

```typescript
export interface AccessPolicy {
    roles: string[];
    allowOwner?: boolean;
    resourceField?: string; // Payload field carrying the target resource's owner ID
}

export function authorize(policy: AccessPolicy) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const user = req.user;
        if (!user) {
            res.status(401).json({ error: 'Unauthorized: Authentication required.' });
            return;
        }

        // RBAC: role alone satisfies the policy
        if (policy.roles.includes(user.role)) {
            next();
            return;
        }

        // ABAC: otherwise, ownership can satisfy it
        if (policy.allowOwner && policy.resourceField) {
            const targetOwnerId = req.params[policy.resourceField] ||
                                  req.query[policy.resourceField] ||
                                  req.body[policy.resourceField];

            if (targetOwnerId && user.id === String(targetOwnerId)) {
                next();
                return;
            }
        }

        res.status(403).json({
            error: 'Forbidden: You do not possess adequate permissions to perform this action.'
        });
    };
}

// Endpoint 1: Pure RBAC — admin only
router.get('/api/admin/metrics', authorize({ roles: ['ADMIN'] }), (req, res) => {
    res.json({ systemStatus: "HEALTHY" });
});

// Endpoint 2: Contextual ABAC — managers can read anyone, or users can read only their own record
router.get('/api/user/:userId/profile', authorize({
    roles: ['ADMIN', 'MANAGER'],
    allowOwner: true,
    resourceField: 'userId'
}), (req, res) => {
    res.json({ message: "Profile details loaded securely." });
});
```

---

## Architectural Protections

1. **Deny by Default:** Configure your router with a default "deny all" policy. Only when a developer explicitly applies an access policy should an endpoint become reachable — this prevents newly added routes from being accidentally exposed.
2. **Never Trust Client-Side Claims:** The server must independently verify JWT signatures and evaluate permissions on every incoming request; the client's UI state is not evidence of authorization.
3. **Stateless Claims (JWTs):** Embed permission/role claims directly within a cryptographically signed JWT verified with a strong algorithm (e.g., RS256) before extracting them.
4. **Automated Access-Matrix Testing:** Write integration tests that simulate low-privileged users and "wrong owner" users hitting protected/other-owned endpoints, asserting they consistently receive `403 Forbidden`.
