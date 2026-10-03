---
title: "SAML XML Signature Wrapping (XSW): Attack Mechanics and Defenses"
description: "How XML Signature Wrapping lets an attacker forge an admin identity inside an otherwise validly-signed SAML Response, and how to close the gap between signature verification and attribute extraction."
categorySlug: "identity-access"
articleType: "DEEP_DIVE"
tags:
  - "saml"
  - "xml-signature-wrapping"
  - "xsw"
  - "sso"
  - "signature-validation"
  - "xpath"
---

# SAML XML Signature Wrapping (XSW): Attack Mechanics and Defenses

## The Problem: Schema Flexibility and Decoupled Processing

Security Assertion Markup Language (SAML) 2.0 remains a foundational standard for enterprise Single Sign-On (SSO). However, SAML relies heavily on XML, a format notorious for its semantic complexity and parser inconsistencies. The most critical vulnerability class affecting SAML Service Providers (SPs) is **XML Signature Wrapping (XSW)**.

XSW occurs when an attacker modifies a valid SAML Response by injecting a forged, malicious assertion while keeping the original, cryptographically signed assertion intact. Because XML parsers and cryptographic libraries often process documents in decoupled stages, the cryptographic library verifies the signature on the original assertion, while the application's business logic parses and acts upon the forged assertion. This mismatch allows an attacker to impersonate any user within the enterprise — without ever forging a signature.

## Mental Model: The Dual-Parser Desynchronization

Imagine a security guard checking a luggage bag. The cryptographic verifier looks at the top compartment, sees a valid seal, and approves the bag. The business logic parser then opens the bottom compartment, extracts the contents, and processes them.

```text
[ XML Document Root ]
  ├── [ Unsigned / Forged Block ] ---> Business Logic reads this (Malicious User)
  └── [ Cryptographically Signed Block ] ---> Signature Verifier validates this (Valid User)
```

In an XSW attack, the logical structure of the XML document is rearranged to exploit this desynchronization: the signature math is checked against one element, while the application reads its user identity from a different, structurally similar element that a naive XPath query happens to select first.

## Attack Vector Anatomy: Restructuring the Assertion

There are multiple variants of XSW (often categorized XSW1 through XSW8) based on how the forged assertion is positioned relative to the original signature. All of them share the same core trick: keep the originally signed `<Assertion>` byte-for-byte intact somewhere in the document (so the signature still verifies), while relocating or duplicating structure so the application's *extraction* logic reads a different, attacker-controlled node.

```text
SAML Response (Before Attack)
<Response>
  <Assertion ID="ID_123">
    <Subject>alice@example.com</Subject>
    <Signature>...</Signature> <!-- Signs Assertion ID_123 -->
  </Assertion>
</Response>

SAML Response (After XSW Attack)
<Response>
  <Assertion ID="ID_999"> <!-- Forged Assertion -->
    <Subject>admin@example.com</Subject>
  </Assertion>
  <WrapperElement>
    <Assertion ID="ID_123"> <!-- Original Assertion, untouched -->
      <Subject>alice@example.com</Subject>
      <Signature>...</Signature> <!-- Signature still verifies ID_123 -->
    </Assertion>
  </WrapperElement>
</Response>
```

In this classic XSW variant:

1. The attacker intercepts a legitimate SAML assertion issued for `alice@example.com`.
2. The attacker copies the legitimate `<Assertion>` block and wraps it inside a new element (e.g., `<WrapperElement>`), leaving its contents — and therefore its signature — completely unmodified.
3. The attacker inserts a fake `<Assertion>` block at the original document path with a modified subject, `admin@example.com`.
4. When the Service Provider processes this document:
   * The digital signature verifier uses an XPath query like `//*[@ID='ID_123']` to locate the signed assertion. It finds the original block (now nested inside the wrapper) and confirms the signature is mathematically valid.
   * The authorization engine retrieves the user identity using a simple relative query like `/Response/Assertion/Subject`. Because that path now resolves to the *forged* assertion — the one sitting first in document order — it extracts `admin@example.com` and logs the attacker in as administrator.

The signature verification step never lied: `ID_123` really is validly signed. The vulnerability is that the application asked the wrong question — "is *some* assertion in this document validly signed?" instead of "is *the specific assertion I am about to read attributes from* validly signed?"

## Defensive Hardening Strategies

Defending against XSW requires eliminating any structural ambiguity in the incoming XML payload. Service Providers must enforce the following cryptographic and parsing policies:

### 1. One-Pass Validation and Schema Enforcement

Perform strict XML Schema Validation (XSD) against the SAML schema before any cryptographic or business processing begins. Reject any responses containing unexpected wrapper elements, duplicate assertions, or elements in non-standard namespaces. A response with two `<Assertion>` elements, or an unrecognized `<WrapperElement>`, should be rejected outright rather than passed through for signature checking.

### 2. Synchronize Signature and Extraction Queries

Never use disconnected XPath queries for verification and extraction. The application must guarantee that the exact XML *node object* that passed cryptographic signature verification is the one from which user attributes (such as NameID or roles) are extracted — not merely a node that happens to share an ID or tag name.

**Vulnerable pattern** — two independent lookups that can resolve to different nodes:

```javascript
// VULNERABLE: signature check and attribute extraction query the DOM independently
const isValid = SignatureVerifier.verifyById(samlResponse, "ID_123"); // checks one node
const username = samlResponse.querySelector("Assertion Subject").textContent; // reads the FIRST matching node — may differ!

if (isValid) {
  loginAs(username); // username may belong to a completely different, unsigned assertion
}
```

**Secure pattern** — extract attributes only from the exact DOM node object the verifier returned:

```javascript
// Secure Pattern: Extract attributes directly from the verified DOM node
const verifiedNode = SignatureVerifier.verify(samlResponse); // returns the actual signed node reference
const username = verifiedNode.getElementsByTagName("Subject")[0].textContent;
```

The key difference: `verifiedNode` is the literal object reference the signature math was computed over, so there is no second lookup step where an attacker's document restructuring can substitute a different node.

### 3. Require Signing of Both Response and Assertion

The Identity Provider (IdP) should sign both the `<samlp:Response>` outer element and the individual `<saml:Assertion>` inner elements. This binds the assertion hierarchy directly to the response container, making it impossible to insert wrapper elements or shuffle assertion nodes without invalidating the outer signature.

### 4. Absolute Path Constraints

Avoid using deep-descent XPath queries (e.g., `//Assertion`) when extracting data. Use absolute, strict paths (e.g., `/samlp:Response/saml:Assertion`) to prevent the parser from accidentally selecting nested or wrapped nodes that an attacker positioned to intercept a loosely-scoped query.

## Key Takeaways

- XSW does not forge a signature — it exploits the gap between *which node the signature verifier checked* and *which node the application read attributes from*.
- A response can be "validly signed" and still carry attacker-controlled identity data, if the signed and read nodes diverge.
- The only reliable fix is to make signature verification return a direct reference to the verified node, and extract every attribute from that exact reference — never re-query the document by ID, tag name, or a deep-descent XPath.
- Signing both the outer `<Response>` and the inner `<Assertion>`, plus strict XSD schema validation that rejects unexpected wrapper elements, closes the structural ambiguity XSW depends on.
