# Securing AWS S3: Generating and Enforcing Pre-Signed URLs

## The Problem: The Security and Cost Pitfalls of Public Buckets and Proxy Servers

When building web applications, users frequently need to download secure files (like invoices or medical records) or upload their own assets (like profile photos or raw data exports). Developers often implement one of two flawed design patterns to handle these requests:

1. **Making the S3 Bucket Public**: Setting a bucket or its objects to public allows users to fetch files via raw HTTP links. This pattern is a security nightmare. It exposes the entire bucket to enumeration, crawling, and complete data exposure if directory listing is accidentally enabled or if confidential files are uploaded with predictable names.
2. **Proxying Streams Through Application Servers**: Developers read the file from S3 into application memory and stream it back to the client. This patterns scales catastrophically. Proxying gigabytes of user uploads/downloads consumes massive application server memory, exhausts thread pools, increases compute latency, and results in double data-transfer costs (S3 to EC2, then EC2 to User).

---

## Technical Architecture: Delegated Access with SigV4 Pre-signed URLs

**S3 Pre-Signed URLs** provide safe, delegated access. They grant temporary, restricted permissions to a specific user to perform a specific action (such as `GET` or `PUT`) directly against an S3 object, bypassing the application servers entirely.

The security of a pre-signed URL is enforced using the **AWS Signature Version 4 (SigV4)** signing process. The application backend uses its own highly secure, short-lived IAM credentials to sign a specific HTTP request, generating a unique signature that is appended to the URL as query parameters.

### Direct S3 Upload/Download Sequence

```
+-------------+             +---------------------+             +--------------+
| User Client |             | Application Backend |             |  Amazon S3   |
+------+------+             +----------+----------+             +------+-------+
       |                               |                               |
       | 1. Authenticate & Request     |                               |
       |    Upload (e.g. PUT URL)      |                               |
       +==============================>|                               |
       |                               |                               |
       | 2. Generate SigV4 Pre-Signed  |                               |
       |    URL with exact headers     |                               |
       |<------------------------------+                               |
       |                                                               |
       | 3. Execute Direct HTTP PUT upload with exact headers          |
       +==============================================================>|
       |                                                               |
       | 4. Validate SigV4 Signature, Expiration, and Headers          |
       |<--------------------------------------------------------------+ (Returns 200 OK)
       v
```

### Signature Enforcement Criteria

- **Cryptographic Expiration**: The URL contains an `X-Amz-Expires` parameter. Once this duration passes, S3 immediately rejects the request.
- **Header Locking**: The signature is cryptographically bound to specific HTTP headers (such as `Content-Type` or custom metadata). If the client attempts to modify these headers during upload/download, the computed signature mismatches, and S3 returns an `AccessDenied` (HTTP 403) error.

---

## Implementation: Secure Pre-Signed URL Generation in Python

The following Python script utilizes `boto3` to safely generate a secure pre-signed PUT URL. It enforces both a strict expiration time and header constraints (`Content-Type` and server-side encryption) to prevent client tampering.

```python
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from typing import Dict, Any, Optional

def generate_secure_upload_url(
    bucket_name: str,
    object_key: str,
    content_type: str,
    expiration_seconds: int = 900
) -> Optional[str]:
    """
    Generates a secure SigV4 pre-signed PUT URL to allow direct uploads to S3.
    Enforces Content-Type and Server-Side Encryption (SSE) headers.
    """
    # Force Signature Version 4 explicitly
    s3_config = Config(signature_version='s3v4')
    s3_client = boto3.client('s3', region_name='us-east-1', config=s3_config)

    # Cryptographically lock these specific headers in the signature
    params = {
        'Bucket': bucket_name,
        'Key': object_key,
        'ContentType': content_type,
        'ServerSideEncryption': 'AES256' # Enforce SSE-S3 encryption on upload
    }

    try:
        pre_signed_url = s3_client.generate_presigned_url(
            ClientMethod='put_object',
            Params=params,
            ExpiresIn=expiration_seconds
        )
        return pre_signed_url
    except ClientError as e:
        print(f"Error generating pre-signed URL: {e}")
        return None

# Example Usage
if __name__ == "__main__":
    bucket = "company-secure-user-uploads"
    key = "users/usr_98231/documents/tax_return_2025.pdf"
    mime_type = "application/pdf"

    upload_url = generate_secure_upload_url(bucket, key, mime_type)
    if upload_url:
        print("Generated Pre-Signed URL (valid for 15 minutes):\n")
        print(upload_url)
        print("\nRequired headers for PUT request:")
        print(f"  Content-Type: {mime_type}")
        print("  x-amz-server-side-encryption: AES256")
```

---

## Operational Best Practices

* **Always Validate Client Headers**: During `PUT` pre-signed URL generation, explicitly define headers like `Content-Type` and `ServerSideEncryption`. S3 will validate that the incoming client request matches these headers exactly. If omitted, malicious users could upload malicious executable scripts (e.g., `.html` containing cross-site scripting) instead of images or PDFs.
* **Keep Expirations Minimal**: Set pre-signed URL expirations to the absolute minimum necessary duration (e.g., 5 to 15 minutes for uploading files). Avoid using long-lived URLs to minimize the window of opportunity if a URL is intercepted.
* **Beware of IAM Session Limits**: The lifespan of a pre-signed URL is bounded by the credentials of the IAM entity that signed it. If the application server generates the URL using temporary credentials (e.g., an IAM Role on an EC2 instance or ECS Task), the URL will expire as soon as those temporary credentials expire (typically 1 hour), even if the URL's `ExpiresIn` parameter was set for longer.
