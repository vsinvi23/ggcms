# SCIM Protocol: Implementing Real-Time User Provisioning and De-provisioning APIs

## The Problem: The Orphaned Account Vulnerability
In enterprise environments using SaaS applications (e.g., Slack, GitHub, Salesforce), onboarding and offboarding employees is a complex lifecycle. Historically, when an employee was terminated in the corporate HR system, IT had to manually log into dozens of disparate SaaS portals to delete their accounts. 

When manual offboarding fails or is delayed, the result is an **orphaned account**. The ex-employee retains active access to proprietary source code or customer data, posing a massive insider threat. While Single Sign-On (SSO) via SAML or OIDC revokes login capabilities, it *does not* delete the account in the target app. If the SaaS app retains an active API token, OAuth grant, or active web session for that user, the ex-employee maintains access despite losing SSO capabilities.

## The Solution: System for Cross-domain Identity Management (SCIM)
SCIM (RFC 7643 and 7644) is an open HTTP/REST standard for automating the exchange of user identity information between identity domains (e.g., Azure AD, Okta) and IT systems (the SaaS application).

When an employee is terminated in the IdP, the IdP instantly fires a SCIM `DELETE` or `PATCH` request to the SaaS application. The SaaS application immediately tears down the user's account, invalidates API keys, and drops active WebSocket/HTTP sessions. SCIM ensures identity synchronization is automated, real-time, and standardized.

## Architectural Flow
```text
  [Identity Provider (Okta/Azure)]                     [SaaS Application (Service Provider)]
                |                                                      |
    (HR Marks User as Active)                                          |
                |--- POST /scim/v2/Users ----------------------------->|
                |    {"userName": "jdoe", "active": true}              |
                |<-- 201 Created (Stores SaaS User ID) ----------------|
                |                                                      |
    (User Changes Name / Dept)                                         |
                |--- PATCH /scim/v2/Users/12345 ---------------------->|
                |    {"Operations": [{"op": "replace", ...}]}          |
                |<-- 200 OK -------------------------------------------|
                |                                                      |
    (HR Terminates User)                                               |
                |--- PATCH /scim/v2/Users/12345 ---------------------->|
                |    {"Operations": [{"op": "replace",                 |
                |     "path": "active", "value": false}]}              |
                |                                                      |
                |                                      (SP Revokes all active sessions, 
                |                                       revokes API tokens)
                |<-- 200 OK -------------------------------------------|
```

## Implementation: SCIM REST API (Express.js)
A standard SCIM implementation requires standardizing responses according to the core SCIM JSON schema. Here is a robust implementation of the SCIM `PATCH` endpoint, handling the critical offboarding event.

```javascript
const express = require('express');
const app = express();
app.use(express.json({ type: 'application/scim+json' }));

// Middleware to authenticate SCIM requests (usually Bearer Token issued to the IdP)
app.use(requireScimToken);

/**
 * PATCH /scim/v2/Users/:id
 * Updates specific attributes of a user, critically handling de-provisioning.
 */
app.patch('/scim/v2/Users/:id', async (req, res) => {
    const userId = req.params.id;
    const { Operations } = req.body;

    if (!Operations || !Array.isArray(Operations)) {
        return res.status(400).json(scimError(400, "invalidSyntax", "Missing Operations array"));
    }

    try {
        let isDeactivation = false;

        for (const op of Operations) {
            // SCIM PATCH uses specific operations: add, remove, replace
            if (op.op.toLowerCase() === 'replace' && op.path === 'active') {
                const isActive = op.value;
                await updateDatabaseStatus(userId, isActive);
                
                if (isActive === false) {
                    isDeactivation = true;
                }
            }
            // Handle other operations (e.g., name changes, group membership)
        }

        // TRIGGER IMMEDIATE SECURITY REVOCATION
        if (isDeactivation) {
            console.log(`[SECURITY] User ${userId} deactivated via SCIM. Terminating access.`);
            await revokeActiveSessions(userId);   // Drop Redis session keys
            await revokeOAuthTokens(userId);      // Invalidate API/OAuth tokens
            await dropWebSocketConnections(userId); // Kick from live dashboards
        }

        // SCIM requires returning the full updated User representation
        const updatedUser = await fetchUserFromDb(userId);
        res.status(200).json(formatScimUser(updatedUser));

    } catch (error) {
        res.status(500).json(scimError(500, "internalError", error.message));
    }
});

function scimError(status, scimType, detail) {
    return {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: status.toString(),
        scimType: scimType,
        detail: detail
    };
}
```

## Engineering Considerations
1. **Schema Compliance:** Identity Providers are notoriously strict about SCIM schema compliance. Your API must accurately return `urn:ietf:params:scim:schemas:core:2.0:User` definitions, correctly formatted metadata (`meta.created`, `meta.location`), and adhere strictly to the HTTP status codes mandated by the RFC (e.g., `404` for not found, `409` for conflict).
2. **Soft Delete vs Hard Delete:** When an IdP de-provisions a user, it usually sends a `PATCH` setting `active: false` (Soft Delete), rather than a `DELETE` request. Applications should prefer soft deletion to retain audit logs, relational foreign keys, and to allow for seamless re-activation if the user returns.
3. **Pagination & Filtering:** Supporting the SCIM `GET /Users` endpoint requires implementing complex string-based filtering (e.g., `?filter=userName eq "jdoe"`) and pagination (`startIndex`, `count`) to allow the IdP to sync and reconcile directories.