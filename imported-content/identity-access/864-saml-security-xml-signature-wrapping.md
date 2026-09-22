# SAML Parsing Security: Mitigating XML Signature Wrapping (XSW) and XML Bombs

## The Problem: The Inherent Complexity of XML Parsing and Verification

Security Assertion Markup Language (SAML) remains a foundational pillar for enterprise Single Sign-On (SSO). However, because SAML relies strictly on Extensible Markup Language (XML), it inherits XML's massive security attack surface. 

Two critical vulnerabilities consistently threaten SAML Service Providers (SPs):
1. **XML Signature Wrapping (XSW):** A structural mismatch between how the XML signature validation library validates the document and how the application-level parser retrieves elements. This allows an attacker to inject an unmodified, legitimately signed block alongside a modified, forged identity block. The signature validator passes the document, while the business logic consumes the forged block.
2. **XML Entity Attacks (XML Bombs & XXE):** Exploiting XML's nested entity expansion definitions to cause complete CPU/Memory resource exhaustion (e.g., the Billion Laughs Attack) or data exfiltration via External Entity Resolution.

---

## Technical Architecture

The following structural diagram illustrates an XML Signature Wrapping (XSW) attack payload. The XML signature verifies the unaltered assertion, but the application parser reads the cloned, malicious payload because of loose DOM traversal queries:

```
+---------------------------------------------------------------------------------+
|                                 SAML Response                                   |
|                                                                                 |
|   +-------------------------------------------------------------------------+   |
|   |  <saml:Assertion ID="Forged-456">                                       |   |
|   |     <saml:Subject>attacker@evil.com</saml:Subject>                       |   |
|   |  </saml:Assertion>                                                      |   |
|   +-------------------------------------------------------------------------+   |
|         | (Application parser extracts this user info, bypassing signature!)     |
|         |                                                                       |
|   +-------------------------------------------------------------------------+   |
|   |  <saml:Assertion ID="Signed-123">                                       |   |
|   |     <saml:Subject>legitimate@user.com</saml:Subject>                     |   |
|   |     <ds:Signature>                                                      |   |
|   |        <ds:SignedInfo>                                                  |   |
|   |           <ds:Reference URI="#Signed-123" />                            |   |
|   |        </ds:SignedInfo>                                                 |   |
|   |        <ds:SignatureValue>[Cryptographically Valid Signature]</ds:SignatureValue> |
|   |     </ds:Signature>                                                     |   |
|   |  </saml:Assertion>                                                      |   |
|   +-------------------------------------------------------------------------+   |
|         | (Signature verification engine validates this block cleanly)           |
+---------------------------------------------------------------------------------+
```

---

## Key Hardening Principles

### 1. Defusing XML Bombs (Disabling DTDs)
External DTDs and local entity resolutions must be explicitly disabled inside the XML parsing engine. This mitigates both XML Entity Expansion DoS attacks and XML External Entity (XXE) data leaks.

### 2. Precise Element-to-Signature Association
SAML SP software must never look up assertions independently of signatures. The signature validator must explicitly enforce that the DOM node validated by the signature is the exact same node containing the identity claims parsed by the application.

---

## Code Implementation: Node.js (TypeScript)

The following example shows how to configure a Node.js XML environment securely, preventing DTD expansions, and verifying signatures using explicit element bindings to prevent XSW.

```typescript
import { DOMParser } from '@xmldom/xmldom';
import * as xpath from 'xpath';
import * as xmlCrypto from 'xml-crypto';

export class SecureSAMLParser {
  private allowedCertPem: string;

  constructor(certPem: string) {
    this.allowedCertPem = certPem;
  }

  /**
   * Safely parses SAML response XML and mitigates XML Entity attacks.
   */
  public parseSecurely(rawXml: string): Document {
    // xmldom by default does not expand external entities or DTDs, 
    // but we enforce strict error boundaries to catch any parsing abnormalities.
    const parser = new DOMParser({
      errorHandler: {
        warning: (msg) => { throw new Error(`XML Parse Warning: ${msg}`); },
        error: (msg) => { throw new Error(`XML Parse Error: ${msg}`); },
        fatalError: (msg) => { throw new Error(`XML Parse Fatal: ${msg}`); }
      }
    });

    const doc = parser.parseFromString(rawXml, 'text/xml');
    
    // Explicitly reject any DTD injections manually if detected
    if (doc.toString().includes('<!DOCTYPE') || doc.toString().includes('<!ENTITY')) {
      throw new Error('SAML Parsing Security Block: Inline DTDs/Entities detected and blocked.');
    }

    return doc;
  }

  /**
   * Verifies XML Signature and enforces that the signed elements match target assertions.
   */
  public verifyAndExtractAssertion(doc: Document, targetAssertionId: string): string {
    const sig = new xmlCrypto.SignedXml();
    sig.keyInfoProvider = {
      getKeyInfo: () => `<X509Data><X509Certificate>${this.allowedCertPem}</X509Certificate></X509Data>`,
      getKey: () => this.allowedCertPem
    };

    // Locate the signature element inside the document
    const sigNode = xpath.select("//*[local-name()='Signature' and namespace-uri()='http://www.w3.org/2000/09/xmldsig#']", doc) as Node[];
    if (sigNode.length !== 1) {
      throw new Error('SAML Security Block: Exactly one XML signature is required.');
    }

    sig.loadSignature(sigNode[0].toString());
    const isValid = sig.checkSignature(doc.toString());

    if (!isValid) {
      throw new Error('SAML Security Block: Cryptographic XML signature is invalid.');
    }

    // Anti-XSW Check: Ensure the validated Reference URI matches the Assertion ID exactly
    const referenceUri = sig.references[0].uri;
    const sanitizedRefId = referenceUri.replace('#', '');
    
    if (sanitizedRefId !== targetAssertionId) {
      throw new Error('SAML Security Block: Signature Reference ID mismatch. Possible XSW attack.');
    }

    // Strict DOM Extraction: Locate the assertion matching the verified Reference ID
    const assertionNodes = xpath.select(
      `//*[local-name()='Assertion' and @ID='${targetAssertionId}']`, 
      doc
    ) as Element[];

    if (assertionNodes.length !== 1) {
      throw new Error('SAML Security Block: Target Assertion element matching validated ID not found or ambiguous.');
    }

    // Extract the identity subject securely
    const subjectEmail = xpath.select(
      "string(//*[local-name()='Subject']/*[local-name()='NameID'])", 
      assertionNodes[0]
    ) as string;

    if (!subjectEmail) {
      throw new Error('SAML Security Block: Subject NameID is missing from verified assertion.');
    }

    return subjectEmail;
  }
}
```

---

## Operational Verification

To verify your SAML endpoint:
- Construct an XSW-1 payload where a signed Assertion block is appended at the bottom, but a modified Assertion block with the same ID claim is placed at the top; verify that the parser detects the signature reference mapping mismatch and rejects the response.
- Inject a nested entity recursive payload (XML Bomb); verify that your system immediately throws a parsing exception rather than crashing the thread.
