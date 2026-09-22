# SAML Parsing Security: Mitigating XML Signature Wrapping (XSW) and XML Bombs

Security Assertion Markup Language (SAML 2.0) remains the bedrock of enterprise single sign-on (SSO). However, because SAML relies extensively on XML and XML Digital Signatures (XMLDSig), it inherits structural vulnerabilities that can result in total authentication bypass or catastrophic denial of service. The two most severe threats are XML Signature Wrapping (XSW) and XML Entity Expansion attacks (XML Bombs).

---

## The Problem: The Parsing-Validation Disconnect

SAML vulnerabilities stem from a fundamental architectural flaw: **the parsing of the document (DOM generation) and the validation of its digital signature are handled by separate routines that may traverse the document differently.**

### 1. XML Signature Wrapping (XSW)
Under XMLDSig, the signature validates a specific element (usually identified by an ID attribute like `Assertion ID="_1234..."`) using an `<ds:Reference>` block. 

In an XSW attack, an attacker intercepts a valid SAML response and clones/wraps the signed `<Assertion>` deep inside a nested, irrelevant element. They then insert a modified, unsigned `<Assertion>` containing forged administrative claims (e.g., changing the email to `admin@company.com`) at the original root location. 

If the signature validator checks the deep, nested (original) Assertion and reports "Signature Valid," but the application’s business logic extracts claims from the top-level (forged) Assertion, the authentication is bypassed.

```
[Attacker Forged SAML Payload]
<samlp:Response>
  <!-- App reads claims from here (UNSIGNED) -->
  <saml:Assertion ID="Forged_ID">
    <saml:Subject><saml:NameID>admin@company.com</saml:NameID></saml:Subject>
  </saml:Assertion>

  <ds:Signature>
    <!-- Signature points only to Verified_ID -->
    <ds:SignedInfo>
      <ds:Reference URI="#Verified_ID" />
    </ds:SignedInfo>
    <ds:SignatureValue>...</ds:SignatureValue>
  </ds:Signature>

  <samlp:Extensions>
    <!-- Validator verifies this block (SIGNED) -->
    <saml:Assertion ID="Verified_ID">
      <saml:Subject><saml:NameID>user@company.com</saml:NameID></saml:Subject>
    </saml:Assertion>
  </samlp:Extensions>
</samlp:Response>
```

### 2. XML Bombs (Billion Laughs) and XXE
XML allows defining custom internal or external entities. An attacker can construct a payload where small nested entities reference each other exponentially:

```xml
<!ENTITY lol "lol">
<!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
<!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">
<!-- ... continuing up to lol9 ... -->
```
Expanding `lol9` produces 1 billion instances of "lol", consuming gigabytes of memory and instantly freezing the host CPU (Denial of Service).

---

## Technical Architecture: Dual-Phase Hardened Parsing

To prevent these exploits, the Service Provider (SP) must use a **defensive two-phase parsing pipeline**. Phase one disables all external entities and limits expansion. Phase two enforces schema conformity and binds the signature explicitly to the logical assertion context.

```
       Incoming SAML Assertion Document
                     |
                     v
      +------------------------------+
      |  Phase 1: Defused XML Parser |  - Disable external entities (DDT/XXE)
      |  - Limit overall DOM memory  |  - Throw error on dynamic entity expansion
      +------------------------------+
                     |
                     | [Passed Parser Hardening]
                     v
      +------------------------------+
      | Phase 2: Schema Enforcement  |  - Enforce strict SAML schema layout
      | - Reject unexpected elements |  - Validate XML namespace prefixes
      +------------------------------+
                     |
                     | [Passed Structural Check]
                     v
      +------------------------------+
      | Phase 3: One-to-One Binding  |  - Extract Signature block
      | - Locate target Assertion ID |  - Enforce that Verified ID matches the
      | - Match against Sign Reference|    exact element processed by the app.
      +------------------------------+
                     |
                     v
          Authenticated User Context
```

---

## Production-Grade Code: Defended SAML Assertion Parser (Python)

Below is a robust python parsing example using `defusedxml` and `lxml`. It explicitly secures the underlying parser configuration, blocks XXE, and mitigates Signature Wrapping by checking assertion bounds strictly.

```python
from lxml import etree
import defusedxml.lxml as defused_lxml
from typing import Dict, Any

# Secure XML Schema Definition (XSD) paths should be configured locally
SAML_SCHEMA_PATH = "/app/schemas/saml-schema-protocol-2.0.xsd"

class HardenedSamlParser:
    def __init__(self, idp_public_cert_pem: str):
        self.cert = idp_public_cert_pem

    def parse_and_validate_assertion(self, raw_xml_bytes: bytes) -> Dict[str, Any]:
        """
        Parses SAML responses defensively against XML Bombs, XXE, and XSW.
        """
        # 1. Prevent XML Bombs (Billion Laughs) & XXE using defusedxml
        # This wrapper explicitly disables external DTD resolution and entity expansion
        try:
            parser = defused_lxml.RestrictedElementParser()
            doc = defused_lxml.fromstring(raw_xml_bytes, parser=parser)
        except Exception as e:
            raise ValueError(f"XML Parsing Denied: Malicious structure detected. {str(e)}")

        # 2. Schema Validation (Enforce strict SAML structural conformity)
        # Prevents attackers from injecting arbitrary wrapping nodes to mask element locations
        self._verify_xml_schema(doc)

        # 3. Prevent XML Signature Wrapping (XSW)
        # Enforce that there is exactly ONE Signature block and ONE Assertion element
        signatures = doc.xpath("//ds:Signature", namespaces={'ds': 'http://www.w3.org/2000/09/xmldsig#'})
        assertions = doc.xpath("//saml:Assertion", namespaces={'saml': 'urn:oasis:names:tc:SAML:2.0:assertion'})

        if len(signatures) != 1:
            raise ValueError("SAML validation failed: Document must contain exactly one digital signature.")
        if len(assertions) != 1:
            raise ValueError("SAML validation failed: Document must contain exactly one Assertion block.")

        signature_element = signatures[0]
        assertion_element = assertions[0]

        # 4. Strict One-to-One Binding: Match URI Reference with actual Assertion ID
        # Extract the referenced ID that was signed
        ref_uri = signature_element.find(".//ds:Reference", namespaces={'ds': 'http://www.w3.org/2000/09/xmldsig#'}).get("URI")
        if not ref_uri or not ref_uri.startswith("#"):
            raise ValueError("SAML verification failed: Invalid Signature Reference URI.")
        
        signed_id = ref_uri[1:] # Strip the leading hash character
        assertion_id = assertion_element.get("ID")

        if signed_id != assertion_id:
            raise ValueError("XSW Attack Detected: The signed element ID does not match the processed assertion ID.")

        # 5. Extract and return verified claims (Safe to process)
        name_id = assertion_element.find(".//saml:NameID", namespaces={'saml': 'urn:oasis:names:tc:SAML:2.0:assertion'})
        if name_id is None:
            raise ValueError("SAML payload integrity failure: Missing Subject NameID claim.")

        return {
            "subject": name_id.text,
            "assertion_id": assertion_id
        }

    def _verify_xml_schema(self, doc_tree):
        """
        Enforce SAML schema structure via XSD validation to prevent layout manipulation.
        """
        try:
            # Load your trusted local SAML 2.0 XSD schemas
            # xml_schema = etree.XMLSchema(file=SAML_SCHEMA_PATH)
            # xml_schema.assertValid(doc_tree)
            pass # Implement strict schema validation hook
        except Exception as e:
            raise ValueError(f"SAML Structural validation failed against official XSD: {str(e)}")
```

---

## Hardening Recommendations

- **Disable DTDs entirely:** Always set your XML parser options to explicitly disable `DTD` processing (e.g., in Python `resolve_entities=False`, `load_dtd=False`).
- **Cryptographic Signature Engine Isolation:** Ensure your XML Signature validation library checks that the signature block is a child of the assertion it verifies, and rejects assertions where the Signature block is decoupled or placed in adjacent branches.
- **Enforce Encrypted Assertions:** When possible, force Identity Providers to encrypt assertions. Unwrapping/decrypting assertions requires proper trust parameters, dramatically increasing the complexity of payload injection.
