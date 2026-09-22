# Securing AWS S3: Inside the Signature Version 4 (SigV4) Pre-Signed URL Lifecycle

## The Problem: Securely Delegating Temporary Access
In modern web applications, routing large file uploads or downloads through an application backend is an anti-pattern. It consumes bandwidth, ties up worker threads, and degrades performance. The optimal pattern is Direct-to-Cloud storage: the client (browser or mobile app) uploads directly to an S3 bucket.
However, S3 buckets must remain private. You cannot give mobile clients long-lived IAM credentials. How do you grant a completely untrusted client temporary, restricted access to upload a specific file to a specific S3 path?

## The Solution: SigV4 Pre-Signed URLs
AWS Signature Version 4 (SigV4) is the cryptographic protocol used to authenticate all AWS API requests. A Pre-Signed URL is simply an S3 API request where the authentication signature is pre-calculated by a trusted backend (which holds IAM credentials) and embedded into the URL's query parameters. The untrusted client then executes the HTTP request using this URL.

### Architecture Breakdown
The lifecycle involves three parties: the untrusted Client, the trusted Backend (holding IAM keys), and AWS S3.

```text
+-----------+                                +---------------+
|           | 1. Request Upload Intent       |               |
|  Client   |------------------------------->|  App Backend  |
| (Browser) | (Filename, File Size, Type)    | (Holds IAM    |
|           |                                |  Credentials) |
+-----------+                                +---------------+
      |                                              | 2. Validate AuthZ
      |                                              | 3. Generate SigV4 
      |                                              |    Pre-Signed URL
      | 4. Return Pre-Signed URL                     |
      |<---------------------------------------------+
      |
      | 5. HTTP PUT (or GET) using Pre-Signed URL
      |----------------------------------------------------> +-----------+
                                                             |           |
                                                             |  AWS S3   |
                                                             |           |
                                                             +-----------+
```

### Technical Implementation: The Signing Math
The security of SigV4 relies on HMAC-SHA256 hashing. The backend does not simply sign the URL; it signs the *exact context* of the request. If the client alters *anything* (the HTTP method, the path, the headers), the signature becomes invalid and S3 rejects the request.

#### 1. Creating the Canonical Request
The backend standardizes the HTTP request it expects the client to make.
```text
HTTPRequestMethod \n
CanonicalURI \n
CanonicalQueryString \n
CanonicalHeaders \n
SignedHeaders \n
HashedPayload 
```
For a pre-signed URL, the `HashedPayload` is typically the string `UNSIGNED-PAYLOAD` (so the backend doesn't need the file contents to sign it).

#### 2. Creating the String to Sign
The backend creates a string incorporating the timestamp and credential scope.
```text
Algorithm (AWS4-HMAC-SHA256) \n
RequestDateTime (e.g., 20231025T090000Z) \n
CredentialScope (YYYYMMDD/region/service/aws4_request) \n
HashedCanonicalRequest (SHA256 hash of Step 1)
```

#### 3. Deriving the Signing Key
This is the brilliant part of SigV4. The AWS Secret Access Key is never used directly to sign the request. Instead, a temporary, scoped signing key is derived via successive HMAC operations:
```python
kSecret = "<Your_AWS_Secret_Access_Key>"
kDate = HMAC("AWS4" + kSecret, "20231025")
kRegion = HMAC(kDate, "us-east-1")
kService = HMAC(kRegion, "s3")
kSigning = HMAC(kService, "aws4_request")
```

#### 4. Calculating the Signature
The final signature is the HMAC-SHA256 of the `String to Sign` using the derived `kSigning` key.
```python
Signature = HexEncode(HMAC(kSigning, StringToSign))
```

### Security Controls and Limitations

#### Expiration
Pre-signed URLs have a strict expiration time (embedded in the `X-Amz-Expires` query parameter), typically limited to 15 minutes to 7 days, depending on the credential type used to generate them (IAM user vs. STS session token).

#### Immutability of Intent
Because the signature is calculated over the `CanonicalURI` and specific HTTP verbs, a client cannot take a URL signed for a `GET` request and use it to execute a `PUT` request. 

#### Defense in Depth
While Pre-Signed URLs grant access, they are still subject to S3 Bucket Policies and IAM boundaries. If the IAM role generating the signature lacks `s3:PutObject` permissions, the resulting URL will yield a 403 Forbidden, regardless of cryptographic validity.

By utilizing SigV4 math, developers can securely decouple large payload transit from their application servers, ensuring highly scalable and mathematically secure Direct-to-Cloud data transfers.
