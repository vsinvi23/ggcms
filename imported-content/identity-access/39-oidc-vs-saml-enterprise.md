# OIDC vs. SAML 2.0: Architectural Trade-offs in Enterprise Single Sign-On

Enterprise Single Sign-On (SSO) and federated identity are the cornerstones of modern identity and access management (IAM). When connecting heterogeneous applications across trust boundaries, security architects and developers must choose between two prominent standards: **Security Assertion Markup Language (SAML 2.0)** and **OpenID Connect (OIDC)**. 

While both protocols solve the same core problem—proving a user's identity to a relying party without sharing credentials—their underlying data formats, transport mechanisms, and security properties differ substantially. Choosing the wrong standard can lead to complex, brittle integrations, poor support for mobile and single-page applications, and catastrophic parsing vulnerabilities.

---

## The Problem: Identity Federation Across Fragmented Ecosystems

Organizations must safely authenticate users across separate security domains. In a federated setup, we have two primary actors:
1. **The Identity Provider (IdP):** Holds the user directory and validates credentials.
2. **The Service Provider (SP) or Relying Party (RP):** The application requesting authentication.

The core challenge is transporting user authentication state securely across the public internet. Historically, SAML emerged in the early 2000s to handle browser-centric web SSO. However, the rise of native mobile apps, Single Page Applications (SPAs), microservices, and modern APIs exposed SAML’s limitations, leading to the creation of OIDC (built on top of OAuth 2.0) in 2014.

---

## Attack Vectors: Data Serialization & Protocol Exploits

The security profiles of SAML and OIDC are heavily influenced by their data serialization formats: XML for SAML and JSON/JWT for OIDC.

### 1. XML Parsing and XML Signature Wrapping (XSW) in SAML
SAML relies on massive, deeply nested XML messages. To guarantee integrity, SAML uses **XML Digital Signatures (XMLDSig)**. This design is highly vulnerable to implementation flaws:
* **XML External Entity (XXE) Injection:** If the SP's XML parser is misconfigured to resolve external entities, an attacker can send a crafted SAML assertion to read local host files or perform internal port scanning.
* **XML Signature Wrapping (XSW):** In an XSW attack, the attacker intercepts a valid SAML response and duplicates or shifts the signature element. The attacker then inserts a fake, un-signed assertion containing administrative privileges (e.g., changing the username). Due to logic flaws in many SAML parsers, the library verifies the signature of the legitimate assertion but authorizes the user based on the fake assertion.

### 2. Browser Redirect Exploitation and Front-Channel Manipulation
Both protocols rely on the web browser as an intermediary (the "front-channel") to exchange authentication data via HTTP `302 Redirects` or auto-submitting POST forms. This introduces redirect-based vulnerabilities:
* **Open Redirectors:** Attackers can manipulate SAML’s `RelayState` or OIDC’s `redirect_uri` parameters. If the IdP/SP does not rigorously validate these URLs, users are redirected to phishing sites after successful login.
* **Token/Assertion Leakage:** If the redirect occurs over unencrypted HTTP or to a compromised client application, the SAML Assertion or OIDC Access/ID Token can be intercepted by looking at browser history, HTTP logs, or `Referer` headers.

### 3. The API and Mobile Compatibility Barrier
SAML assertions are massive XML payloads, often exceeding several kilobytes. They are designed almost exclusively for web browsers.
* **API Incompatibility:** Trying to pass a multikilobyte XML assertion in an HTTP authorization header of a lightweight microservice or API is extremely inefficient. No native API framework supports parsing SAML as a standard bearer credential.
* **Mobile and SPA Limitations:** Parsing XML and verifying complex cryptographic signatures in client-side Javascript or mobile environments is difficult, resource-intensive, and introduces a massive attack surface.

---

## Defenses: Securing the Federation Flow

Hardening enterprise SSO requires applying secure coding practices and strict input validation at both the IdP and SP/RP.

### XML Defenses (SAML)
To prevent XXE, explicitly disable external entity resolution (`DOCTYPE` declarations) in your XML parser:
```java
DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
```
To mitigate XSW, your SAML library must validate that the signature specifically covers the precise element ID containing the assertion being evaluated (assertion-level signature verification), rather than just checking that *some* signature exists in the XML document.

### OIDC and JWT Defenses
For OIDC, enforce strict URL matching for the `redirect_uri` (allow only exact matches, never wildcard domains). To prevent CSRF attacks, utilize the `state` parameter or the `nonce` claim in OIDC:
```javascript
// Validate state in OIDC response
if (receivedState !== storedSessionState) {
    throw new Error("CSRF attack detected: State mismatch!");
}
```

### API Gateway Mediation
For modern architectures, use OIDC. If legacy SAML IdPs must be supported, implement an API Gateway pattern. The gateway acts as the SAML SP, authenticates the browser session, and down-scopes the heavy XML assertion into a lightweight, cryptographically signed JSON Web Token (JWT) before routing the request to backend microservices.

---

## Developer Takeaways

| Feature | SAML 2.0 | OpenID Connect (OIDC) |
| :--- | :--- | :--- |
| **Data Format** | XML (Heavyweight, structured) | JSON / JWT (Lightweight, compact) |
| **Transport** | Primarily browser POST/Redirect | REST APIs, HTTP Headers, Browser |
| **Key Risk** | XXE, XML Signature Wrapping (XSW) | Signature Stripping, Weak JWT keys |
| **Use Case** | Traditional Web Enterprise Applications | Modern APIs, Mobile, SPAs, Microservices |

**When to choose SAML:** Use it only when integrating with legacy enterprise directories (e.g., Active Directory Federation Services) that do not yet support modern RESTful APIs.

**When to choose OIDC:** Default to OIDC for all new greenfield applications, mobile apps, SPAs, and microservice architectures. It is highly secure, performs efficiently over HTTP headers, and eliminates the legacy attack vectors associated with XML parsing.
