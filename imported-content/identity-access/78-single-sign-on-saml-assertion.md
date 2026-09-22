# The SSO Handshake: Analyzing SAML 2.0 Assertion Profiles

### The Problem: Cross-Domain Trust Without Shared Credentials
Single Sign-On (SSO) is essential for modern enterprise operations, allowing employees to access diverse application ecosystems with a single identity credential. However, a major architectural challenge is establishing trust across decoupled internet domains. A Service Provider (SP) (e.g., Salesforce) needs to securely authenticate users without directly receiving their passwords from the central Identity Provider (IdP) (e.g., Okta). 

The security architecture must prevent replay attacks, impersonation, and data tampering, while routing all cryptographic communications safely through a user's web browser. The standard mechanism for this exchange is the Security Assertion Markup Language (SAML) 2.0. This article deconstructs the SAML SSO handshake, analyzes the flow patterns, and dissects the inner structure of a SAML Assertion.

### Mental Model: Redirection-Based Assertion Broker
SAML SSO relies on the user's browser acting as an intermediary broker. The IdP issues a cryptographically signed XML document (the SAML Assertion) and redirects the browser to submit this assertion to the SP.

```
[ Browser / User Agent ] -------- 1. Access App --------> [ Service Provider (SP) ]
          │                                                    │
          │<--------------- 2. SAML AuthnRequest (Redirect) ---│
          │
          ├-------------- 3. Authenticate & Consent -----------> [ Identity Provider (IdP) ]
          │<------------- 4. Issue SAML Assertion (POST) ------│
          │
          ├-------------- 5. Post SAML Assertion (POST) -------> [ Service Provider (SP) ]
          ▼                                                    │
     Authenticated Session Granted <--------- 6. Cookie -------┘
```

### SSO Flow Mechanics: SP-Initiated vs. IdP-Initiated

There are two primary integration flows defined in SAML 2.0:

#### 1. SP-Initiated SSO (The Secure Standard)
The user starts by navigating directly to the SP application.
*   The SP determines the user's organization and generates a `<samlp:AuthnRequest>` XML payload.
*   The SP redirects the user's browser to the IdP's Single Sign-On URL.
*   The user authenticates at the IdP, which generates a signed SAML Assertion and redirects the browser back to the SP's Assertion Consumer Service (ACS) endpoint via an HTTP POST request.

#### 2. IdP-Initiated SSO (The Security Risk)
The user starts at the IdP dashboard and clicks a tile to launch the SP.
*   The IdP immediately generates a SAML Response and redirects the browser to the SP's ACS endpoint.
*   **The Security Risk:** Because the SP did not request this login, it has no cryptographic challenge state. This makes IdP-initiated SSO highly vulnerable to Cross-Site Request Forgery (CSRF). An attacker can intercept or forge a login loop and log a victim into an attacker-controlled application account. **Architectural Best Practice: Always disable IdP-initiated flows and use SP-initiated redirection instead.**

#### SAML Bindings: HTTP Redirect vs. HTTP POST
*   **HTTP Redirect Binding:** Primarily used for transmitting the lightweight `<samlp:AuthnRequest>` payload. The XML is compressed, base64-encoded, URL-encoded, and appended to the URL query string.
*   **HTTP POST Binding:** Used for sending the heavy SAML Response and Assertion. Because URLs have strict length limits, the IdP sends an HTML page containing a hidden form with a Base64-encoded `SAMLResponse` field, which is automatically submitted to the SP using JavaScript.

### Anatomy of the SAML Assertion Payload

The SAML Assertion is a structured XML element nested within the `<samlp:Response>`. Understanding its core nodes is crucial for secure parsing:

```xml
<saml:Assertion ID="_987654" IssueInstant="2026-06-03T12:00:00Z" Version="2.0">
  <saml:Issuer>https://idp.example.com</saml:Issuer>
  <ds:Signature>...</ds:Signature> <!-- Cryptographic Signature -->
  <saml:Subject>
    <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">
      alice@example.com
    </saml:NameID>
  </saml:Subject>
  <saml:Conditions NotBefore="2026-06-03T11:55:00Z" NotOnOrAfter="2026-06-03T12:05:00Z">
    <saml:AudienceRestriction>
      <saml:Audience>https://sp.example.com/metadata</saml:Audience>
    </saml:AudienceRestriction>
  </saml:Conditions>
</saml:Assertion>
```

#### Core Cryptographic Validators:
1.  **`<saml:Issuer>`:** Identifies the IdP. The SP must validate this against an allowlist of trusted entity IDs.
2.  **`<saml:Subject>` & `<saml:NameID>`:** Holds the authenticated user identity (usually their email or employee ID).
3.  **`<saml:Conditions>` (`NotBefore` and `NotOnOrAfter`):** Specifies the strict validity window of the assertion (typically ±5 minutes). SPs must reject tokens received outside this range to mitigate replay attacks.
4.  **`<saml:AudienceRestriction>`:** Explicitly defines the target Service Provider's unique identifier. The SP must verify that this value matches its own metadata identifier to prevent an assertion issued for App A from being replayed on App B.
