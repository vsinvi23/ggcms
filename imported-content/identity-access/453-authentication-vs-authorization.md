# Authentication vs Authorization: Finally Explained Clearly

In security engineering, confusing **Authentication (AuthN)** with **Authorization (AuthZ)** is one of the most common causes of architectural vulnerability. While they sound similar and often occur sequentially in a single user journey, they are entirely distinct operations governed by different rules, data structures, and threat profiles.

Let us define them once and for all, establish their technical boundaries, and examine a robust code implementation illustrating their separate responsibilities.

---

## The Conceptual Split: Identity vs. Permission

At their core, the two concepts answer entirely different questions:

| Dimension | Authentication (AuthN) | Authorization (AuthZ) |
| :--- | :--- | :--- |
| **The Question** | "Who are you?" | "Are you allowed to do this specific action?" |
| **The Focus** | Identity, verification, credentials, sessions. | Privileges, permissions, roles, policies, access rights. |
| **Typical Protocols** | OIDC, SAML, WebAuthn, FIDO2. | OAuth 2.0, RBAC, ABAC, ReBAC (Zanzibar). |
| **Core Artifact** | ID Token, Session Cookie, Identity Assertion. | Access Token, Capability Token, Policy Decision. |

---

## Technical Architecture Flow

Consider a user accessing an enterprise platform. The workflow proceeds in two distinct stages:

```
+------------+             +----------------------+             +--------------------+
|    User    |             | Authentication (IDP) |             | Authorization (API)|
+-----+------+             +----------+-----------+             +---------+----------+
      |                               |                                   |
      | 1. "Here are my credentials"  |                                   |
      |------------------------------>|                                   |
      |                               |                                   |
      | 2. "Verify identity"          |                                   |
      |    (Checks hash, MFA, etc.)   |                                   |
      |------------------------------>|                                   |
      |                               |                                   |
      | 3. Returns identity token     |                                   |
      |<------------------------------|                                   |
      |                                                                   |
      | 4. Requests resource with bearer access token                     |
      |------------------------------------------------------------------>|
      |                                                                   |
      |                               | 5. "What is this user allowed     |
      |                               |     to do?" (Policy Check)        |
      |                               |---------------------------------->|
      |                                                                   |
      |                               | 6. Evaluates RBAC/ABAC policies   |
      |                               |    and grants or denies access    |
      |                               |<----------------------------------|
      |                                                                   |
      | 7. Resource returned or 403 Forbidden                             |
      |<------------------------------------------------------------------|
```

---

## Core Vulnerabilities of Confusing AuthN and AuthZ

### 1. The ID Token Injection (AuthN as AuthZ)
An **ID Token** is designed for the client application to read. It tells the client *who* the user is so the client can display their name and profile picture. **It must never be used to authorize API access.** 

If an API accepts an ID token for authorization, an attacker could manipulate the client-side configuration or use an ID token issued for a completely different client app to access your internal APIs.

### 2. Broken Object-Level Authorization (BOLA / IDOR)
Even if a user is successfully authenticated, developers often fail to verify if that authenticated user has authorization to access the specific object they are requesting. For example, `GET /api/invoices/9999` might authenticate that the user is indeed Alice, but fail to authorize whether Alice has permission to view Invoice 9999 (which belongs to Bob).

---

## Robust Code Example: Clean Separation of AuthN and AuthZ

Below is an enterprise-grade Express.js implementation using TypeScript (simulated) that clearly separates identity verification (AuthN) from permission evaluation (AuthZ).

```javascript
const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();
app.use(express.json());

const JWT_PUBLIC_KEY = 'your-idp-public-key';

// Mock database containing role and ownership mappings
const documentStore = {
    'doc-101': { ownerId: 'user-alice', content: 'Alice Private Financial Data' },
    'doc-202': { ownerId: 'user-bob', content: 'Bob Private Financial Data' }
};

// ----------------------------------------------------
// Middleware 1: Authentication (Who are you?)
// ----------------------------------------------------
function authenticateUser(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication Required: No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Authenticate the identity token or access token
        const decodedIdentity = jwt.verify(token, JWT_PUBLIC_KEY, { algorithms: ['RS256', 'HS256'] });
        
        // Attach verified identity context to request
        req.userContext = {
            id: decodedIdentity.sub,
            roles: decodedIdentity.roles || [], // e.g. ['billing_viewer']
            email: decodedIdentity.email
        };
        
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Authentication Failed: Invalid identity signature' });
    }
}

// ----------------------------------------------------
// Middleware 2: Authorization (Are you allowed to read this doc?)
// ----------------------------------------------------
function authorizeDocumentAccess(action) {
    return (req, res, next) => {
        const { documentId } = req.params;
        const user = req.userContext;

        if (!user) {
            return res.status(500).json({ error: 'Internal Error: Authentication context missing' });
        }

        const document = documentStore[documentId];
        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Rule 1: Admins can do anything
        if (user.roles.includes('platform_admin')) {
            return next();
        }

        // Rule 2: Owners can read/write their own documents
        if (document.ownerId === user.id) {
            return next();
        }

        // Rule 3: Special role-based access to specific actions
        if (action === 'read' && user.roles.includes('auditor')) {
            return next();
        }

        // If no rules match, authorization is denied
        return res.status(403).json({
            error: 'Authorization Failed',
            message: `User '${user.id}' is not authorized to perform '${action}' on resource '${documentId}'`
        });
    };
}

// ----------------------------------------------------
// Unified Route
// ----------------------------------------------------
app.get('/api/documents/:documentId', 
    authenticateUser,                       // 1. Establish Who they are (AuthN)
    authorizeDocumentAccess('read'),        // 2. Validate what they can do (AuthZ)
    (req, res) => {
        const { documentId } = req.params;
        res.json({
            status: 'Success',
            data: documentStore[documentId].content
        });
    }
);

app.listen(3000, () => console.log('AuthN vs AuthZ demo server online on port 3000'));
```

---

## Architectural Principles to Memorize

1. **Authenticate first, Authorize second:** Never perform authorization operations before the user's identity is securely anchored and verified.
2. **Fail Closed:** Your default state for any authorization check must always be to deny access unless an explicit permission or role match is verified.
3. **Audit both independently:** Your log files should clearly differentiate between a user failing to log in (AuthN failure) versus a logged-in user attempting to read files they do not own (AuthZ violation).
