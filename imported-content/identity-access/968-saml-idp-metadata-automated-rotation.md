# Managing SAML Trust: Automated IdP Metadata Parsing and Certificate Rotation

## The Problem
In SAML 2.0 architectures, the Service Provider (SP) verifies the authenticity of SAML Assertions using the public X.509 certificate of the Identity Provider (IdP). Traditionally, this certificate is manually downloaded from the IdP and hardcoded into the SP's configuration. When the IdP certificate nears expiration, a coordinated, manual rollover is required. If someone misses an email or forgets to update the cert, the integration hard-fails, locking all users out.

## The Solution: Dynamic Metadata Polling
Instead of hardcoding certificates, modern SAML SP implementations parse the IdP's Metadata XML dynamically. The Metadata endpoint (`https://idp.example.com/metadata.xml`) contains the IdP's Entity ID, SSO endpoints, and most importantly, the currently active `X509Certificate` used for signing.

By polling this URL periodically, the SP can cache the keys and rotate them seamlessly without human intervention.

```text
+-----------------------+                     +---------------------------+
|                       |  1. Fetch XML (cron)|                           |
| Service Provider (SP) |====================>| Identity Provider (IdP)   |
| (Your App)            |                     | (Okta, Entra ID, etc)     |
|                       |<====================|                           |
|   +---------------+   |  2. Parse Certs     +---------------------------+
|   | Metadata Cache|   |
|   +---------------+   |
+-----------------------+
```

## Parsing the Metadata XML
The SP must locate the `<KeyDescriptor use="signing">` element within the `<IDPSSODescriptor>` node. 

An IdP performing a seamless key rotation will publish *two* signing certificates in its metadata simultaneously:
1. The expiring certificate (currently in use).
2. The new certificate (soon to be in use).
The SP must cache *both* and try validating the SAML response against them sequentially.

### Implementation: Dynamic Key Fetching (Node.js)

```typescript
import axios from 'axios';
import { DOMParser } from '@xmldom/xmldom';

const METADATA_URL = 'https://idp.example.com/metadata.xml';
let cachedSigningCerts: string[] = [];

async function refreshIdpMetadata() {
  try {
    const response = await axios.get(METADATA_URL);
    const doc = new DOMParser().parseFromString(response.data, 'text/xml');
    
    // Extract IDPSSODescriptor
    const idpDescriptor = doc.getElementsByTagNameNS('urn:oasis:names:tc:SAML:2.0:metadata', 'IDPSSODescriptor')[0];
    if (!idpDescriptor) throw new Error('Invalid metadata: No IDPSSODescriptor');

    // Find all KeyDescriptors
    const keyDescriptors = idpDescriptor.getElementsByTagNameNS('urn:oasis:names:tc:SAML:2.0:metadata', 'KeyDescriptor');
    const newCerts: string[] = [];

    for (let i = 0; i < keyDescriptors.length; i++) {
      const kd = keyDescriptors[i];
      // Only care about signing keys
      if (kd.getAttribute('use') === 'signing' || !kd.hasAttribute('use')) {
        const x509Data = kd.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'X509Certificate')[0];
        if (x509Data && x509Data.textContent) {
            // Format certificate with PEM headers for the crypto library
            const certBody = x509Data.textContent.trim().replace(/\s+/g, '');
            const pem = `-----BEGIN CERTIFICATE-----\n${certBody.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`;
            newCerts.push(pem);
        }
      }
    }

    if (newCerts.length > 0) {
      cachedSigningCerts = newCerts;
      console.log(`Successfully rotated ${newCerts.length} IdP signing certificates.`);
    }

  } catch (error) {
    console.error('Failed to refresh IdP metadata, falling back to cache:', error);
  }
}

// Poll metadata every 12 hours
setInterval(refreshIdpMetadata, 12 * 60 * 60 * 1000);
// Initial load
refreshIdpMetadata();
```

## Verifying Assertions with Multiple Keys
When a SAML response arrives, the SP must iterate through the `cachedSigningCerts` until validation succeeds.

```typescript
import { validateSignature } from 'saml-crypto-lib'; // Abstracted library

function verifySamlResponse(xmlResponse: string) {
    if (cachedSigningCerts.length === 0) {
        throw new Error('No IdP certificates available');
    }

    let isValid = false;
    for (const cert of cachedSigningCerts) {
        try {
            // Attempt to validate with current cert in loop
            isValid = validateSignature(xmlResponse, cert);
            if (isValid) {
                break; // Stop upon first successful validation
            }
        } catch (e) {
            // Signature verification failed with this cert, try the next
        }
    }

    if (!isValid) {
        throw new Error('SAML signature validation failed against all active IdP keys.');
    }
    
    // Proceed with processing assertion...
}
```

## Security Rule: Validate the Metadata Endpoint
Never poll a metadata URL supplied by the user during the SSO flow (e.g., passed as a query parameter). This is an SSRF vector and allows an attacker to inject their own keys. The Metadata URL must be strictly configured and bound to the tenant configuration in the database.
