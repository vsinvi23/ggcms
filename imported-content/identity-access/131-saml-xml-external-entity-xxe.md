# SAML Vulnerabilities: Preventing XML External Entity (XXE) Injections

## The Problem: The Inherent Insecurity of Legacy XML Parsing
The Security Assertion Markup Language (SAML) protocol is the foundation of enterprise Single Sign-On (SSO). It relies on XML-formatted assertions passed between an Identity Provider (IdP) and a Service Provider (SP). While XML is highly structured, legacy XML parsers are notoriously insecure by default. 

Standard XML specifications support Document Type Definitions (DTDs), which allow XML documents to define internal or external variables known as "entities." When a Service Provider parses a user-submitted SAML Response, its XML engine may attempt to resolve these external entities. If an attacker intercepts or crafts a SAML assertion, they can inject malicious external entity references. This is known as an XML External Entity (XXE) injection attack. When the SP parses the assertion, the parser can be forced to read sensitive files from the local filesystem, perform server-side request forgery (SSRF) to probe internal network services, or trigger a Denial of Service (DoS) through deep entity recursion.

## The Mental Model: The XXE Execution Flow
SAML assertions are sent via the user's browser (user-agent) to the SP's Assertion Consumer Service (ACS) endpoint. The attacker intercepts this HTTP POST payload, decodes the Base64 SAML Response, inserts the malicious DTD, re-encodes it, and submits it to the SP.

```
 Attacker                      Service Provider (ACS Endpoint)            Local Filesystem
    |                                         |                                  |
    |--- 1. HTTP POST (Base64 SAML XML) ----->|                                  |
    |    (With Malicious External Entity)    |--- 2. Instantiates Parser ------>|
    |                                         |                                  |
    |                                         |--- 3. Resolves Entity ---------->|
    |                                         |       (e.g., reads config file)  |
    |                                         |<-- 4. Returns File Content ------|
    |                                         |                                  |
    |<-- 5. Leaked Content in Error/Claims ---|                                  |
```

If the parser resolves the entity, it binds the local file's content to an XML element. If the SP reflects this element in its UI or an error log, the attacker extracts the file directly. If not, the attacker can use "Blind XXE" to exfiltrate the file content via an out-of-band HTTP request to an attacker-controlled listener.

## Technical Attack Vectors in SAML Parsers
Below is a typical exploit payload injected into a SAML Assertion:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE saml:Response [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<saml:Response xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_1234">
  <saml:Issuer>https://identity.serenya.com</saml:Issuer>
  <saml:Assertion>
    <saml:Subject>
      <saml:NameID>&xxe;</saml:NameID>
    </saml:Subject>
  </saml:Assertion>
</saml:Response>
```

When the SP's parser encounters `&xxe;`, it retrieves `/etc/passwd` and places its content inside the `NameID` field, leaking it to the attacker when the application displays the logged-in username.

Another vector is the **Billion Laughs DoS Attack**, which utilizes nested entity expansion to crash the SP's application server:

```xml
<!DOCTYPE lolz [
 <!ENTITY lol "lol">
 <!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
 <!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">
]>
```

Parsing this triggers exponential memory expansion, quickly exhausting CPU and RAM resources.

## Mitigating XXE: Securing the Parser
The ultimate defense against XXE is disabling external DTD resolution completely. Simply sanitizing inputs or validating signatures is insufficient, because signature validation itself often requires parsing the XML document *first*, triggering the vulnerability.

### Secure Java XML Parsing Configuration
If the SP is built in Java (a common language for enterprise SAML implementations), you must configure the `DocumentBuilderFactory` to reject external entity and DTD resolution:

```java
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;

public class SecureSAMLParser {
    public static DocumentBuilderFactory getSecureFactory() throws ParserConfigurationException {
        DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
        
        // Disable DTDs entirely (This prevents both XXE and Billion Laughs)
        String FEATURE = "http://apache.org/xml/features/disallow-doctype-decl";
        dbf.setFeature(FEATURE, true);
        
        // Alternatively, disable external entities if DTDs are strictly necessary
        dbf.setFeature("http://xml.org/sax/features/external-general-entities", false);
        dbf.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        dbf.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
        
        // Mitigate XML Entity Expansion Attacks
        dbf.setXIncludeAware(false);
        dbf.setExpandEntityReferences(false);
        
        return dbf;
    }
}
```

## Defensive Best Practices
1. **Never Parse Unsigned Assertions:** Ensure that the SAML parser validates the cryptographic signature of the SAML Assertion *using a securely configured parser* before processing any node values.
2. **Implement Least Privilege Execution:** Run the application server under a user context that has minimal local file read privileges, limiting the impact if an XXE vulnerability is exploited.
3. **Use JSON-Based SSO Alternatives:** For new architectures, prefer OpenID Connect (OIDC) over SAML. OIDC uses JSON (JWTs), which natively lacks entity resolution or DTD mechanics, eliminating the XXE attack surface completely.

By proactively disabling external DTD parsing and moving toward zero-trust system permissions, security engineers can guarantee that enterprise SAML processors remain immune to XXE and entity expansion vulnerabilities.
