---
title: "Securing AWS S3: Generating and Enforcing Pre-Signed URLs"
description: "How to replace public S3 buckets and backend proxy uploads with boto3-generated pre-signed URLs, hardened with a bucket policy that enforces TLS and validated upload constraints."
type: "ARTICLE"
categorySlug: "cloud-platforms"
articleType: "GUIDE"
tags:
  - "aws"
  - "s3"
  - "presigned-urls"
  - "boto3"
  - "bucket-policy"
  - "iam"
---

# Securing AWS S3: Generating and Enforcing Pre-Signed URLs

## The Problem: The Vulnerability of Public S3 Buckets

Exposing raw assets directly to the public internet is one of the most common causes of cloud data breaches. For applications that handle user-generated files — such as medical records, personal avatars, or corporate invoices — objects must remain strictly private.

However, clients still need to download and upload these files. A naive architecture might solve this by:

1. Making the S3 bucket public, exposing all assets to unauthorized users.
2. Routing all file uploads/downloads through the application backend, which wastes backend CPU, memory, and network bandwidth (data transfer costs).
3. Hardcoding AWS IAM credentials in client-side applications (a critical security vulnerability).

```text
Vulnerable Pattern (Public Bucket):
[ Client ] ---------------------> [ Public S3 Bucket ] (Anyone can access all files!)

Vulnerable Pattern (Hardcoded Credentials):
[ Client with Hardcoded Access Key ] ---> [ Private S3 Bucket ] (Keys can be extracted!)
```

To balance scalability and security, organizations must enforce a secure-by-default architecture: keep the bucket 100% private and delegate temporary access on demand.

## The Mental Model: Cryptographically Signed Delegation

Pre-signed URLs solve this problem by leveraging AWS Signature Version 4 to delegate specific, temporary permissions from a trusted entity (the backend service) to an untrusted client (the browser or mobile app).

```text
+----------------+          1. Request Upload URL          +-------------------+
|                | --------------------------------------->|                   |
| Frontend Client|                                         |  Backend Service  |
|                | <---------------------------------------| (IAM Role/Boto3)  |
+----------------+          2. Return Pre-signed URL       +-------------------+
        |                                                            |
        | 3. PUT File (Direct S3 upload)                             | Cryptographic
        v                                                            v signature via SigV4
+------------------------------------------------------------------------------+
|                                AWS S3 Service                                |
+------------------------------------------------------------------------------+
```

The backend service, running under an IAM role with appropriate S3 permissions, uses its credentials to calculate an AWS Signature Version 4 (SigV4) hash. This hash is appended to the URL as query parameters. When the client presents this URL to S3, S3 validates the cryptographic signature. If the signature matches, the URL has not expired, and the original backend IAM role still has permission, S3 executes the request.

## Technical Implementation: Generating and Enforcing URLs

Below is a Python application snippet using `boto3` that generates a secure pre-signed upload (PUT) URL. It is accompanied by an S3 bucket policy that forces transit encryption (TLS) and validates the upload constraints.

### 1. Python Code (Backend URL Generation)

```python
import boto3
from botocore.exceptions import ClientError

def create_presigned_upload_url(bucket_name, object_name, expiration=600):
    """
    Generate a pre-signed URL to upload a file directly to S3 via PUT.
    Strictly limit expiration to 10 minutes (600 seconds) and restrict content-type.
    """
    s3_client = boto3.client(
        's3',
        config=boto3.session.Config(signature_version='s3v4', region_name='us-east-1')
    )
    try:
        response = s3_client.generate_presigned_url(
            ClientMethod='put_object',
            Params={
                'Bucket': bucket_name,
                'Key': object_name,
                'ContentType': 'application/pdf',
                'ServerSideEncryption': 'aws:kms'
            },
            ExpiresIn=expiration
        )
    except ClientError as e:
        # Log and handle error securely
        return None
    return response
```

### 2. S3 Bucket Policy Enforcement

To ensure that pre-signed uploads are not bypassed and that data is always protected in transit, apply this S3 bucket policy:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "EnforceSSLOnly",
            "Effect": "Deny",
            "Principal": "*",
            "Action": "s3:*",
            "Resource": [
                "arn:aws:s3:::company-secure-uploads",
                "arn:aws:s3:::company-secure-uploads/*"
            ],
            "Condition": {
                "Bool": {
                    "aws:SecureTransport": "false"
                }
            }
        }
    ]
}
```

## Deep Dive: Critical Security Parameters

When S3 processes a pre-signed URL request, it inspects several query parameters:

- **`X-Amz-Algorithm`**: Identifies the cryptographic algorithm (e.g., `AWS4-HMAC-SHA256`).
- **`X-Amz-Credential`**: Binds the request to the backend's IAM identity and active scope.
- **`X-Amz-Expires`**: Dictates the expiration window (e.g., `600` seconds). S3 rejects requests if the current time is greater than `X-Amz-Date` + `X-Amz-Expires`.
- **`X-Amz-SignedHeaders`**: Lists headers that were included in the signature calculation (such as `Host`, `Content-Type`, or encryption headers). If the client does not send *exactly* matching headers during the upload, S3 rejects the request, preventing header tampering.

## Key Takeaways

1. **Never make a bucket public just to serve files** — a pre-signed URL grants exactly one action on exactly one object, for a bounded time window, without changing bucket-level ACLs.
2. **Keep expiration windows short.** 600 seconds is generous for a browser upload; shrink it further for high-sensitivity workloads.
3. **Pair pre-signed URLs with a bucket policy that denies non-TLS traffic** — the signature protects authorization, but `aws:SecureTransport` protects the bytes on the wire.
4. **Pin `ContentType` and `ServerSideEncryption` in the signed parameters**, not just in the client's request headers, so S3 itself rejects mismatched uploads rather than trusting the client to behave.

By implementing pre-signed URLs with strict expirations, enforcing TLS, and verifying request headers, you can build a highly scalable, secure upload pipeline that completely insulates your private S3 buckets from exposure.
