# SAML Parsing Security: Mitigating XML Signature Wrapping (XSW) and XML Bombs

## The Problem: The Disconnect Between XML Signature Validation and Document Consumption

Security architectures implementing SAML 2.0 frequently face severe vulnerabilities due to the complexity of the underlying XML standards. Two of the most devastating vulnerabilities in SAML Service Providers (SPs) are **XML Signature Wrapping (XSW)** and **XML Entity Expansion (XML Bombs)**.

XML Signature Wrapping (XSW) exploits a fundamental design flaw: the module that *verifies the cryptographic signature* of an XML document and the module that *extracts the identity claims for business logic* look at different parts of the XML DOM tree. 

In a typical XSW attack, an attacker intercepts a valid SAML response and clones the legitimate, signed `<Assertion>` element. They modify the original assertion's user identity to `admin` (rendering its signature invalid), but wrap the valid, cloned assertion deep inside an auxiliary element (like `<Extensions>`). The validator verifies the valid signature of the wrapped assertion and reports success. Meanwhile, the business logic mistakenly extracts the user identifier from the modified, unsigned assertion at the root of the document, granting unauthorized administrative access.

Simultaneously, traditional XML parsers are susceptible to XML Entity Expansion attacks (e.g., the "Billion Laughs" attack), where nested custom entities cause the parser to consume gigabytes of memory, resulting in an immediate denial of service (DoS).

---

## Architectural Blueprint: The XML Signature Wrapping (XSW) Attack Mechanics

The diagram below shows how an XSW attack misleads the validation engine by separating the verification target from the business logic target.

```
       [ Attacker's Intercepted SAML Response Payload ]
       
<samlp:Response>
  |
  +-- <saml:Assertion ID="unsigned_evil">  <-- Read by Business Logic (Claims: Admin)
  |     |
  |     +-- <saml:Subject>admin@enterprise.com</saml:Subject>
  |
  +-- <saml:Extensions>
        |
        +-- <saml:Assertion ID="signed_legit"> <-- Verified by Signature Engine
              |                                  (Claims: NormalUser)
              +-- <ds:Signature> ... </ds:Signature>
```

---

## Technical Implementation

Below is a robust Python implementation demonstrating how to parse and validate SAML XML documents securely. It disables external entity resolution to prevent XML bombs, and implements strict ID-to-Signature cross-referencing to prevent XML Signature Wrapping (XSW).

```python
import defusedxml.ElementTree as ET
from lxml import etree
import xmlsec

class SecureSAMLParser:
    def __init__(self, trusted_cert_pem_path: str):
        self.trusted_cert_path = trusted_cert_pem_path

    def parse_and_verify_assertion(self, raw_xml_bytes: bytes) -> dict:
        """
        Parses SAML XML safely and cryptographically verifies the assertion structure.
        Ensures the signed element matches the consumed element to prevent XSW.
        """
        # 1. Defend against XML Bombs and XXE using defusedxml for initial parse
        try:
            # defusedxml blocks external entity definitions and entity expansion limit abuses
            safe_tree = ET.fromstring(raw_xml_bytes)
        except Exception as e:
            raise ValueError(f"XML_PARSING_FAILED: Potential entity expansion or malformed XML. Detail: {str(e)}")

        # 2. Parse with lxml for advanced schema/xmlsec validation (with external entities disabled)
        parser = etree.XMLParser(resolve_entities=False, no_network=True)
        try:
            doc = etree.fromstring(raw_xml_bytes, parser=parser)
        except Exception as e:
            raise ValueError(f"SECURE_PARSING_FAILED: {str(e)}")

        # 3. Locate the Signature Element
        signature_node = xmlsec.tree.find_node(doc, xmlsec.Node.SIGNATURE)
        if signature_node is None:
            raise PermissionError("SECURITY_VIOLATION: Missing cryptographic signature in SAML payload")

        # 4. Extract the 'URI' attribute of the Reference to find what the signature claims to verify
        ref_nodes = signature_node.findall(".//{http://www.w3.org/2000/09/xmldsig#}Reference")
        if not ref_nodes or len(ref_nodes) != 1:
            raise PermissionError("SECURITY_VIOLATION: XML Signature must contain exactly one Reference element")

        reference_uri = ref_nodes[0].get("URI")
        if not reference_uri or not reference_uri.startswith("#"):
            raise PermissionError("SECURITY_VIOLATION: Signature Reference URI must reference a local ID in the document")

        target_id = reference_uri[1:]  # Strip the '#' prefix

        # 5. Locate the exact element containing the ID attribute that matches the signature Reference
        # To mitigate XSW, we query elements with the matching ID attribute
        signed_elements = doc.xpath(f"//*[@ID='{target_id}']")
        if not signed_elements or len(signed_elements) != 1:
            raise PermissionError("SECURITY_VIOLATION: Signature Reference ID does not map to a unique element")

        signed_element = signed_elements[0]

        # 6. Strict Structural Check: The signed element MUST be the <Assertion> element at the expected depth
        expected_tag = "{urn:oasis:names:tc:SAML:2.0:assertion}Assertion"
        if signed_element.tag != expected_tag:
            raise PermissionError(f"SECURITY_VIOLATION: The signed element is a {signed_element.tag}, not the expected SAML Assertion")

        # Ensure the Signature node is an immediate child of the element it asserts to sign
        parent_of_signature = signature_node.getparent()
        if parent_of_signature != signed_element:
            raise PermissionError("SECURITY_VIOLATION: Signature element location is decoupled from signed assertion element")

        # 7. Execute Cryptographic Verification
        ctx = xmlsec.KeysManager()
        try:
            key = xmlsec.Key.from_file(self.trusted_cert_path, xmlsec.KeyFormat.CERT_PEM)
            ctx.add_key(key)
        except Exception as e:
            raise RuntimeError(f"KEY_LOAD_FAILED: {str(e)}")

        dsig_ctx = xmlsec.SignatureContext(ctx)
        try:
            dsig_ctx.verify(signature_node)
        except Exception as e:
            raise PermissionError(f"CRYPTOGRAPHIC_VERIFICATION_FAILED: Signature verification error. Detail: {str(e)}")

        # 8. Extract Identity Safely: strictly use only attributes from the validated signed_element
        subject_node = signed_element.find(".//{urn:oasis:names:tc:SAML:2.0:assertion}Subject")
        if subject_node is None:
            raise PermissionError("SECURITY_VIOLATION: Validated assertion is missing Subject node")

        name_id_node = subject_node.find(".//{urn:oasis:names:tc:SAML:2.0:assertion}NameID")
        if name_id_node is None or not name_id_node.text:
            raise PermissionError("SECURITY_VIOLATION: Validated assertion is missing Subject NameID text")

        return {
            "name_id": name_id_node.text.strip(),
            "assertion_id": target_id
        }
```

---

## Defensive Hardening Checklist

1. **Disable Entity Resolution**: Always configure your XML parser to block external entity resolution (`DED/DTD` expansion, `resolve_entities=False`, `no_network=True`) to eliminate XML External Entity (XXE) and DoS attacks.
2. **Correlate Signed Element ID**: Never verify a signature in a document and then locate the identity assertion element using a separate, independent query (like `doc.find("Assertion")`). Always locate the exact node referenced by the signature's `URI` attribute.
3. **Validate Signature Placement**: Ensure the signature block is contained directly inside the element it signs, rather than allowing detached signatures placed elsewhere in the XML hierarchy.
