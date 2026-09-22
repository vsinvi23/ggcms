# Securing AWS S3: Inside the Signature Version 4 (SigV4) Pre-Signed URL Lifecycle

## The Problem: The Danger of Long-Lived Shared Secrets

To share private assets stored in Amazon S3 (such as user-specific invoices, medical records, or secure firmware downloads), developers often use Pre-Signed URLs. A pre-signed URL embeds a cryptographic signature that delegates read or write access to a specific S3 object.

However, many implementations expose critical architectural vulnerabilities:
1. **Signing with Root or Admin Keys:** If a pre-signed URL is generated using a long-lived IAM User access key with broad permissions, the URL inherits the full privilege set of that user. If an attacker intercepts the URL, they can exploit details of the signature structure to gain insights into corporate accounts or attempt privilege escalation.
2. **Excessive Validity Periods:** Generating URLs that remain active for hours or days increases the risk of interception and unauthorized distribution.
3. **Lack of Payload Integrity:** Standard pre-signed GET URLs do not validate headers or query parameters, permitting intermediate proxies to inspect, cache, or alter requests.

---

## The Solution: Cryptographically Bound SigV4 Signatures with STS

To harden S3 access, we must:
* Derive signatures exclusively from short-lived, ephemeral **Security Token Service (STS)** session credentials.
* Scope the URL with an aggressive TTL (e.g., < 15 minutes).
* Understand the cryptographic construction of AWS Signature Version 4 (SigV4) to enforce strict header-matching at the network boundary.

```
SigV4 Cryptographic Key Derivation Chain:
+-----------------------------------------------------------+
|  Secret Access Key (AWS Secret Access Key or STS Token)   |
+-----------------------------------------------------------+
                             |
                      HMAC-SHA256("YYYYMMDD")
                             v
+-----------------------------------------------------------+
|  Date Key (kDate)                                         |
+-----------------------------------------------------------+
                             |
                      HMAC-SHA256("us-east-1")
                             v
+-----------------------------------------------------------+
|  Region Key (kRegion)                                     |
+-----------------------------------------------------------+
                             |
                      HMAC-SHA256("s3")
                             v
+-----------------------------------------------------------+
|  Service Key (kService)                                   |
+-----------------------------------------------------------+
                             |
                      HMAC-SHA256("aws4_request")
                             v
+-----------------------------------------------------------+
|  Signing Key (kSigning)                                   |
+-----------------------------------------------------------+
                             |
             HMAC-SHA256(StringToSign, kSigning)
                             v
+-----------------------------------------------------------+
|  Final Hex-Encoded Signature Value                        |
+-----------------------------------------------------------+
```

This multi-tiered derivation chain ensures that even if an individual signing key (`kSigning`) is compromised, it is only valid for a single day, a single AWS region, and a single AWS service. The master Secret Access Key is never exposed nor directly used to sign the target HTTP payload.

---

## Technical Proof: Standard-Library Implementation of SigV4 Signing

To inspect the raw cryptography without abstract SDK black boxes, the following complete Python script computes a secure S3 Pre-Signed URL for an object using standard library components (`hmac` and `hashlib`).

```python
import hmac
import hashlib
import urllib.parse
from datetime import datetime, UTC

def sign(key, msg):
    return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()

def get_signature_key(key, date_stamp, region_name, service_name):
    k_date = sign(('AWS4' + key).encode('utf-8'), date_stamp)
    k_region = sign(k_date, region_name)
    k_service = sign(k_region, service_name)
    k_signing = sign(k_service, 'aws4_request')
    return k_signing

def generate_s3_presigned_url(
    access_key, secret_key, session_token, bucket, object_key, region, expires_in_seconds=900
):
    # Establish time metadata (must match S3 server clock precisely)
    now = datetime.now(UTC)
    amz_date = now.strftime('%Y%m%dT%H%M%SZ')
    datestamp = now.strftime('%Y%m%d')

    host = f"{bucket}.s3.{region}.amazonaws.com"
    endpoint = f"https://{host}/{object_key}"

    # Define query parameters in alphabetical order (Canonical Query String)
    query_params = {
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Credential': f"{access_key}/{datestamp}/{region}/s3/aws4_request",
        'X-Amz-Date': amz_date,
        'X-Amz-Expires': str(expires_in_seconds),
        'X-Amz-SignedHeaders': 'host'
    }
    
    if session_token:
        query_params['X-Amz-Security-Token'] = session_token

    # Build the Canonical Query String (Percent-encoded)
    sorted_params = sorted(query_params.items())
    canonical_query_string = '&'.join([f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(v, safe='')}" for k, v in sorted_params])

    # Build Canonical Request
    canonical_uri = f"/{urllib.parse.quote(object_key, safe='')}"
    canonical_headers = f"host:{host}\n"
    signed_headers = "host"
    payload_hash = "UNSIGNED-PAYLOAD" # Standard for pre-signed GET requests

    canonical_request = '\n'.join([
        'GET',
        canonical_uri,
        canonical_query_string,
        canonical_headers,
        signed_headers,
        payload_hash
    ])

    # Hash the Canonical Request
    canonical_request_hash = hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()

    # Build String to Sign
    credential_scope = f"{datestamp}/{region}/s3/aws4_request"
    string_to_sign = '\n'.join([
        'AWS4-HMAC-SHA256',
        amz_date,
        credential_scope,
        canonical_request_hash
    ])

    # Derive Signing Key and Compute Final Hex-Encoded Signature
    signing_key = get_signature_key(secret_key, datestamp, region, 's3')
    signature = hmac.new(signing_key, string_to_sign.encode('utf-8'), hashlib.sha256).hexdigest()

    # Append Signature to complete URL
    final_url = f"{endpoint}?{canonical_query_string}&X-Amz-Signature={signature}"
    return final_url

# Demo Execution
if __name__ == "__main__":
    # Ephemeral STS tokens (Never hardcode production admin keys here!)
    MOCK_ACCESS_KEY = "ASIA_MOCK_ACCESS_KEY"
    MOCK_SECRET_KEY = "mock_secret_key_value_representing_sts_session"
    MOCK_SESSION_TOKEN = "IQoJb3JpZ2luX2VjE..." # Session Token returned by STS
    
    URL = generate_s3_presigned_url(
        access_key=MOCK_ACCESS_KEY,
        secret_key=MOCK_SECRET_KEY,
        session_token=MOCK_SESSION_TOKEN,
        bucket="corporate-invoice-vault-prod",
        object_key="client_2991/q1_invoice.pdf",
        region="us-east-1",
        expires_in_seconds=600 # Force low TTL (10 minutes)
    )
    print("Derived Secure Pre-Signed URL:\n", URL)
```

---

## Hardening Recommendations

1. **Use STS over IAM:** Always request ephemeral keys via `sts:AssumeRole` prior to signing. If the URL is intercepted, the underlying signing credentials expire within hours.
2. **Pin the IP with IAM Conditions:** When generating the STS session, include a conditional policy checking the client IP:
   ```json
   "Condition": {
       "NotIpAddress": { "aws:SourceIp": "198.51.100.0/24" }
   }
   ```
   This invalidates the signature instantly if accessed outside the corporate network.
3. **Explicit Header Verification:** Include sensitive query headers (like `X-Amz-SignedHeaders=host;content-type;x-amz-server-side-encryption`) to prevent intermediate tampering of data payload configurations during file uploads.
