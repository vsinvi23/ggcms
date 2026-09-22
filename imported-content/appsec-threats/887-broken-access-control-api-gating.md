# Broken Access Control: Bypassing UI Security Filters on API Endpoints

## The Problem: The "Hidden Button" Fallacy

Broken Access Control consistently ranks as the #1 vulnerability on the OWASP Top 10. The most prevalent manifestation of this flaw is a misalignment between User Interface (UI) restrictions and Backend API enforcement. 

Developers often implement complex state logic in the frontend (React/Angular) to hide "Delete," "Edit," or "Admin" buttons based on a user's role. However, they fail to replicate this exact ownership and role verification on the corresponding backend API endpoint. 

An attacker ignores the UI entirely, intercepts the network traffic, and sends a direct `POST` or `DELETE` request to the API using their standard, unprivileged user token. If the API only checks that the user is *authenticated* (logged in) but fails to check if they are *authorized* (own the resource or hold the correct role), the attack succeeds. This is known as Broken Object Level Authorization (BOLA) or Broken Function Level Authorization (BFLA).

## The Mechanics: BOLA vs BFLA

- **BOLA (Broken Object Level Authorization):** User A modifies User B's resource. E.g., `PUT /api/orders/999` (where 999 belongs to someone else).
- **BFLA (Broken Function Level Authorization):** User A accesses an administrative endpoint. E.g., `POST /api/admin/create_user`.

### ASCII Architecture: The BOLA Bypass Flow

```text
[ Attacker (User ID: 12) ] --- (Browser hides "Edit Order 55" button)
             |
             v
(Intercepts Traffic via Burp Suite)
             |
             v
[ PUT /api/orders/55 ] 
Header: Authorization: Bearer <User_12_Token>
             |
             v
[ API Gateway / Backend ]
 1. Check Token Valid? YES.
 2. Check Role? (Fails to check if User 12 owns Order 55)
 3. Execute DB Update.
             |
             v
[ Database: Order 55 Modified ] <--- (SUCCESSFUL EXPLOIT)
```

## Implementation: Zero-Trust API Endpoints

To defeat Broken Access Control, you must adopt a **Zero-Trust** approach at the API controller level. Every single endpoint that modifies or accesses data must independently verify:
1. **Who is asking?** (Authentication - JWT/Session verification)
2. **What are they asking for?** (Object identification)
3. **Are they allowed to do this?** (Authorization - Ownership or Role verification)

### Robust Code: Express.js Middleware for Object-Level Authorization

Do not embed authorization logic deep within database queries or scattered throughout services. Centralize it using middleware or higher-order functions. 

Here is a robust Node.js/Express implementation that guarantees object-level ownership before allowing an update.

```javascript
const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * Authentication Middleware: Verifies the JWT and attaches the user to the request.
 */
const requireAuth = (req, res, next) => {
    const user = verifyToken(req.headers.authorization);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    
    req.user = user; // e.g., { id: 12, role: 'user' }
    next();
};

/**
 * Authorization Middleware: Verifies the requester OWNS the specific resource.
 */
const requireResourceOwnership = (resourceType) => {
    return async (req, res, next) => {
        const resourceId = req.params.id;
        
        try {
            // 1. Fetch the resource metadata to determine ownership
            const resource = await db.query(
                `SELECT owner_id FROM ${resourceType} WHERE id = $1`, 
                [resourceId]
            );

            if (!resource) {
                return res.status(404).json({ error: "Resource not found" });
            }

            // 2. The Core Defense: Enforce Ownership OR Admin Override
            if (resource.owner_id !== req.user.id && req.user.role !== 'admin') {
                // Log this actively: It indicates an ongoing BOLA attack
                console.warn(`SECURITY: User ${req.user.id} attempted BOLA on ${resourceType}:${resourceId}`);
                return res.status(403).json({ error: "Forbidden: You do not own this resource" });
            }

            // 3. Authorized
            next();
        } catch (err) {
            return res.status(500).json({ error: "Internal Error" });
        }
    };
};

// --- Secure Route Configuration ---

// An attacker hitting this directly with another user's ID will be blocked by `requireResourceOwnership`
router.put('/api/orders/:id', 
    requireAuth, 
    requireResourceOwnership('orders'), 
    async (req, res) => {
        // Safe to execute update; ownership is cryptographically guaranteed
        await db.query(`UPDATE orders SET status = $1 WHERE id = $2`, [req.body.status, req.params.id]);
        res.json({ success: true });
    }
);
```

## Conclusion

The UI is a convenience layer, not a security boundary. By assuming that all HTTP requests are actively forged by malicious actors, and by enforcing strict cryptographic verification of ownership at the highest level of your API routing, you systematically eradicate Broken Access Control vulnerabilities.
