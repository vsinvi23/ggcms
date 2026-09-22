---
title: "Defeating SAML XML Signature Wrapping Exploits in Java"
description: "How XML Signature Wrapping (XSW) lets an attacker forge a SAML identity by exploiting the gap between what's cryptographically verified and what business logic reads, with a Java DOM validation implementation that closes it."
categorySlug: "identity-access"
articleType: "DEEP_DIVE"
tags:
  - "saml"
  - "xml-signature-wrapping"
  - "java"
  - "xml-security"
  - "account-takeover"
  - "dom-validation"
---

# Defeating SAML XML Signature Wrapping Exploits in Java

## The Problem: The Ambiguity of XML DOM Parsing

SAML 2.0 relies on XML Signatures (XMLDSig) to ensure the Identity Provider (IdP) legitimately issued an authentication assertion.

A severe vulnerability class known as **XML Signature Wrapping (XSW)** exists because of a disconnect between *what the signature verifies* and *what the application consumes*. An XML document can contain multiple `<Assertion>` elements. The XML Signature typically includes a `<Reference URI="#ID-123">` pointing to the specific assertion it signs. An attacker intercepts a valid SAML response, moves the legitimate signed assertion to a different part of the tree (e.g. inside `<Extensions>`), and injects a *forged* assertion at the location the Service Provider (SP) expects to find it — sometimes reusing the same ID, sometimes a different one.

If the SP's signature library blindly searches for `#ID-123` to verify the math, it returns `true`. If the SP's business logic separately parses the *first* `<Assertion>` in the DOM to extract the `NameID`, it processes the attacker's forged assertion — complete account takeover.

## The Solution: Strict DOM ID Referencing

To defeat XSW, the validation logic and the business logic must operate on the *exact same DOM node*. The validation library must assert that the element it just verified is the same element the application then reads claims from — not merely "an element with a matching ID somewhere."

## Architectural Diagram: XSW Attack

```text
=== LEGITIMATE SAML RESPONSE ===
<Response>
   <Assertion ID="123">            <-- Application reads this
      <Issuer>IdP</Issuer>
      <NameID>alice</NameID>
      <Signature>
         <Reference URI="#123"/>   <-- Signature verifies this
      </Signature>
   </Assertion>
</Response>

=== MALICIOUS XSW ATTACK PAYLOAD ===
<Response>
   <Assertion ID="evil">           <-- Application reads this (Forged!)
      <Issuer>IdP</Issuer>
      <NameID>admin</NameID>       <-- Privilege Escalation!
   </Assertion>
   <Extensions>
      <Assertion ID="123">         <-- Signature library verifies this (Valid!)
         <Issuer>IdP</Issuer>
         <NameID>alice</NameID>
         <Signature>
            <Reference URI="#123"/>
         </Signature>
      </Assertion>
   </Extensions>
</Response>
```

The signature math checks out on `ID="123"` — it always did, nothing about that assertion was tampered with. The attack works entirely by getting the *business logic* to look somewhere else.

## Implementation: Secure XML Validation Logic (Java)

To prevent this using standard DOM and security libraries, enforce ID uniqueness, validate against a strict XSD schema, and ensure the signature's reference directly matches the DOM node the application will read from.

```java
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import javax.xml.crypto.dsig.XMLSignature;
import javax.xml.crypto.dsig.XMLSignatureFactory;
import javax.xml.crypto.dsig.dom.DOMValidateContext;

public class SamlValidator {

    public boolean validateSamlResponse(Document document, PublicKey idpKey) throws Exception {
        // 1. Schema Validation (Prevents injecting Assertions into <Extensions>)
        validateAgainstSchema(document, "saml-schema-protocol-2.0.xsd");

        // 2. Locate the Signature element strictly within the expected Assertion
        NodeList signatureNodes = document.getElementsByTagNameNS(XMLSignature.XMLNS, "Signature");
        if (signatureNodes.getLength() != 1) {
            throw new SecurityException("Require exactly one Signature to prevent multi-node confusion.");
        }
        Element sigElement = (Element) signatureNodes.item(0);

        // 3. Initialize Validation Context
        DOMValidateContext valContext = new DOMValidateContext(idpKey, sigElement);

        // CRITICAL: Prevent ID attribute confusion by strictly registering the ID attribute
        // Some DOM parsers do not automatically recognize "ID" as an XML ID attribute.
        valContext.setIdAttributeNS((Element) sigElement.getParentNode(), null, "ID");

        XMLSignatureFactory fac = XMLSignatureFactory.getInstance("DOM");
        XMLSignature signature = fac.unmarshalXMLSignature(valContext);

        // 4. Validate cryptographic signature
        boolean isValid = signature.validate(valContext);

        if (isValid) {
            // 5. CRITICAL: Ensure the reference URI points to the exact node we are processing
            String referenceUri = signature.getSignedInfo().getReferences().get(0).getURI();
            String parentId = ((Element) sigElement.getParentNode()).getAttribute("ID");

            if (!referenceUri.equals("#" + parentId)) {
                 throw new SecurityException("XSW Detected: Signature Reference mismatch.");
            }
        }

        return isValid;
    }
}
```

The critical line is step 5: after the cryptographic math passes, the code independently confirms that the `Reference URI` the signature actually covered points at the *same* `Assertion` element whose `ID` attribute the caller is about to read `NameID` from. Skipping this check is precisely the gap an XSW payload is built to exploit — signature validation succeeding is necessary but not sufficient.

## Engineering Considerations

1. **Disable DTD/XXE**: always disable XML External Entities when parsing SAML responses — `factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)`.
2. **Library Selection**: do not write custom SAML parsing logic from scratch. Use hardened, actively maintained libraries like OpenSAML, which have built-in XSW mitigations and DOM sanity checks baked in.
3. **Response vs. Assertion Signing**: for defense-in-depth, configure the IdP to sign *both* the SAML `<Response>` root element and the `<Assertion>` element. Signing the whole document structurally seals it, making the kind of node-shuffling XSW depends on impossible.
