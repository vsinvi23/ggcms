# Managing SAML Trust: Automated IdP Metadata and Certificate Rotation

## The Problem
A Security Assertion Markup Language (SAML) single sign-on (SSO) integration relies on a tight cryptographic trust anchor. The Service Provider (SP) validates incoming user assertions by signing them with the Identity Provider's (IdP) public key. To establish this trust, the SP and IdP exchange XML metadata files containing their public certificates and endpoint URLs.

The operational bottleneck arises when these cryptographic certificates expire or need to be revoked due to compromise. Historically, rotation has been a manual, high-risk process: system administrators coordinate a "midnight hot-swap" of certificates, which frequently leads to configuration mismatches, broken integrations, and catastrophic enterprise-wide login outages. To achieve high availability, organizations must automate IdP metadata consumption and certificate trust rotation. However, automating this process without rigorous security boundaries can expose the SP to metadata hijacking, domain spoofing, and signature bypasses.

## The Mental Model
Rather than loading a static XML metadata file from local disk, the SP should implement an automated, signature-verified metadata pull mechanism.

```
+------------------------+           1. HTTP GET (Secure HTTPS)         +--------------------+
|                        | -------------------------------------------> |                    |
|                        | <------------------------------------------- | Identity Provider  |
|                        |       2. Signed XML Metadata File            |  (IdP Metadata URL)|
|                        |                                              +--------------------+
|  Service Provider (SP) |                                                        
|                        |           3. Cryptographically Verify                  
|  +------------------+  |              Metadata XML Signature                    
|  | Metadata Rotator |  |              Against Anchor Cert                       
|  |                  |  |                                                        
|  | Validates &      |  |           4. Hot-swap active public                    
|  | Extracts Public  |  |              keys in verification cache                
|  | Certs            |  |                                                        
|  +------------------+  |                                                        
+------------------------+                                                        
```

1. The SP periodically polls the IdP's metadata endpoint over HTTPS.
2. The IdP returns an XML document containing its active and future signing certificates, cryptographically signed by the IdP's metadata signing key.
3. The SP verifies the XML signature of the metadata document against a local, trusted anchor certificate.
4. Once verified, the SP parses the metadata, extracts the public keys, and hot-swaps them inside its runtime verification memory cache, allowing seamless transitioning between keys without service interruption.

## Attack Vectors
1. **Metadata Spoofing via DNS Hijacking**: If the SP fetches the IdP's metadata over plain HTTP or fails to validate the metadata's digital signature, an attacker who hijacks DNS or performs a Man-in-the-Middle (MITM) attack can serve a fake XML metadata file containing their own public key. This allows the attacker to forge valid SAML assertions and login as any corporate user.
2. **Key Replacement Attacks (Signature Bypass)**: If the SP dynamically ingests metadata but fails to pin the certificate authority (CA) or verify that the signer is the legitimate IdP, an attacker can purchase a cheap, legitimate certificate, sign their own malicious metadata file, and push it to the SP.
3. **Replay of Compromised Certificates**: If metadata caching is static and lacks an expiration check, the SP may continue to trust a revoked or compromised IdP certificate indefinitely, even after the IdP has published updated metadata with revoked status.

## Defensive Architecture
Automating trust rotation requires a secure metadata loader that enforces signature verification using a pre-configured trust anchor and hot-swapping certificates safely in memory.

### Python: Secure, Signature-Verified SAML Metadata Loader
The following Python script illustrates how to fetch remote SAML metadata, cryptographically verify the XML signature using a trusted local anchor, and dynamically reload the public verification keys.

```python
import os
import requests
from lxml import etree
from signxml import XMLVerifier, XMLSignatureProcessor

TRUSTED_METADATA_URL = os.getenv("IDP_METADATA_URL") # HTTPS endpoint
ANCHOR_CERT_PATH = "/etc/saml/metadata_anchor.crt" # Local root of trust cert

class SecureMetadataRotator:
    def __init__(self):
        self.active_verification_certs = []
        
    def fetch_and_rotate_metadata(self):
        """
        Polls the IdP's metadata, validates its digital signature,
        and dynamically updates the active public keys in memory.
        """
        try:
            # 1. Fetch remote XML over HTTPS
            response = requests.get(TRUSTED_METADATA_URL, timeout=10)
            response.raise_for_status()
            metadata_xml = response.content
            
            # 2. Parse the metadata XML document safely
            parser = etree.XMLParser(resolve_entities=false, dtd_validation=false)
            root = etree.fromstring(metadata_xml, parser=parser)
            
            # 3. Read the local anchor certificate (Root of Trust)
            with open(ANCHOR_CERT_PATH, "rb") as f:
                anchor_cert = f.read()
                
            # 4. Cryptographically verify the XML signature of the metadata document
            # This ensures the metadata has not been altered or spoofed by an attacker
            verifier = XMLVerifier()
            verified_data = verifier.verify(root, x509_cert=anchor_cert)
            
            # 5. Extract all signing certificates from the verified XML document
            new_certs = []
            namespaces = {'md': 'urn:oasis:names:tc:SAML:2.0:metadata', 'ds': 'http://www.w3.org/2000/09/xmldsig#'}
            
            # Find IDPSSODescriptor signing KeyDescriptors
            key_descriptors = root.xpath(
                "//md:IDPSSODescriptor/md:KeyDescriptor[@use='signing']", 
                namespaces=namespaces
            )
            
            for kd in key_descriptors:
                cert_node = kd.xpath(".//ds:X509Certificate", namespaces=namespaces)
                if cert_node:
                    clean_cert = cert_node[0].text.strip().replace("\n", "").replace(" ", "")
                    # Reconstruct standard PEM format
                    pem_cert = f"-----BEGIN CERTIFICATE-----\n{clean_cert}\n-----END CERTIFICATE-----"
                    new_certs.append(pem_cert)
                    
            if not new_certs:
                raise ValueError("No valid signing certificates found in IdP metadata.")
                
            # Hot-swap the active verification certificates in memory (thread-safe swap)
            self.active_verification_certs = new_certs
            print(f"SAML Metadata rotated successfully. Ingested {len(new_certs)} active keys.")
            
        except Exception as e:
            # Alert on rotation failures; fallback to previously cached certs (fail-open prevention)
            print(f"ALERT: SAML Metadata trust rotation failed: {str(e)}")
            raise e
```

## Best Practices
- **Support Multi-Key Trust**: Always allow the SP to hold at least two active certificates simultaneously (the current certificate and the upcoming/next certificate) to enable zero-downtime rollover.
- **Pin Endpoint Domains**: Ensure the metadata downloader only requests URLs from a hardcoded list of verified corporate domains.
- **Fail Safe**: If a metadata fetch or verification fails, continue using the previously cached, valid certificates and immediately trigger a high-severity security alert. Do not purge the active cert cache upon fetch failure.
