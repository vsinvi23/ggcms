---
title: "Defending SAML Assertions Against XML Signature Wrapping in Python"
description: "A deep dive into XML Signature Wrapping (XSW) and XML entity expansion attacks against SAML Service Providers, with a hardened Python parser that correlates the signed element ID to the exact node consumed by business logic."
categorySlug: "identity-access"
articleType: "DEEP_DIVE"
tags:
  - "saml"
  - "xml-signature-wrapping"
  - "xxe"
  - "xml-security"
  - "python"
  - "account-takeover"
---

# Defending SAML Assertions Against XML Signature Wrapping in Python

## The Problem: The Disconnect Between XML Signature Validation and Document Consumption

SAML 2.0 Service Providers (SPs) frequently fall to two devastating vulnerability classes rooted in XML's complexity: **XML Signature Wrapping (XSW)** and **XML entity expansion ("XML bombs")**.

XSW exploits a fundamental design flaw: the module that *verifies the cryptographic signature* of an XML document and the module that *extracts identity claims for business logic* can end up looking at different parts of the XML DOM tree. In a typical XSW attack, the attacker intercepts a valid SAML response, clones the legitimate, signed `<Assertion>` element, modifies the clone's identity to `admin` (which invalidates that clone's own signature), then wraps the *original, still-validly-signed* assertion deep inside an auxiliary element like `<Extensions>`. The validator checks the signature, finds it valid — because it's checking the untouched original, now hidden — and reports success. Meanwhile, the business logic reads the user identifier from the *modified, unsigned* assertion sitting at the document root, granting unauthorized access.

Simultaneously, XML parsers are vulnerable to entity expansion attacks (e.g. "Billion Laughs"), where nested custom entities force the parser to consume gigabytes of memory — an immediate denial of service.

---

## Architectural Blueprint: The XSW Attack Mechanics

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

The verification engine and the business logic disagree about which `<Assertion>` node is "the" assertion — and the attacker exploits exactly that disagreement.

---

## Technical Implementation

Below is a Python implementation for parsing and validating SAML XML safely: it disables external entity resolution to prevent XML bombs, and enforces strict ID-to-signature cross-referencing to prevent XSW — the signature's `Reference URI` must resolve to the exact element the business logic subsequently reads claims from.

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

1. **Disable Entity Resolution**: always configure the XML parser to block external entity resolution (`resolve_entities=False`, `no_network=True`) to eliminate XXE and entity-expansion DoS attacks.
2. **Correlate Signed Element ID**: never verify a signature in a document and then locate the identity assertion via a *separate, independent* query (like `doc.find("Assertion")`). Always locate the exact node referenced by the signature's `Reference URI`, as step 5 above does.
3. **Validate Signature Placement**: ensure the signature block sits directly inside the element it signs (step 6), rather than allowing a detached signature to sit anywhere else in the document hierarchy.
4. **Reject Ambiguous Structure**: if the reference ID matches more than one element, or the document contains more than one `<Signature>` where exactly one was expected, reject the assertion rather than picking one arbitrarily.
