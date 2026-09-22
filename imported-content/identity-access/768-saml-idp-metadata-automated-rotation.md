# Managing SAML Trust: Automated IdP Metadata Parsing and Certificate Rotation

## The Problem: The Brittle Nature of Static SAML Trust

In enterprise Single Sign-On (SSO) systems implementing SAML 2.0, the cryptographic trust between the Service Provider (SP, your application) and the Identity Provider (IdP, e.g., Okta, Ping Identity) is established using public-key cryptography. The SP relies on the IdP’s public certificate to verify the signatures of incoming XML assertions.

Historically, SP configurations were completely static: an administrator manually uploaded the IdP's PEM certificate during enrollment. However, certificates expire. When an IdP certificate expires, or when an IT team undergoes an emergency key rollover due to a credential compromise, the SAML trust instantly breaks. This results in complete login downtime for the enterprise’s users until SP administrators manually update the hardcoded certificates.

To build a zero-downtime, self-healing SSO infrastructure, Service Providers must implement **Automated IdP Metadata Parsing**. Instead of storing static PEM certificates, the SP periodically polls the IdP's standard dynamic Metadata XML endpoint, parses the rollover keys, and dynamically handles certificate transition windows on the fly.

---

## Architectural Blueprint: The Zero-Downtime Rollover Sync Loop

SAML metadata documents support publishing multiple certificates under the `<KeyDescriptor>` element. During a key rollover, the IdP publishes both the **Active (Signing)** certificate and the **Next-in-Line (Upcoming)** certificate in its metadata.

By caching and trying all available keys during a verification check, the SP guarantees seamless service during the transition phase.

```
       [ SAML Trust Sync Cron Loop (Every 6 Hours) ]

       +------------------+             +----------------------+
       |   Service Provider  |             |  Identity Provider   |
       |       (SP)       |             |     (IdP Metadata)   |
       +------------------+             +----------------------+
                |                                  |
                | 1. HTTP GET /metadata.xml        |
                |--------------------------------->|
                |                                  | 2. Returns XML containing
                |                                  |    KeyDescriptor (use="signing")
                |                                  |    including Active & Next certs
                |                                  |<------------------|
                |                                  |
                | 3. Parse & Validate XML Schema   |
                | 4. Extract Certificates          |
                | 5. Store in local Memory/Redis   |
                |                                  |
                |==================================|
                |  When User Logs In:              |
                |  Verify SAML Assertion signature |
                |  against active cert.            |
                |  If verification fails, fallback |
                |  to verify against Next-in-Line  |
                |  cert before rejecting.          |
                |==================================|
```

---

## Technical Implementation

Below is a robust Python script implementing safe IdP XML Metadata parsing, PEM certificate extraction, and dynamic key verification routing.

```python
import urllib.request
import defusedxml.ElementTree as ET
from datetime import datetime, timedelta

class DynamicSAMLTrustStore:
    def __init__(self, metadata_url: str, sync_interval_hours: int = 6):
        self.metadata_url = metadata_url
        self.sync_interval = timedelta(hours=sync_interval_hours)
        self.last_sync_time = None
        self.signing_certificates = [] # Cache containing raw cert strings

    def sync_trust_certificates(self) -> None:
        """
        Polls the IdP's metadata XML endpoint, parses signing certificates,
        and securely refreshes local cache.
        """
        try:
            # 1. Fetch metadata XML (Use appropriate timeouts)
            req = urllib.request.Request(
                self.metadata_url, 
                headers={'User-Agent': 'SAML-Trust-Sync-Engine/1.0'}
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                raw_xml = response.read()

            # 2. Defend against XML bombs using defusedxml
            root = ET.fromstring(raw_xml)

            # Define standard SAML metadata XML namespaces
            namespaces = {
                'md': 'urn:oasis:names:tc:SAML:2.0:metadata',
                'ds': 'http://www.w3.org/2000/09/xmldsig#'
            }

            extracted_certs = []

            # 3. Locate IDPSSODescriptor block which contains IdP signing keys
            idp_descriptor = root.find('.//md:IDPSSODescriptor', namespaces)
            if idp_descriptor is None:
                raise ValueError("INVALID_METADATA: md:IDPSSODescriptor element not found in XML")

            # 4. Extract all KeyDescriptor nodes designated for signing
            key_descriptors = idp_descriptor.findall('md:KeyDescriptor', namespaces)
            for kd in key_descriptors:
                use = kd.get('use')
                # If 'use' attribute is absent, the key can be used for both signing and encryption
                if use and use != 'signing':
                    continue

                # Navigate down to the raw X509 certificate data
                x509_data = kd.find('.//ds:X509Certificate', namespaces)
                if x509_data is not None and x509_data.text:
                    clean_pem = self._format_raw_cert_to_pem(x509_data.text.strip())
                    extracted_certs.append(clean_pem)

            if not extracted_certs:
                raise ValueError("INVALID_METADATA: No valid signing X509Certificate elements found")

            # 5. Atomic Update of local certificate store
            self.signing_certificates = extracted_certs
            self.last_sync_time = datetime.utcnow()

        except Exception as e:
            # Crucial: Log failures clearly and fail-safe by retaining existing cached keys
            print(f"CRITICAL: Failed to synchronize SAML IdP Trust certificates. Detail: {str(e)}")
            if not self.signing_certificates:
                raise RuntimeError("BOOTSTRAP_FAILURE: Initial trust synchronization failed with no cached fallback.")

    def get_trusted_certificates(self) -> list:
        """
        Returns cached certificates. Triggers synchronization if cache is stale.
        """
        now = datetime.utcnow()
        if (self.last_sync_time is None) or (now - self.last_sync_time > self.sync_interval):
            self.sync_trust_certificates()
        return self.signing_certificates

    def verify_assertion_signature(self, signature_verifier_func, raw_saml_assertion) -> bool:
        """
        Verifies incoming assertion by checking against all cached certificates sequentially.
        This provides seamless zero-downtime rollover during key transitions.
        """
        certs = self.get_trusted_certificates()
        
        for idx, cert in enumerate(certs):
            try:
                # signature_verifier_func is a placeholder for your XML verify helper (e.g. xmlsec)
                is_valid = signature_verifier_func(raw_saml_assertion, cert)
                if is_valid:
                    # If verification succeeded on a secondary key, log a warning of rollover activity
                    if idx > 0:
                        print(f"INFO: Verified signature using secondary/rollover key (index {idx}). Key transition is in progress.")
                    return True
            except Exception:
                # Silently proceed to check next available certificate in list
                continue

        return False

    def _format_raw_cert_to_pem(self, raw_base64: str) -> str:
        """
        Cleans raw certificate strings and wraps them in PEM headers
        """
        # Remove any whitespace or inner line breaks
        clean_base64 = "".join(raw_base64.split())
        # Break base64 block into 64-character lines
        lines = [clean_base64[i:i+64] for i in range(0, len(clean_base64), 64)]
        pem_formatted = "-----BEGIN CERTIFICATE-----\n" + "\n".join(lines) + "\n-----END CERTIFICATE-----"
        return pem_formatted
```

---

## Defensive Hardening Checklist

1. **Verify Metadata Origin**: Always verify the IdP's metadata endpoint is served exclusively over HTTPS and that the domain matches your pre-registered tenant tenant mapping.
2. **Signature Verification of Metadata**: For high-trust environments, check if the IdP signs the metadata XML file itself. If signed, verify the metadata signature using a rooted, local CA certificate before parsing the keys.
3. **Atomic Key Updates**: Always swap the active key array atomically in memory. Never clear the active key store *before* the new keys are successfully loaded, downloaded, and parsed.
4. **Log Key Transition Warnings**: Trigger administrative alerts if the verification engine has to fall back to the secondary certificate, signaling that a rollover is active and the old certificate is no longer in use.
