# SCIM 2.0: Orchestrating User Provisioning and Lifecycle Management

### The Problem: Orphaned Accounts and Lifecycle Friction
In modern enterprise environments, managing identity lifecycles manually across dozens of disparate Software-as-a-Service (SaaS) applications is an operational nightmare and a severe security risk. When an employee joins an organization, creating their accounts manually in each tool causes delay and administrative overhead. 

However, the more dangerous issue is offboarding. When an employee leaves the company, an administrator might disable their account in the primary directory (e.g., Entra ID or Okta) but forget to delete it in a third-party CRM or code repository. These unmonitored, "orphaned accounts" remain active and vulnerable to credential exploitation or insider threats. The System for Cross-domain Identity Management (SCIM) 2.0 protocol (RFC 7643 and 7644) solves this problem by defining a standardized schema and API for automating identity synchronization.

### Mental Model: The Central Directory as a Push Engine
Instead of every SaaS application maintaining its own custom user management system, SCIM positions the central Identity Provider (IdP) as the single source of truth. When changes occur in the directory, the IdP automatically "pushes" standardized JSON payloads over HTTP to the SaaS application's SCIM endpoint.

```
  [ Central Identity Provider ] 
  (Entra ID, Okta, Ping Identity)
               │
      Changes: User Created, Group Updated, Account Disabled
               │
               ▼  JSON over HTTPS (SCIM 2.0 API)
  ┌─────────────────────────────────────────────────────────┐
  │              SaaS Application SCIM Listener             │
  │   /Users (POST/PATCH/DELETE)    /Groups (PUT/GET)       │
  └────────────────────────────┬────────────────────────────┘
                               ▼
                   [ Target SaaS Database ]
```

### The REST Resource Model and Schemas

SCIM is built entirely on RESTful principles, using standard HTTP methods and strict JSON payloads validated against predefined schemas.

#### 1. The /Users Endpoint
The `/Users` endpoint handles primary identity lifecycle events. A typical payload for user creation (POST) contains a series of multi-valued attributes and a strict schema identifier:

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

#### 2. The /Groups Endpoint
The `/Groups` endpoint models organizational boundaries, managing user memberships and role mappings (e.g., mapping a "Security-Admin" directory group to internal application permissions).

### Deep Technical Mechanics: Securing Updates and State

Efficiently synchronizing identities at scale requires careful implementation of state management and API security.

#### 1. Why PUT is Avoided: Delta Updates with PATCH
When a user's department changes, sending a full HTTP `PUT` request requires sending the entire resource representation. If the IdP does not have the most up-to-date representation (e.g., if a user updated their phone number directly in the app), a `PUT` request will overwrite and erase those local modifications.
*   **SCIM Solution:** RFC 7644 mandates the use of HTTP `PATCH` for delta updates. This allows the IdP to send precise operational instructions (add, replace, or remove) without risking data loss.

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
This single atomic payload safely deactivates the user account without affecting any other attribute.

#### 2. Securing the SCIM Endpoint
Because SCIM endpoints execute high-privilege operations (user creation, modification, and deletion), they are high-value targets for attackers.
*   **Bearer Token Authorization:** Secure SCIM listeners must require cryptographically signed JSON Web Tokens (JWTs) or long-lived, high-entropy API tokens issued by the service provider.
*   **TLS Constraints:** Implementers must enforce TLS 1.3 to prevent eavesdropping of identity payloads in transit, and enforce rate-limiting on endpoints to block denial-of-service and brute-force discovery attacks.
