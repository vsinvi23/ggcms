---
title: "The SSO Handshake: SAML 2.0 Assertion Profiles and Bindings"
description: "How SAML 2.0 establishes cross-domain trust via a browser-mediated handshake, why IdP-initiated SSO is a CSRF risk, and how to read the cryptographic validators inside a SAML Assertion."
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "saml"
  - "sso"
  - "sp-initiated"
  - "idp-initiated"
  - "saml-assertion"
  - "saml-bindings"
  - "audience-restriction"
---

# The SSO Handshake: SAML 2.0 Assertion Profiles and Bindings

## The Problem: Cross-Domain Trust Without Shared Credentials

Single Sign-On (SSO) is essential for modern enterprise operations, allowing employees to access diverse application ecosystems with a single identity credential. However, a major architectural challenge is establishing trust across decoupled internet domains. A Service Provider (SP) (e.g., Salesforce) needs to securely authenticate users without directly receiving their passwords from the central Identity Provider (IdP) (e.g., Okta).

The security architecture must prevent replay attacks, impersonation, and data tampering, while routing all cryptographic communications safely through a user's web browser. The standard mechanism for this exchange is the Security Assertion Markup Language (SAML) 2.0. This article deconstructs the SAML SSO handshake, analyzes the flow patterns, and dissects the inner structure of a SAML Assertion.

## Mental Model: Redirection-Based Assertion Broker

SAML SSO relies on the user's browser acting as an intermediary broker. The IdP issues a cryptographically signed XML document (the SAML Assertion) and redirects the browser to submit this assertion to the SP.

```text
[ Browser / User Agent ] -------- 1. Access App --------> [ Service Provider (SP) ]
          |                                                    |
          |<--------------- 2. SAML AuthnRequest (Redirect) ---|
          |
          ├-------------- 3. Authenticate & Consent -----------> [ Identity Provider (IdP) ]
          |<------------- 4. Issue SAML Assertion (POST) ------|
          |
          ├-------------- 5. Post SAML Assertion (POST) -------> [ Service Provider (SP) ]
          ▼                                                    |
     Authenticated Session Granted <--------- 6. Cookie -------┘
```

## SSO Flow Mechanics: SP-Initiated vs. IdP-Initiated

There are two primary integration flows defined in SAML 2.0.

### 1. SP-Initiated SSO (The Secure Standard)

The user starts by navigating directly to the SP application.

* The SP determines the user's organization and generates a `<samlp:AuthnRequest>` XML payload.
* The SP redirects the user's browser to the IdP's Single Sign-On URL.
* The user authenticates at the IdP, which generates a signed SAML Assertion and redirects the browser back to the SP's Assertion Consumer Service (ACS) endpoint via an HTTP POST request.

Because the SP itself generated the `AuthnRequest`, it can embed a unique `InResponseTo` value and verify the returned assertion actually answers a request it made — closing the loop against replay.

### 2. IdP-Initiated SSO (The Security Risk)

The user starts at the IdP dashboard and clicks a tile to launch the SP.

* The IdP immediately generates a SAML Response and redirects the browser to the SP's ACS endpoint.
* **The Security Risk:** Because the SP did not request this login, it has no cryptographic challenge state (no `InResponseTo` to check). This makes IdP-initiated SSO highly vulnerable to Cross-Site Request Forgery (CSRF): an attacker can capture a valid IdP-initiated assertion and replay it to log a victim into an attacker-controlled application account, since the SP has no request state to correlate the response against.

**Architectural best practice:** always disable IdP-initiated flows and use SP-initiated redirection instead, unless the IdP vendor documents specific replay protections (e.g., short assertion validity windows combined with one-time-use tracking) for its IdP-initiated mode.

## SAML Bindings: HTTP Redirect vs. HTTP POST

* **HTTP Redirect Binding:** Primarily used for transmitting the lightweight `<samlp:AuthnRequest>` payload. The XML is deflated, base64-encoded, URL-encoded, and appended to the URL query string.
* **HTTP POST Binding:** Used for sending the heavier SAML Response and Assertion. Because URLs have strict length limits, the IdP instead sends an HTML page containing a hidden form with a Base64-encoded `SAMLResponse` field, which is automatically submitted to the SP via JavaScript on page load.

## Anatomy of the SAML Assertion Payload

The SAML Assertion is a structured XML element nested within the `<samlp:Response>`. Understanding its core nodes is crucial for secure parsing.

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

### Core Cryptographic Validators

1. **`<saml:Issuer>`** — Identifies the IdP. The SP must validate this against an allowlist of trusted entity IDs, never trust it blindly.
2. **`<saml:Subject>` & `<saml:NameID>`** — Holds the authenticated user identity (usually their email or employee ID).
3. **`<saml:Conditions>` (`NotBefore` and `NotOnOrAfter`)** — Specifies the strict validity window of the assertion (typically ±5 minutes). SPs must reject tokens received outside this range to mitigate replay attacks; a stolen assertion is useless once its narrow window closes.
4. **`<saml:AudienceRestriction>`** — Explicitly defines the target Service Provider's unique identifier. The SP must verify that this value matches its own metadata identifier, to prevent an assertion issued for App A from being replayed on App B (a "confused deputy" style cross-SP replay).

Every one of these four checks is independent and mandatory — a SAML implementation that validates the signature but skips the `Conditions` window or `AudienceRestriction` check is still exploitable, even though "the signature is valid" sounds like the important part.

## Key Takeaways

- SAML SSO routes cryptographic assertions through the user's browser as an untrusted intermediary — every downstream check (signature, issuer, audience, validity window) exists because the browser cannot be trusted not to tamper with or replay what it's carrying.
- SP-initiated SSO lets the SP track its own `AuthnRequest` state (`InResponseTo`) and correlate the response against it; IdP-initiated SSO has no such state and is inherently more vulnerable to replay/CSRF — disable it unless you have a specific, documented reason not to.
- HTTP Redirect binding carries the lightweight `AuthnRequest`; HTTP POST binding carries the heavier signed Response, because only POST has no practical size limit.
- A validly-signed assertion is not automatically a safe one: `Issuer` allowlisting, the `NotBefore`/`NotOnOrAfter` window, and `AudienceRestriction` are all separate, mandatory checks that a real implementation must not skip.
