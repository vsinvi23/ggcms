# SAML Assertion Security: Defeating XML Signature Wrapping (XSW) Exploits

## The Problem: The Ambiguity of XML DOM Parsing
Security Assertion Markup Language (SAML) 2.0 relies on XML Signatures (XMLDSig) to ensure that the Identity Provider (IdP) legitimately issued the authentication assertion. 

A severe class of vulnerabilities known as **XML Signature Wrapping (XSW)** occurs because of a disconnect between *what the signature verifies* and *what the application consumes*.

An XML document can contain multiple `<Assertion>` elements. The XML Signature typically contains a `<Reference URI="#ID-123">` pointing to the specific assertion it signs. An attacker can intercept a valid SAML response, move the legitimate signed assertion to a different part of the XML tree (e.g., inside an `<Extensions>` block), and inject a *forged* assertion with the same ID or a different ID at the location the Service Provider (SP) expects to find it.

If the SP's signature validation library blindly searches for `#ID-123` to verify the math, it will return `TRUE`. But if the SP's business logic blindly parses the *first* `<Assertion>` in the DOM to extract the `NameID` (user identity), it will process the attacker's forged assertion, resulting in complete account takeover.

## The Solution: Strict DOM ID Referencing
To defeat XSW, the validation logic and the business logic must operate on the exact same DOM node. The validation library must assert that the element verified by the signature is the *exact same element* from which the application extracts user claims. Furthermore, schema validation (XSD) must enforce the exact placement of signed elements.

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

## Implementation: Secure XML Validation Logic (Java)
To prevent this in Java using standard DOM and security libraries, you must enforce ID uniqueness, validate against a strict XSD schema, and ensure the signature reference directly matches the parsed DOM node.

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

## Engineering Considerations
1. **Disable DTD/XXE:** Always disable XML External Entities (XXE) when parsing SAML responses. `factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)`.
2. **Library Selection:** Do not write custom SAML parsing logic. Use hardened, actively maintained libraries like OpenSAML, which possess built-in XSW mitigations and DOM sanity checks.
3. **Response vs. Assertion Signing:** For defense-in-depth, configure the IdP to sign *both* the SAML `<Response>` root element and the `<Assertion>` element. This cryptographically seals the structure of the entire document, making XSW structural shifting impossible.