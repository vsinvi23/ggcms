# Broken Access Control: Bypassing UI Security Filters on API Endpoints

## The Problem

A prevalent architectural flaw in modern Single Page Applications (SPAs) built with React, Vue, or Angular is the complete reliance on "client-side UI gating" to enforce authorization. Developers often hide buttons, links, or navigation items depending on a user's role:

```javascript
// A typical client-side security flaw
{user.role === 'ADMIN' && <button onClick={deleteUser}>Delete User</button>}
```

While this creates an optimal User Experience (UX), it is strictly a UI presentation feature, **not** a security mechanism. 

An attacker can easily inspect the SPA’s client bundle, find the backend API endpoints (e.g., `/api/v1/users/delete/1042`), and trigger requests directly using tools like Postman, curl, or browser developer consoles. If the backend API endpoint expects that "if the user has the endpoint URL, they must be authorized," the attacker gains immediate privilege escalation.

Security must be enforced at the API gateway or endpoint tier, treating all incoming request parameters, user headers, and routing paths as completely untrusted.

---

## Technical Authorization Gating Architecture

Authorization must run in the backend context as a centralized gatekeeper pattern.

### Gateway ABAC Middleware
```
[ Incoming API Call ]
          │
          ▼
   [ Gateway Token Verification ] (JWT / OAuth2 Validation -> Extract Claims)
          │
          ▼
   [ ABAC / RBAC Security Gate ] ──► (Policy Engine)
          │                              ├── Verify User Roles & Permissions
          │                              └── Verify Resource Ownership (Does user own ID?)
          ├──► ALLOWED?
          │       ├──► YES: Forward to Business Handler
          │       └──► NO:  Return 403 Forbidden (Halt execution!)
```

---

## Secure Implementation: Declarative ABAC Middleware

Below is a complete, production-grade Node.js/TypeScript Express middleware implementing an Attribute-Based Access Control (ABAC) matrix that checks both roles and contextual resource ownership to prevent BOLA (Broken Object Level Authorization) and privilege escalation.

```typescript
import { Request, Response, NextFunction } from 'express';

export interface SecurityUser {
    id: string;
    role: 'ADMIN' | 'MANAGER' | 'USER';
    tenantId: string;
}

// Extend Express Request declaration to carry authenticated security context
declare global {
    namespace Express {
        interface Request {
            user?: SecurityUser;
        }
    }
}

/**
 * Access Control Policy definition
 */
export interface AccessPolicy {
    roles: string[];
    allowOwner?: boolean;
    resourceField?: string; // Payload field containing the target resource ID (e.g., 'ownerId' or 'id')
}

/**
 * Centralized Authorization Middleware Factory.
 * Enforces declarative security controls on backend endpoints.
 */
export function authorize(policy: AccessPolicy) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const user = req.user;

        // 1. Authenticity Guard
        if (!user) {
            res.status(401).json({ error: 'Unauthorized: Authentication required.' });
            return;
        }

        // 2. Role-Based Access Control Check (RBAC)
        if (policy.roles.includes(user.role)) {
            next();
            return;
        }

        // 3. Attribute-Based Contextual Check (Ownership / ABAC)
        if (policy.allowOwner && policy.resourceField) {
            // Retrieve target owner ID from request parameters, query, or body
            const targetOwnerId = req.params[policy.resourceField] || 
                                  req.query[policy.resourceField] || 
                                  req.body[policy.resourceField];

            // If the user's ID matches the target resource owner ID, authorize access
            if (targetOwnerId && user.id === String(targetOwnerId)) {
                next();
                return;
            }
        }

        // Default: Access Denied
        res.status(403).json({ 
            error: 'Forbidden: You do not possess adequate permissions to perform this action.' 
        });
    };
}
```

### Applying the Guard Declaratively in Routes

```typescript
import { Router } from 'express';

const router = Router();

// Endpoint 1: Pure RBAC - Admin Only
router.get('/api/admin/metrics', authorize({ roles: ['ADMIN'] }), (req, res) => {
    res.json({ systemStatus: "HEALTHY" });
});

// Endpoint 2: Contextual ABAC - Managers can read, or users can read ONLY their own records
router.get('/api/user/:userId/profile', authorize({ 
    roles: ['ADMIN', 'MANAGER'], 
    allowOwner: true, 
    resourceField: 'userId' 
}), (req, res) => {
    res.json({ message: "Profile details loaded securely." });
});
```

---

## Architectural Mitigation Checklist

1. **Adopt Zero-Trust Backend Controls**: Never write backend business logic that accepts incoming operations blindly. Every single request must route through a security verification layer.
2. **Deny-by-Default Configuration**: Configure your security router with a default "Deny All" policy. Only when a developer explicitly applies an access policy to an endpoint should access be permitted. This prevents newly created API endpoints from being accidentally exposed to unauthenticated users.
