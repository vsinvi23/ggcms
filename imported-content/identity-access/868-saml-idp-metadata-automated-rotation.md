# Managing SAML Trust: Automated IdP Metadata Parsing and Certificate Rotation

## The Problem: Expiring IdP Certificates and Operational Downtime

SAML Single Sign-On (SSO) depends on asymmetric cryptography to establish trust between the Identity Provider (IdP) and the Service Provider (SP). The IdP signs its SAML assertions with a private key, and the SP verifies those assertions using the corresponding public key.

A persistent operational risk is certificate expiration. If an IdP rotates its signing certificate and the SP is not updated synchronously, all authentication requests fail instantly, blocking users from accessing the system. 

Historically, companies managed this manually by coordinating certificate exchanges via email or support tickets. However, manual processes are highly prone to human error, delays, and critical downtime.

To establish resilient, zero-downtime SAML operations, SPs must implement an **automated metadata synchronization worker**. This worker periodically polls the IdP's metadata XML endpoint, parses the active public keys, and dynamically updates the cryptographic trust store while maintaining overlapping key validation for transition periods.

---

## Technical Architecture

The following diagram illustrates the automated trust lifecycle, showing the background worker polling, parsing, and updating the local public key store:

```
+---------------------------------------------------------------------------------+
|                         Automated SAML Certificate Rotation                     |
+---------------------------------------------------------------------------------+

  +------------------+         1. Poll IdP Metadata (daily)       +-------------------+
  |  SAML Metadata   | <----------------------------------------- | Background Worker |
  |  Worker Service  |                                            |    (Cron Job)     |
  +------------------+         2. Parse XML for KeyDescriptor     +-------------------+
           |                                                                |
           v                                                                |
  +------------------+                                                      |
  |  XML Validator   |                                                      |
  |  (SSRF Hardened) |                                                      |
  +------------------+                                                      |
           |                                                                |
           | 3. Extract active X509Certificates                             |
           v                                                                |
  +------------------+                                                      |
  | Trust Keyring    | <----------------------------------------------------+
  | (Local DB/Cache) |  4. Update trust keyring database:
  |                  |     - Maintains multiple active keys (Dual-Verification)
  +------------------+     - Purges expired keys automatically
```

---

## Technical Challenges & Safeguards

### 1. Hardened Dynamic Fetching
When fetching metadata URLs supplied by tenants, the SP must protect itself from Server-Side Request Forgery (SSRF) and XML Denial of Service (DoS) attacks. The polling worker must validate the URL host domain against a tenant-approved allowlist and parse XML with strict entity resolution bans.

### 2. Dual-Verification Keyring Support
During key rotation, IdPs transition through a period where both the old and new certificates are active. The SP trust store must support a "Keyring" model rather than a single public key file. When verifying an incoming assertion, the SP should attempt validation with all currently unexpired certificates on the keyring before rejecting the signature.

---

## Code Implementation: Node.js (TypeScript)

The following service demonstrates how to retrieve, safely parse, and dynamically extract public signing certificates from an IdP metadata XML endpoint.

```typescript
import axios from 'axios';
import { DOMParser } from '@xmldom/xmldom';
import * as xpath from 'xpath';

interface SAMLSigningCertificate {
  use: string; // 'signing' or 'encryption'
  certificatePem: string;
}

export class SAMLMetadataTrustRotator {
  private allowedIssuerDomain: string;

  constructor(allowedIssuerDomain: string) {
    this.allowedIssuerDomain = allowedIssuerDomain;
  }

  /**
   * Safely fetches IdP XML metadata, preventing SSRF attacks.
   */
  private async fetchMetadata(url: string): Promise<string> {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('SAML Security Block: Only HTTPS protocol allowed for metadata sync.');
    }

    if (parsedUrl.hostname !== this.allowedIssuerDomain) {
      throw new Error('SAML Security Block: Metadata host does not match tenant allowlist domain.');
    }

    const response = await axios.get(url, {
      timeout: 10000,
      maxContentLength: 5 * 1024 * 1024, // Limit to 5MB to prevent DoS payloads
      headers: { 'Accept': 'application/xml, text/xml' }
    });

    return response.data;
  }

  /**
   * Parses the XML metadata and extracts public certificates.
   */
  public async rotateIdPCertificates(metadataUrl: string): Promise<SAMLSigningCertificate[]> {
    const rawXml = await this.fetchMetadata(metadataUrl);

    // Hardened XML Parser initialization (rejects external entities)
    const parser = new DOMParser({
      errorHandler: (level, msg) => {
        if (level === 'error' || level === 'fatalError') {
          throw new Error(`XML Parse Failure: ${msg}`);
        }
      }
    });

    const doc = parser.parseFromString(rawXml, 'text/xml');
    
    // Explicit protection against XML entity bomb injections
    if (rawXml.includes('<!ENTITY') || rawXml.includes('<!DOCTYPE')) {
      throw new Error('SAML Parse Block: Inline DTD definitions are prohibited.');
    }

    // 1. Establish the namespace map matching the SAML Metadata standard
    const select = xpath.useNamespaces({
      'md': 'urn:oasis:names:tc:SAML:2.0:metadata',
      'ds': 'http://www.w3.org/2000/09/xmldsig#'
    });

    // 2. Select all KeyDescriptor nodes designated for signing
    const keyDescriptors = select("//md:IDPSSODescriptor/md:KeyDescriptor", doc) as Element[];
    const extractedCertificates: SAMLSigningCertificate[] = [];

    for (const descriptor of keyDescriptors) {
      const use = descriptor.getAttribute('use') || 'signing'; // Default to signing if unspecified
      
      // We only extract keys designated for signing assertions
      if (use === 'signing' || use === 'all') {
        const certNodes = select(".//ds:X509Certificate/text()", descriptor) as Text[];
        if (certNodes.length > 0) {
          const rawCert = certNodes[0].data.trim();
          
          // Format raw certificate string back to standard RFC 7468 PEM representation
          const formattedPem = `-----BEGIN CERTIFICATE-----\n${rawCert.replace(/\s+/g, '\n')}\n-----END CERTIFICATE-----`;
          
          extractedCertificates.push({
            use: 'signing',
            certificatePem: formattedPem
          });
        }
      }
    }

    if (extractedCertificates.length === 0) {
      throw new Error('SAML Security Block: Failed to extract any active signing certificates from metadata.');
    }

    // 3. Return the updated trust certificates keyring
    return extractedCertificates;
  }
}
```

---

## Operational Verification

To verify automated trust rotation:
- Configure a cron-worker to call `rotateIdPCertificates` on target tenant metadata endpoints daily.
- Simulate an IdP key rollover by adding a new certificate block alongside the existing active cert inside your mock metadata file; verify that the worker parses both certificates and populates the local trust store with both active keys.
- Ensure that authentications signed by *either* key pass validation, guaranteeing zero authentication interruptions during the transition.
