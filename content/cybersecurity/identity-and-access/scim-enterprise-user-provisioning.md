---
title: "SCIM 2.0: Automating Enterprise User Provisioning and De-provisioning"
description: "How SCIM 2.0 eliminates orphaned accounts by letting an Identity Provider push real-time user lifecycle events to SaaS applications, with a working Express.js PATCH endpoint that revokes sessions and tokens on deactivation."
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "scim"
  - "provisioning"
  - "deprovisioning"
  - "identity-lifecycle"
  - "rest-api"
  - "orphaned-accounts"
  - "sso"
---

# SCIM 2.0: Automating Enterprise User Provisioning and De-provisioning

## The Problem: The Orphaned Account Vulnerability

In enterprise environments using SaaS applications (e.g., Slack, GitHub, Salesforce), onboarding and offboarding employees is a complex lifecycle. Historically, when an employee was terminated in the corporate HR system, IT had to manually log into dozens of disparate SaaS portals to delete their accounts.

When manual offboarding fails or is delayed, the result is an **orphaned account**. The ex-employee retains active access to proprietary source code or customer data, posing a massive insider threat. While Single Sign-On (SSO) via SAML or OIDC revokes login *capability*, it does **not** delete the account in the target app. If the SaaS app retains an active API token, OAuth grant, or active web session for that user, the ex-employee maintains access despite losing the ability to initiate a new SSO login.

## The Solution: System for Cross-domain Identity Management (SCIM)

SCIM (RFC 7643 and RFC 7644) is an open HTTP/REST standard for automating the exchange of user identity information between identity domains (e.g., Entra ID, Okta, Ping Identity) and IT systems (the SaaS application). Instead of every SaaS application maintaining its own custom user management system, SCIM positions the central Identity Provider (IdP) as the single source of truth, pushing standardized JSON payloads over HTTP whenever a user's state changes.

When an employee is terminated in the IdP, the IdP instantly fires a SCIM `PATCH` (or `DELETE`) request to the SaaS application. The SaaS application immediately tears down the user's account, invalidates API keys, and drops active WebSocket/HTTP sessions. SCIM ensures identity synchronization is automated, real-time, and standardized.

## Architectural Flow

```text
  [Identity Provider (Okta/Entra ID)]                  [SaaS Application (Service Provider)]
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
                |                                       revokes API tokens, drops connections)
                |<-- 200 OK -------------------------------------------|
```

## The REST Resource Model and Schemas

SCIM is built entirely on RESTful principles, using standard HTTP methods and strict JSON payloads validated against predefined schemas.

### The `/Users` Endpoint

The `/Users` endpoint handles primary identity lifecycle events. A typical payload for user creation (`POST`) contains a series of multi-valued attributes and a strict schema identifier:

```json
{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
  "userName": "jdoe@example.com",
  "name": {
    "familyName": "Doe",
    "givenName": "Jane"
  },
  "emails": [{
    "value": "jdoe@example.com",
    "type": "work",
    "primary": true
  }],
  "active": true
}
```

### The `/Groups` Endpoint

The `/Groups` endpoint models organizational boundaries, managing user memberships and role mappings (e.g., mapping a "Security-Admin" directory group to internal application permissions).

## Why `PATCH`, Not `PUT`, Is the Deprovisioning Primitive

When a user's department changes, sending a full HTTP `PUT` request requires transmitting the entire resource representation. If the IdP does not have the most up-to-date representation of the user (for example, if the user updated their own phone number directly inside the SaaS app), a `PUT` request will overwrite and silently erase that local modification.

RFC 7644 mandates the use of HTTP `PATCH` for delta updates instead. This allows the IdP to send precise operational instructions (`add`, `replace`, `remove`) without risking data loss:

```http
PATCH /Users/2819c223-7f76-453a-919d-413861904646 HTTP/1.1
Host: example.com/scim/v2
Content-Type: application/scim+json
Authorization: Bearer sF5...d2k

{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    {
      "op": "replace",
      "path": "active",
      "value": false
    }
  ]
}
```

This single atomic payload safely deactivates the user account without affecting any other attribute — the operation that actually matters for de-provisioning.

## Implementation: SCIM REST API (Express.js)

A standard SCIM implementation requires standardizing responses according to the core SCIM JSON schema. Here is a robust implementation of the SCIM `PATCH` endpoint, handling the critical offboarding event end-to-end.

```javascript
const express = require('express');
const app = express();
app.use(express.json({ type: 'application/scim+json' }));

// Middleware to authenticate SCIM requests (usually a long-lived Bearer Token issued to the IdP)
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
            await revokeActiveSessions(userId);     // Drop Redis session keys
            await revokeOAuthTokens(userId);        // Invalidate API/OAuth tokens
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

## Securing the SCIM Endpoint

Because SCIM endpoints execute high-privilege operations (user creation, modification, and deletion), they are high-value targets for attackers.

* **Bearer Token Authorization:** Secure SCIM listeners must require cryptographically signed JSON Web Tokens (JWTs) or long-lived, high-entropy API tokens issued specifically to the IdP — never reuse an end-user session token here.
* **TLS Constraints:** Enforce TLS 1.3 to prevent eavesdropping of identity payloads in transit, and enforce rate-limiting on the endpoint to block denial-of-service and brute-force discovery attacks against it.

## Engineering Considerations

1. **Schema Compliance:** Identity Providers are notoriously strict about SCIM schema compliance. Your API must accurately return `urn:ietf:params:scim:schemas:core:2.0:User` definitions, correctly formatted metadata (`meta.created`, `meta.location`), and adhere strictly to the HTTP status codes mandated by the RFC (e.g., `404` for not found, `409` for conflict).
2. **Soft Delete vs Hard Delete:** When an IdP de-provisions a user, it usually sends a `PATCH` setting `active: false` (soft delete), rather than a `DELETE` request. Applications should prefer soft deletion to retain audit logs, relational foreign keys, and to allow for seamless re-activation if the user returns.
3. **Pagination & Filtering:** Supporting the SCIM `GET /Users` endpoint requires implementing complex string-based filtering (e.g., `?filter=userName eq "jdoe"`) and pagination (`startIndex`, `count`) to allow the IdP to sync and reconcile directories at scale.

## Key Takeaways

- SSO revokes login capability; it does not delete an account. SCIM closes that gap by giving the IdP a standardized, real-time push channel to deprovision accounts the moment HR marks an employee as terminated.
- RFC 7644 mandates `PATCH` over `PUT` for updates specifically to avoid the IdP silently clobbering attribute changes made locally inside the SaaS app.
- A correct `active: false` handler must do more than flip a database flag — it must synchronously revoke sessions, OAuth tokens, and live connections, or the orphaned-account risk SCIM was built to close simply reappears one layer down.
- SCIM endpoints are high-privilege attack surface in their own right and need their own bearer-token auth, TLS enforcement, and rate limiting, independent of the application's normal user-facing authentication.
