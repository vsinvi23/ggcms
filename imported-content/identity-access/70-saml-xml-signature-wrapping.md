# SAML XML Signature Wrapping (XSW): Attack Mechanics and Defenses

### The Problem: Schema Flexibility and Decoupled Processing
Security Assertion Markup Language (SAML) 2.0 remains a foundational standard for enterprise Single Sign-On (SSO). However, SAML relies heavily on XML, a format notorious for its semantic complexity and parser inconsistencies. The most critical vulnerability class affecting SAML Service Providers (SPs) is XML Signature Wrapping (XSW). 

XSW occurs when an attacker modifies a valid SAML Response by injecting a forged, malicious assertion while keeping the original, cryptographically signed assertion intact. Because XML parsers and cryptographic libraries often process documents in decoupled stages, the cryptographic library verifies the signature on the original assertion, while the application's business logic parses and acts upon the forged assertion. This mismatch allows an attacker to impersonate any user within the enterprise.

### Mental Model: The Dual-Parser Desynchronization
Imagine a security guard checking a luggage bag. The cryptographic verifier looks at the top compartment, sees a valid seal, and approves the bag. The business logic parser then opens the bottom compartment, extracts the contents, and processes them. 

```
[ XML Document Root ]
  ├── [ Unsigned / Forged Block ] ---> Business Logic reads this (Malicious User)
  └── [ Cryptographically Signed Block ] ---> Signature Verifier validates this (Valid User)
```

In an XSW attack, the logical structure of the XML document is rearranged to exploit this desynchronization.

### Attack Vector Anatomy: Restructuring the Assertion
There are multiple variants of XSW (often categorized XSW1 through XSW8) based on how the forged assertion is positioned relative to the original signature.

```
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
    <Assertion ID="ID_123"> <!-- Original Assertion -->
      <Subject>alice@example.com</Subject>
      <Signature>...</Signature> <!-- Signature still verifies ID_123 -->
    </Assertion>
  </WrapperElement>
</Response>
```

In this classic XSW variant:
1.  The attacker intercepts a legitimate SAML assertion issued for `alice@example.com`.
2.  The attacker copies the legitimate `<Assertion>` block and wraps it inside a new element (e.g., `<WrapperElement>`).
3.  The attacker inserts a fake `<Assertion>` block at the original path with a modified subject, `admin@example.com`.
4.  When the Service Provider processes this document:
    *   The digital signature verifier uses an XPath query like `//*[@ID='ID_123']` to locate the signed assertion. It finds the original block and confirms the signature is valid.
    *   The authorization engine retrieves the user identity using a simple relative query like `/Response/Assertion/Subject`. It extracts `admin@example.com` from the first Assertion block and logs the attacker in as administrator.

### Defensive Hardening Strategies

Defending against XSW requires eliminating any structural ambiguity in the incoming XML payload. Service Providers must enforce the following cryptographic and parsing policies:

#### 1. One-Pass Validation and Schema Enforcement
Perform strict XML Schema Validation (XSD) against the SAML schema before any cryptographic or business processing begins. Reject any responses containing unexpected wrapper elements, duplicate assertions, or elements in non-standard namespaces.

#### 2. Synchronize Signature and Extraction Queries
Never use disconnected XPath queries for verification and extraction. The application must guarantee that the exact XML element that passed cryptographic signature verification is the one from which user attributes (such as NameID or roles) are extracted.
*   **Secure Implementation Pattern:**
    ```javascript
    // Secure Pattern: Extract attributes directly from the verified DOM node
    const verifiedNode = SignatureVerifier.verify(samlResponse);
    const username = verifiedNode.getElementsByTagName("Subject")[0].textContent;
    ```

#### 3. Require Signing of Both Response and Assertion
The Identity Provider (IdP) should sign both the `<samlp:Response>` outer element and the individual `<saml:Assertion>` inner elements. This binds the assertion hierarchy directly to the response container, making it impossible to insert wrapper elements or shuffle assertion nodes without invalidating the outer signature.

#### 4. Absolute Path Constraints
Avoid using deep-descent XPath queries (e.g., `//Assertion`) when extracting data. Use absolute, strict paths (e.g., `/samlp:Response/saml:Assertion`) to prevent the parser from accidentally selecting nested or wrapped nodes.
