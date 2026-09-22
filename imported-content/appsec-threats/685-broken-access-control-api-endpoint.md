# Broken Access Control: Bypassing UI Security Filters on API Endpoints

## The Problem: The Cosmetic Security Illusion
Modern single-page applications (React, Angular, Vue) decouple the presentation layer from the data layer. In many legacy or poorly designed architectures, developers implement authorization controls purely within the client-side user interface. For example, a React dashboard might hide the "Delete User" button or the "/admin/settings" route if the user's role is not set to `Admin`. 

This is cosmetic, not security. Threat actors do not interact with your application solely through your user interface. By inspecting networking tabs or reviewing client-side JavaScript bundles, attackers can easily identify raw REST or GraphQL endpoint URLs. If the backend API routes implicitly trust incoming requests without performing explicit server-side role and resource ownership validation, an attacker can directly send HTTP requests (e.g., `DELETE /api/v1/users/42`) to manipulate resources and bypass client-side UI filters entirely.

---

## Architectural View: Cosmetic Client Security vs. Authoritative API Validation
The boundary of trust must always reside at the server gate, never in client-side states or routing tables.

```
       [ Malicious Client / Hacker Postman ]
                       |
                       |  1. Bypass UI, sends raw HTTP:
                       |     "PATCH /api/v1/projects/9091" 
                       |     with Payload: { "status": "APPROVED" }
                       v
       [ REST API Controller Gate ]
                       |
                       |  2. Extracts token claims:
                       |     User ID: 501, Role: USER
                       v
       [ Authorization Context Validator ]
                       |
                       |-- 3. Policy Execution:
                       |      - Does User 501 own Project 9091? (ABAC Check)
                       |      - Does Role 'USER' have 'PATCH_STATUS' rights? (RBAC Check)
                       |
                       +---> If Authorization Fails: Returns 403 Forbidden (Strict)
                       |
                       +---> If Authorization Succeeds: Processes DB State Change
```

---

## Technical Deep Dive: Server-Side RBAC & ABAC Middleware
To implement absolute access control, the backend must enforce fine-grained, stateful, and contextual check logic. The implementation below shows a robust Node.js middleware engine enforcing both Role-Based Access Control (RBAC) and Attribute-Based Access Control (ABAC) resource ownership constraints.

```javascript
const express = require('express');
const app = express();
app.use(express.json());

// --- Mock Database / Data Tier ---
const projectsDatabase = {
    'proj-901': { id: 'proj-901', ownerId: 'usr-501', status: 'DRAFT', title: 'Q1 Budget Plan' },
    'proj-902': { id: 'proj-902', ownerId: 'usr-999', status: 'COMPLETED', title: 'System Secrets' }
};

// Simulated authenticated req.user injected from an upstream JWT validator
const injectMockSession = (req, res, next) => {
    // Let's assume an attacker (usr-501, standard role 'USER') is trying to modify 'proj-902' (owned by usr-999)
    req.user = {
        id: 'usr-501',
        role: 'USER',
        permissions: ['PROJECT_EDIT', 'PROJECT_VIEW']
    };
    next();
};

/**
 * RBAC Middleware: Verifies if user has the baseline structural permission required
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
 * ABAC Middleware: Contextually checks resource ownership (attribute relationship)
 */
const enforceProjectOwnership = async (req, res, next) => {
    const projectId = req.params.projectId;
    const project = projectsDatabase[projectId];

    if (!project) {
        return res.status(404).json({ error: 'Resource not found' });
    }

    // Attach project instance to request context to prevent redundant database hits in downstream handlers
    req.resourceContext = { project };

    // SUPER_ADMIN role bypasses ownership constraint checks
    if (req.user.role === 'SUPER_ADMIN') {
        return next();
    }

    // Explicit Attribute-Based check: User ID MUST match the Owner ID of the object
    if (project.ownerId !== req.user.id) {
        console.error(
            `[BAC ALERT] Authorization Breach Attempt: User ${req.user.id} ` +
            `attempted unauthorized access to Project ${projectId} (owned by ${project.ownerId})`
        );
        // Fail securely: return a generic 403 or 404 to avoid exposing resource existence
        return res.status(403).json({ error: 'Access Denied: Resource ownership validation failed' });
    }

    next();
};

// --- API Router Enforcing Multi-Layered Server-Side Validation ---
// Threat actor tries accessing PATCH /api/v1/projects/proj-902
app.patch(
    '/api/v1/projects/:projectId',
    injectMockSession,
    requirePermission('PROJECT_EDIT'),     // Layer 1: RBAC Permission Check
    enforceProjectOwnership,                // Layer 2: ABAC Attribute Check
    (req, res) => {
        const project = req.resourceContext.project;
        
        // Securely perform state changes
        project.title = req.body.title || project.title;
        project.status = req.body.status || project.status;

        res.status(200).json({
            status: 'success',
            message: 'Project updated successfully',
            data: project
        });
    }
);

module.exports = app;
```

---

## Defensive Countermeasures
1. **Never Trust Client-Side Claims:** Do not allow the client UI to dictate authorization rules. The server must verify JWT token signatures and evaluate permissions dynamically on every incoming request.
2. **Deny-by-Default:** Implement a default authorization interceptor that denies access to all routes unless they are explicitly whitelisted as public or mapped to specific authorization handlers.
3. **Automate BAC Integration Testing:** Write unit and integration tests specifically targeting authorization matrices (e.g., asserting that an authenticated `User-B` token receives a `403 Forbidden` when attempting to edit `User-A` properties).
