# IAM Explained from Scratch: Lifecycle, Provisioning, and Federation

## The Problem: The Identity Sprawl
In the early days of a startup, identity management is simple: you create a row in a Postgres `users` table. 

As the company scales, this simplicity collapses into "identity sprawl." An employee needs access to AWS, GitHub, Salesforce, the internal VPN, and the production database. Without a central architecture, IT creates five separate accounts for that employee. When the employee leaves, IT remembers to delete four of them. The orphaned AWS account remains active and is later compromised, leading to a major data breach.

**Identity and Access Management (IAM)** is the architectural discipline of ensuring the right individuals have the right access to the right resources, for the right reasons. It is not just about logging in; it is about the entire lifecycle of a digital identity.

## The Three Pillars of IAM

IAM architecture rests on three foundational pillars: Identity Lifecycle Management, Access Provisioning, and Identity Federation.

### 1. Identity Lifecycle Management (JML)
Identities are not static. They follow a strict lifecycle known as **Joiner, Mover, Leaver (JML)**.

*   **Joiner:** When a new engineer is hired, a "source of truth" (usually an HR system like Workday) triggers the creation of a digital identity.
*   **Mover:** When that engineer transfers from Frontend to DevOps, their permissions must change. They need access to Kubernetes, but their access to the marketing blog must be revoked.
*   **Leaver:** When the engineer departs, *all* access across *all* systems must be instantly and atomically revoked.

**The Engineering Rule:** Never manage identities manually. The JML process must be event-driven. An API call from the HR system should trigger a webhook that updates the central directory (like Active Directory or Okta).

### 2. Access Provisioning and De-provisioning
Once an identity exists, how does it actually get an account in a downstream app like GitHub?

*   **Manual Provisioning (Anti-Pattern):** An IT admin logs into GitHub and clicks "Add User."
*   **SCIM (System for Cross-domain Identity Management):** This is the industry standard protocol for automating provisioning. 

SCIM provides a REST API schema for creating, updating, and deleting users.

```text
[ Central IAM Directory (Okta) ]
       |
       | (HTTP POST /scim/v2/Users)
       v
[ Downstream App (GitHub / Salesforce / Custom Internal App) ]
```

When an employee is marked as "Terminated" in the HR system, the central IAM directory automatically fires a `DELETE /scim/v2/Users/{id}` request to every integrated downstream application. De-provisioning is instant and exhaustive, closing the massive security hole of orphaned accounts.

### 3. Identity Federation
Even if provisioning is automated, asking a user to remember 50 different passwords for 50 different apps is a security disaster (they will reuse the same password everywhere). 

Identity Federation solves this by decoupling the *Identity Provider (IdP)* from the *Service Provider (SP)*. 

When an employee wants to access Salesforce (the SP), Salesforce does not ask for a password. Instead, it redirects the user to the company's central IdP (e.g., Microsoft Entra). The IdP authenticates the user (via MFA), and then issues a cryptographically signed token proving the identity back to Salesforce.

**The Standards of Federation:**
*   **SAML (Security Assertion Markup Language):** The older, XML-based enterprise standard. Excellent for complex enterprise SSO.
*   **OIDC (OpenID Connect):** The modern, JSON-based standard built on OAuth 2.0. Heavily preferred for modern web and mobile apps.

#### Visualizing OIDC Federation

```text
  [ User Browser ]
        | 1. Wants to access internal wiki
        v
  [ Wiki (Service Provider) ]
        | 2. Has no session. Redirects to IdP.
        v
  [ Okta (Identity Provider) ]
        | 3. Prompts user for Password + YubiKey
        | 4. User passes MFA
        | 5. Redirects back to Wiki with an Auth Code
        v
  [ Wiki (Service Provider) ]
        | 6. Exchanges Code for an ID Token (JWT) on the backend
        | 7. Verifies the JWT signature
        | 8. Grants access to the Wiki
```

## The Modern IAM Architecture Stack

A robust corporate IAM architecture typically looks like this:

1.  **The Source of Truth:** The HR system (Workday, BambooHR). It holds the legal record of employment.
2.  **The Directory / IdP:** The central hub (Okta, Entra ID, PingIdentity). It syncs with the HR system. It acts as the single point of authentication for all users.
3.  **The Provisioning Engine:** Often built into the IdP, this uses the SCIM protocol to automatically create and delete accounts in downstream SaaS apps based on the Directory's state.
4.  **The SSO Gateway:** The IdP uses SAML or OIDC to allow users to log into those downstream apps without needing a separate password.

## Conclusion
Building custom login systems or manually managing user accounts in a spreadsheet is a relic of the past. Modern engineering teams must treat Identity as a foundational infrastructure layer. By mastering the JML lifecycle, automating provisioning with SCIM, and enforcing federation with OIDC/SAML, organizations can scale rapidly without leaving a trail of orphaned, highly privileged accounts waiting to be exploited.