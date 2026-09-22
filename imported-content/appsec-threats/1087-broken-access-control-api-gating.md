# Broken Access Control: Bypassing UI Security Filters on API Endpoints

## The Problem: The Client-Server Security Illusion

Modern Single Page Applications (SPAs) built with frameworks like React, Angular, or Vue offer fluid user interfaces. To enforce privilege levels, front-end developers typically use client-side router guards, hide UI elements (like "Delete User" buttons) based on the user's role, and filter views dynamically.

The critical security failure occurs when developers assume that securing the *user interface* equates to securing the *application*. Under the hood, the SPA communicates with the backend via stateless REST or GraphQL API endpoints. An attacker does not need to use the provided web UI. They can bypass UI-level routing checks entirely by intercepting network traffic and transmitting crafted HTTP requests directly to backend endpoints using tools like `Postman`, `curl`, or custom intercepting proxies (like `Burp Suite`). If the backend endpoints do not perform independent, server-side authorization checks on *every* single incoming request, an ordinary user can escalate privileges and execute administrative functions.

## Architectural Flaw: Front-end Authorization Gating

The primary architectural flaw is "security-through-obscurity" at the presentation layer, where the API trust boundary is erroneously extended to the client's browser.

```text
Vulnerable Architecture:
[ Admin Portal UI ] (Hides "/admin" path from low-privilege users)
      |
      +---> [ Low-Privilege Attacker ] ---> (Bypasses UI, issues direct REST query)
                                                 |
                                                 v
                                    [ GET /api/v1/admin/financials ]
                                                 |
                                                 v
                                    [ Backend Endpoint ] ---> (Executes! No server-side role check)
```

The server-side API must operate on a zero-trust model regarding client-side assertions. Every API endpoint must independently verify both:
1.  **Authentication:** Who is making the request? (Verified via session cookies or cryptographically signed JWTs).
2.  **Authorization:** Does this authenticated identity have permission to perform this specific action on this specific resource?

## Exploit Mechanics: Endpoint Guessing and Verb Tampering

### 1. Endpoint Enumeration
Attackers analyze the bundled JavaScript source map files loaded by the browser. By searching for path prefixes (like `/api/v1`), they can compile a comprehensive map of hidden endpoints, including administrative routes (e.g., `/api/v1/users/delete/:id`).

### 2. Parameter and Verb Tampering
If an endpoint validates authorization but relies on client-supplied parameters to determine context, attackers manipulate those parameters:
*   **Method Tampering:** Bypassing restrictions by changing the request verb (e.g., sending `POST` or `PUT` to an endpoint that only blocks unauthorized `GET` requests).
*   **Parameter Pollution:** Appending multiple parameters to alter target IDs (e.g., `/api/v1/payments?userId=123&userId=456`).

## Implementing Robust API Authorization Gating

To secure an API, we must decouple authorization from the UI and enforce authorization policies directly within the server-side routing layer. This is achieved using middleware patterns that combine Role-Based Access Control (RBAC) with Attribute-Based Access Control (ABAC) to enforce resource-level ownership.

Below is a robust Node.js/Express implementation demonstrating secure, layered authorization middleware:

```javascript
// authMiddleware.js
const jwt = require('jsonwebtoken');

// Secret key for JWT verification (stored in environment variables in production)
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_high_entropy_12345';

// Define explicit system roles
const ROLES = {
    ADMIN: 'admin',
    MANAGER: 'manager',
    USER: 'user'
};

class AuthGate {

    // Middleware 1: Enforce valid authentication
    static authenticate(req, res, next) {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Access denied. Missing bearer token.' });
        }

        const token = authHeader.split(' ')[1];

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            // Attach resolved user identity context to the request object
            req.user = decoded; 
            next();
        } catch (err) {
            return res.status(403).json({ error: 'Access denied. Invalid or expired token.' });
        }
    }

    // Middleware 2: Role-Based Access Control (RBAC) Gating
    static requireRole(allowedRoles) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(500).json({ error: 'Auth context missing. Authenticate middleware must be called first.' });
            }

            if (!allowedRoles.includes(req.user.role)) {
                return res.status(403).json({ error: `Forbidden: Requires role [${allowedRoles.join(', ')}]` });
            }

            next();
        };
    }

    // Middleware 3: Attribute-Based Access Control (ABAC) / Ownership Gating
    // Ensures users can only access their own documents unless they are an admin
    static requireOwnershipOrAdmin(req, res, next) {
        if (!req.user) {
            return res.status(500).json({ error: 'Auth context missing.' });
        }

        const requestedResourceId = req.params.userId; // Assuming route parameter is /api/users/:userId
        const currentUserId = req.user.id;
        const currentUserRole = req.user.role;

        // Bypass ownership constraint if the caller is an administrator
        if (currentUserRole === ROLES.ADMIN) {
            return next();
        }

        // Strictly match logged-in user ID with the target resource identity
        if (currentUserId !== requestedResourceId) {
            return res.status(403).json({ error: 'Forbidden: You do not own this resource.' });
        }

        next();
    }
}

module.exports = { AuthGate, ROLES };
```

### Applying Gates to Secure Endpoints

```javascript
// routes.js
const express = require('express');
const { AuthGate, ROLES } = require('./authMiddleware');
const router = express.Router();

// Mock Handlers
const userController = {
    getUserProfile: (req, res) => res.status(200).json({ msg: `Profile for ${req.params.userId}` }),
    deleteUser: (req, res) => res.status(200).json({ msg: `Deleted user ${req.params.userId}` }),
    getSystemHealth: (req, res) => res.status(200).json({ status: 'OK' })
};

// 1. Secure standard route with Authentication + Ownership validation (ABAC)
router.get('/api/v1/users/:userId/profile',
    AuthGate.authenticate,
    AuthGate.requireOwnershipOrAdmin,
    userController.getUserProfile
);

// 2. Secure highly privileged route with Authentication + Strict Role check (RBAC)
router.delete('/api/v1/users/:userId',
    AuthGate.authenticate,
    AuthGate.requireRole([ROLES.ADMIN]),
    userController.deleteUser
);

// 3. System-wide admin endpoint
router.get('/api/v1/admin/health',
    AuthGate.authenticate,
    AuthGate.requireRole([ROLES.ADMIN, ROLES.MANAGER]),
    userController.getSystemHealth
);

module.exports = router;
```

## Hardening Strategies

*   **Deny-by-Default:** Implement routing frameworks that default to blocking all routes. Explicitly opt routes into public exposure, rather than opting routes into security checks.
*   **Integrate Automated API Fuzzing:** Run automated scanners (e.g., OWASP ZAP or specialized API scanners) as part of CI/CD pipelines to attempt to hit API paths with varying, unauthorized authentication headers.

## Conclusion

Broken access control is a highly critical threat that arises when security checks are delegated to client presentation layers. Hiding UI elements or pathing endpoints in obscure directories cannot deter a motivated adversary. Web APIs must enforce a stateless, zero-trust execution posture. By securing every backend endpoint with server-side authentication gates and explicit RBAC/ABAC ownership checks, systems remain resilient against UI bypass, endpoint guessing, and unauthorized escalation.
