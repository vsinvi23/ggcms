# SAML Parsing Security: Mitigating XML Signature Wrapping (XSW) and XML Bombs

## The Problem
Security Assertion Markup Language (SAML) relies heavily on XML and XML Signatures (XMLDSig). Because XML is incredibly complex and flexible, poorly configured SAML parsers are vulnerable to devastating attacks. The two most critical are XML Signature Wrapping (XSW), where attackers bypass signature validation to escalate privileges, and XML Bombs (Billion Laughs), which cause Denial of Service (DoS) via entity expansion.

## XML Signature Wrapping (XSW)
In an XSW attack, the attacker manipulates the XML structure. The parser validates the signature against one part of the document (the original, valid assertion) but extracts the business logic (e.g., user identity, roles) from a different, attacker-injected part of the document.

### XSW Attack Architecture
```text
Original Valid SAML:
<Response>
  <Assertion ID="1" (Signed)>
     <Subject>alice@acme.com</Subject>
  </Assertion>
  <Signature Reference="#1" />
</Response>

Attacker Manipulated SAML (XSW):
<Response>
  <Assertion ID="Evil">
     <Subject>admin@acme.com</Subject> <!-- Parser reads this -->
  </Assertion>
  <Signature Reference="#1" /> <!-- Validator checks this -->
  <Wrapper>
     <Assertion ID="1" (Original)> <!-- Stashed valid assertion -->
        <Subject>alice@acme.com</Subject>
     </Assertion>
  </Wrapper>
</Response>
```
If the Service Provider (SP) validates the signature by finding `<Signature>` and resolving `Reference="#1"`, the validation passes. If the SP then blindly reads the *first* `<Assertion>` in the DOM to map the user, it processes the evil assertion.

### Mitigation: Strict Reference Resolution
To prevent XSW, the validation logic must assert that the XML node that was signed is the *exact same node* used for business logic extraction.

```java
// Java example conceptual mitigation
import org.opensaml.saml.saml2.core.Assertion;
import org.opensaml.saml.saml2.core.Response;

public void validateSamlResponse(Response response) {
    // 1. Decrypt if necessary
    // 2. Validate the Signature on the Response or Assertion
    
    // BAD: Blindly grabbing the first assertion
    // Assertion assertion = response.getAssertions().get(0); 

    // GOOD: Ensure the assertion processed is the one that was validated
    for (Assertion assertion : response.getAssertions()) {
        if (!assertion.isSigned() && !response.isSigned()) {
            throw new SecurityException("Unsigned assertion detected");
        }
        
        // The underlying SAML library (like OpenSAML) must map the 
        // DOM element verified by the signature engine directly to this object.
        processAssertion(assertion);
    }
}
```
**Rule of Thumb:** Never write your own SAML parser. Always use battle-tested libraries (OpenSAML, `passport-saml`, `pysaml2`) and keep them strictly up to date.

## XML Bombs (Entity Expansion DoS)
An XML Bomb uses nested entity declarations. A tiny XML payload expands exponentially in memory during parsing, crashing the server.

```xml
<!-- Billion Laughs Attack -->
<!DOCTYPE lolz [
 <!ENTITY lol "lol">
 <!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
 <!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">
 <!-- ... up to lol9 ... -->
]>
<Response>&lol9;</Response>
```

### Mitigation: Disabling DTDs
The only secure way to parse SAML is to explicitly disable Document Type Definitions (DTDs) and external entity resolution in the XML parser.

```python
# Python mitigation using lxml
from lxml import etree

def secure_parse_saml(xml_string):
    # CRITICAL: Disable entity resolution and DTDs
    parser = etree.XMLParser(
        resolve_entities=False, 
        no_network=True, 
        huge_tree=False
    )
    
    try:
        root = etree.fromstring(xml_string, parser)
        return root
    except etree.XMLSyntaxError as e:
        raise Exception("Invalid or malicious XML detected")
```

If you are using a managed IdP or API Gateway, ensure Web Application Firewall (WAF) rules are configured to block `<DOCTYPE` declarations in SAML endpoints.
