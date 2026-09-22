# SAML Security: Mitigating XML External Entity (XXE) Processing Vulnerabilities

## The Problem
Security Assertion Markup Language (SAML) remains a cornerstone of enterprise single sign-on (SSO). However, because SAML relies entirely on the XML standard for packaging assertions, requests, and metadata, it inherits the deep security complexities of XML parsing. 

A primary risk in SAML Service Provider (SP) implementations is the XML External Entity (XXE) injection vulnerability. Many standard XML parsers are configured by default to resolve DTD (Document Type Definition) declarations and external references. If an SP receives and parses an untrusted SAML response containing a maliciously crafted XML payload, the underlying parser may execute arbitrary external calls, read local files, or consume system memory. This turns the SAML parser into a vector for server-side request forgery (SSRF), intellectual property theft, or complete service denial.

## The Mental Model
SAML Assertions are passed from the client's browser to the Service Provider via HTTP POST bindings. The Service Provider must deserialize this XML payload to verify signature and claims.

```
+---------+         SSO Request          +-------------------+
| Browser | ---------------------------> | Identity Provider |
|         | <--------------------------- |      (IdP)        |
+---------+     SAML XML Assertion       +-------------------+
     |          (Injected with DTD/XXE)
     |
     v  POST /saml/acs
+-------------------------+
|  Service Provider (SP)  |
|                         |
|   +------------------+  |
|   | XML Parser       |  | ---> Fetches http://169.254.169.254/latest/meta-data/
|   | (DTD/XXE Enabled)|  | ---> Reads and exfiltrates file:///etc/passwd
|   +------------------+  |
+-------------------------+
```

If the SP’s parser does not explicitly disable external entity processing, the server will execute the injected instructions, communicating with local cloud metadata endpoints or exfiltrating files.

## Attack Vectors
1. **Arbitrary File Disclosure (Exfiltration)**: An attacker injects a DTD that references a sensitive local file, such as `file:///etc/passwd` or application configuration files containing API keys. When the parser processes the assertion, it resolves the entity and inserts the file's contents into the parsed XML document, which might then be printed in error logs or UI pages returned to the attacker.
2. **Server-Side Request Forgery (SSRF)**: By defining an external system entity that points to an internal network address (such as `http://169.254.169.254/latest/meta-data/`), an attacker can force the SP server to make backend HTTP queries. This allows them to steal cloud instance credentials or scan internal subnets behind the firewall.
3. **XML Entity Expansion (Billion Laughs)**: By nesting entity references recursively inside a DTD, an attacker can construct a tiny, kilobytes-sized SAML payload that expands into gigabytes of data when parsed in memory. This quickly exhausts the server's CPU and RAM resources, triggering a Denial of Service (DoS).

## Defensive Architecture
The absolute defense against XXE and Entity Expansion in SAML processing is to disable DTD processing entirely in the XML parsing configuration.

### Secure XML Parsing Configuration in Java
In Java, which is heavily used for enterprise SAML SP implementations (like Spring Security SAML or Shibboleth), you must explicitly configure the `DocumentBuilderFactory` to prevent DTD and external entity resolution before parsing any SAML payload.

```java
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import org.w3c.dom.Document;
import java.io.ByteArrayInputStream;

public class SecureSAMLParser {

    public static Document parseSAMLAssertion(byte[] xmlContent) throws Exception {
        DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
        
        try {
            // 1. Completely disable DTDs (Document Type Definitions) to stop XXE and Billion Laughs
            dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            
            // 2. Disable external general entities
            dbf.setFeature("http://xml.org/sax/features/external-general-entities", false);
            
            // 3. Disable external parameter entities
            dbf.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            
            // 4. Disable loading external DTDs
            dbf.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            
            // 5. Ignore comments and enforce secure processing limits
            dbf.setXIncludeAware(false);
            dbf.setExpandEntityReferences(false);
            dbf.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            
        } catch (ParserConfigurationException e) {
            throw new IllegalStateException("Failed to configure secure parser features.", e);
        }

        // Return the safely parsed document
        return dbf.newDocumentBuilder().parse(new ByteArrayInputStream(xmlContent));
    }
}
```

## Best Practices
- **Never Parse SAML with Default Settings**: Always explicitly disable DOCTYPE declarations in every parser instance across your codebase.
- **Enforce Cryptographic Signatures First**: Verify the digital signature of the SAML response before processing the inner assertion elements.
- **Use Updated Parsers**: Keep your runtime environment and XML parsers updated to ensure known vulnerabilities in XML libraries are patched.
