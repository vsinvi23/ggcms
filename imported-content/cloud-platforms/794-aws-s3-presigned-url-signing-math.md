# Securing AWS S3: Inside the Signature Version 4 (SigV4) Pre-Signed URL Lifecycle

## The Problem: Secure Object Sharing without Credential Leakage

When designing cloud-native storage interfaces, applications frequently need to grant clients temporary read or write access to private objects in Amazon S3. For example, a web frontend might need to display a secure user avatar or upload a raw file directly to a bucket without routing bytes through a backend proxy API.

Architects face a critical security challenge:
* **The IAM Exposure Risk:** Sharing long-lived AWS IAM Access Keys and Secret Keys with public client runtimes is a catastrophic security vulnerability.
* **The Public Bucket Fallback:** Opening S3 bucket permissions to the public (using public read policies) bypasses all authorization controls, making private corporate data searchable and downloadable by any web crawler.

---

## The Solution: Cryptographic SigV4 Pre-Signed URLs

The AWS **Signature Version 4 (SigV4)** pre-signed URL solves this problem. It is a time-bound URL that delegates authority to perform a specific S3 action (e.g., `GET` or `PUT`) on a specific object. 

Rather than sending raw credentials, the URL contains an embedded cryptographic signature. The S3 endpoint recalculates this signature upon receiving the request. If the cryptographic hashes match, and the expiration window has not passed, S3 processes the request under the security context of the IAM identity that originally signed the URL.

### The SigV4 Cryptographic Derivation Chain

Instead of signing the request payload with the high-privilege `Secret Access Key` directly, SigV4 uses a layered key derivation process. This limits the blast radius: a compromised derived key is only valid for a single service, in a single region, on a specific calendar day.

```
+---------------------------+
|   AWS Secret Access Key   |
+-------------|-------------+
              | HMAC-SHA256 ("AWS4" + SecretKey, "YYYYMMDD")
              v
+---------------------------+
|        Date Key           | (kDate: valid for 24 hours only)
+-------------|-------------+
              | HMAC-SHA256 (kDate, "us-east-1")
              v
+---------------------------+
|       Region Key          | (kRegion: valid for us-east-1 only)
+-------------|-------------+
              | HMAC-SHA256 (kRegion, "s3")
              v
+---------------------------+
|      Service Key          | (kService: valid for s3 only)
+-------------|-------------+
              | HMAC-SHA256 (kService, "aws4_request")
              v
+---------------------------+
|      Signing Key          | (kSigning: used to compute signature)
+-------------|-------------+
              | HMAC-SHA256 (kSigning, StringToSign)
              v
+---------------------------+
|    Hex-Encoded Signature  | (Injected as X-Amz-Signature parameter)
+---------------------------+
```

---

## Technical Implementation: Cryptographic Signing in Python

The following zero-dependency Python script manually performs the entire SigV4 cryptographic signature process. It creates a temporary `GET` pre-signed URL without using the high-level AWS SDK (`boto3`), demonstrating the underlying mathematics of the Signature Version 4 specification.

### `s3_sigv4_manual.py`

```python
# s3_sigv4_manual.py - Zero-dependency implementation of AWS S3 SigV4 Pre-Signed URLs
import hmac
import hashlib
from datetime import datetime, timezone
import urllib.parse

def sign(key, msg):
    return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()

def get_signature_key(key, date_stamp, region_name, service_name):
    k_date = sign(('AWS4' + key).encode('utf-8'), date_stamp)
    k_region = sign(k_date, region_name)
    k_service = sign(k_region, service_name)
    k_signing = sign(k_service, 'aws4_request')
    return k_signing

def generate_presigned_url(
    bucket: str,
    object_key: str,
    access_key: str,
    secret_key: str,
    region: str,
    expires_seconds: int = 3600
) -> str:
    # 1. Establish Time Parameters
    t = datetime.now(timezone.utc)
    amz_date = t.strftime('%Y%m%dT%H%M%SZ') # ISO 8601 basic format
    date_stamp = t.strftime('%Y%m%d')

    # 2. Define Scope and Query Params
    host = f"{bucket}.s3.{region}.amazonaws.com"
    endpoint = f"https://{host}/{urllib.parse.quote(object_key)}"
    credential_scope = f"{date_stamp}/{region}/s3/aws4_request"

    query_params = {
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Credential': f"{access_key}/{credential_scope}",
        'X-Amz-Date': amz_date,
        'X-Amz-Expires': str(expires_seconds),
        'X-Amz-SignedHeaders': 'host'
    }

    # Encode query parameters lexicographically
    sorted_params = sorted(query_params.items())
    canonical_query_string = '&'.join([f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(v, safe='')}" for k, v in sorted_params])

    # 3. Construct Canonical Request
    canonical_uri = f"/{urllib.parse.quote(object_key)}"
    canonical_headers = f"host:{host}\n"
    signed_headers = "host"
    payload_hash = "UNSIGNED-PAYLOAD" # S3 GET presigned requests do not hash payload

    canonical_request = (
        "GET\n"
        f"{canonical_uri}\n"
        f"{canonical_query_string}\n"
        f"{canonical_headers}\n"
        f"{signed_headers}\n"
        f"{payload_hash}"
    )

    # 4. Construct String to Sign
    canonical_request_hash = hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()
    string_to_sign = (
        "AWS4-HMAC-SHA256\n"
        f"{amz_date}\n"
        f"{credential_scope}\n"
        f"{canonical_request_hash}"
    )

    # 5. Derive Cryptographic Signing Key
    signing_key = get_signature_key(secret_key, date_stamp, region, "s3")

    # 6. Calculate Final Signature
    signature = hmac.new(
        signing_key,
        string_to_sign.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    # 7. Generate Signed URL
    presigned_url = f"{endpoint}?{canonical_query_string}&X-Amz-Signature={signature}"
    return presigned_url

# Execution Example
if __name__ == "__main__":
    url = generate_presigned_url(
        bucket="corporate-sensitive-vault",
        object_key="audits/q4_report.pdf",
        access_key="AKIAIOSFODNN7EXAMPLE",
        secret_key="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        region="us-east-1",
        expires_seconds=1800
    )
    print("Generated Secure S3 URL:\n", url)
```

By inspecting the manual signing logic, it is clear how the URL binds authorization to a single resource and HTTP action. Any tampering with query parameters, or expiration dates on the client side instantly invalidates the signature, forcing S3 to drop the request during execution validation.
