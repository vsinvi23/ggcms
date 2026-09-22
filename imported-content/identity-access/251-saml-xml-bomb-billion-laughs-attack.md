# SAML Parsing Vulnerabilities: Defending Against the Billion Laughs (XML Bomb) Attack

## The Problem: The Hidden Dangers of Entity Expansion

Security Assertion Markup Language (SAML) remains a dominant protocol for enterprise Single Sign-On (SSO). Because SAML messages are heavily structured XML documents, the security of any SAML implementation relies entirely on the robustness of the underlying XML parser.

One of the most devastating attacks against XML parsers is the **Billion Laughs Attack**, also known as an XML Bomb. It is a Denial of Service (DoS) attack that exploits a feature of the XML specification called Document Type Definition (DTD) custom entities.

An XML entity is essentially a macro or a variable. You define it once, and the parser replaces references to it with its value. The Billion Laughs attack nests these entities exponentially.

```xml
<!-- A classic Billion Laughs Payload -->
<?xml version="1.0"?>
<!DOCTYPE lolz [
 <!ENTITY lol "lol">
 <!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
 <!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">
 <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
 <!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;">
 <!ENTITY lol5 "&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;">
 <!ENTITY lol6 "&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;">
 <!ENTITY lol7 "&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;&lol6;">
 <!ENTITY lol8 "&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;&lol7;">
 <!ENTITY lol9 "&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;&lol8;">
]>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
  <saml:Assertion>&lol9;</saml:Assertion>
</samlp:Response>
```

When a vulnerable Service Provider (SP) attempts to parse this SAML Response, it encounters `<saml:Assertion>&lol9;</saml:Assertion>`.
*   It resolves `&lol9;` to ten instances of `&lol8;`.
*   It resolves those ten instances to 100 instances of `&lol7;`.
*   This exponential expansion continues until it produces $10^9$ (one billion) instances of the string "lol".

A payload of less than 1 Kilobyte balloons in memory to over 3 Gigabytes. The CPU pegs at 100%, memory is exhausted, the application crashes, and all authentication services for the enterprise halt.

## The Mental Model: Choking the Parser

Think of the XML parser as an automated factory assembly line. Normally, it takes raw materials (XML tags) and builds a structured object in memory (a DOM tree). 

The XML Bomb is a set of malicious blueprints. It instructs the factory: "To build Part 9, you need ten Part 8s. To build Part 8, you need ten Part 7s..." 

Without a governor on the assembly line, the factory mindlessly follows the blueprints until it runs out of floor space (RAM) and collapses. The defense relies on stripping the factory of the ability to process custom blueprints entirely.

## Implementation Deep Dive: Disabling DTDs

The only definitive mitigation for XML Bombs—and related vulnerabilities like XML External Entity (XXE) injection—is to completely disable DTD processing and entity expansion in the XML parser used by your SAML library.

SAML specifications do not require custom entities. Therefore, any SAML assertion containing a `<!DOCTYPE>` declaration is highly anomalous and likely malicious.

### Defensive Configuration in Python (lxml)

If you are using the `lxml` library in Python (common in custom SAML integrations), you must configure the parser explicitly to reject DTDs and entity resolution.

```python
from lxml import etree

# SECURE PARSER CONFIGURATION
# resolve_entities=False prevents the Billion Laughs expansion
# no_network=True prevents XXE (external entity fetching)
secure_parser = etree.XMLParser(resolve_entities=False, no_network=True)

try:
    # Parsing the malicious SAML response
    # The parser will raise an exception if it encounters an entity it can't resolve,
    # rather than expanding it exponentially.
    root = etree.fromstring(malicious_saml_bytes, secure_parser)
except etree.XMLSyntaxError as e:
    log_security_event("Malformed XML or Entity Expansion attempted", e)
    abort_authentication()
```

### Defensive Configuration in Java (DocumentBuilderFactory)

In Java, parsing XML safely requires setting multiple specific features on the factory before instantiating the parser.

```java
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.DocumentBuilder;

DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();

try {
    // 1. Completely disable DTDs (This is the most critical step)
    dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);

    // 2. Disable external entities (Protects against XXE)
    dbf.setFeature("http://xml.org/sax/features/external-general-entities", false);
    dbf.setFeature("http://xml.org/sax/features/external-parameter-entities", false);

    // 3. Disable external DTDs
    dbf.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
    
    // 4. Set secure processing (provides baseline protection in modern Java)
    dbf.setFeature(javax.xml.XMLConstants.FEATURE_SECURE_PROCESSING, true);
    
    // XInclude is another way to trigger external loads, disable it.
    dbf.setXIncludeAware(false);
    dbf.setExpandEntityReferences(false);

    DocumentBuilder db = dbf.newDocumentBuilder();
    Document doc = db.parse(samlInputStream);

} catch (ParserConfigurationException e) {
    // Handle configuration error
}
```

## Architectural Defense

Relying solely on developers to configure parsers correctly is risky. Security teams should enforce defense-in-depth:

1.  **WAF/API Gateways:** Configure Web Application Firewalls to inspect incoming SAML POST payloads and immediately drop any XML containing `<!DOCTYPE` or `<!ENTITY` declarations before they reach the application servers.
2.  **Vetted Libraries:** Standardize on enterprise-grade SAML libraries (e.g., `python3-saml`, `Spring Security SAML`) which have secure-by-default XML parsing configurations baked in, rather than allowing developers to write raw XML parsing logic.

By explicitly severing the parser's ability to interpret custom entities, you neutralize the Billion Laughs attack before it can consume a single byte of excess memory.