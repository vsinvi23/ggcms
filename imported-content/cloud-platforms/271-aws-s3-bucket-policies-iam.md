# AWS S3 Security: Bucket Policies and IAM Roles Intersection

## The Problem: The S3 Authorization Maze and Data Leaks
AWS Simple Storage Service (S3) is the backbone of cloud data lakes, but it is also one of the most common vectors for catastrophic data leaks. This vulnerability stems from the complex, multi-layered authorization system that AWS uses to evaluate access requests. Many platform engineers do not fully grasp how identity-based policies (IAM Roles) and resource-based policies (Bucket Policies) intersect.

In multi-tenant or cross-account architectures, relying solely on IAM user policies is dangerous. Misconfiguring a bucket policy can easily override security boundaries or expose data to the public internet, even if your global account block-public-access settings are enabled. Understanding the precise math of AWS evaluation logic is critical to hardening your cloud storage assets.

## Mental Model: AWS S3 Evaluation Logic Flow
Every request to an S3 object is evaluated by a logical engine that analyzes multiple policy layers. The core rule to remember is: **An explicit deny in any policy always overrides any allows.**

```
       [ Incoming Request to S3 Bucket ]
                       │
                       v
            ┌──────────────────────┐
            │ Is there an EXPLICIT │ ──( Yes )──> [ Deny Access ]
            │   DENY in any layer? │
            └──────────────────────┘
                       │ ( No )
                       v
         ┌────────────────────────────┐
         │ Is the request origin from │
         │    the SAME AWS Account?   │
         └────────────────────────────┘
             │ ( Yes )           │ ( No - Cross-Account )
             v                   v
   ┌───────────────────┐   ┌───────────────────────────┐
   │ Is there an ALLOW │   │ Is there an ALLOW in BOTH │
   │ in IAM or Bucket  │   │  IAM and Bucket Policy?   │
   │      Policy?      │   └───────────────────────────┘
   └───────────────────┘                 │
       │ ( Yes )                         ├─ ( Yes ) ──> [ Allow Access ]
       v                                 │
[ Allow Access ]                         └─ ( No )  ──> [ Deny Access ]
```

### The Cross-Account Trap
For same-account access, a request is authorized if *either* the IAM policy *or* the Bucket policy allows it. However, for cross-account requests, the rule changes: **Both the IAM policy (in the caller's account) AND the Bucket policy (in the resource owner's account) must explicitly allow the action.** If either is missing, the request is denied.

## The Architectural Solution: Enforcing the Least-Privilege Intersection
To prevent S3 leaks, you should combine IAM and Bucket Policies intentionally.
1. **Use IAM Roles for Identity Delegation**: Grant specific application pods or serverless functions granular permissions to read or write to specific prefixes.
2. **Use Bucket Policies as Guardrails**: Restrict access to specific VPC Endpoints (`aws:sourceVpce`) and enforce TLS 1.2+ encryption for all objects in transit.

## Implementation: Hardening S3 Access Configurations

Here is a secure implementation demonstrating the intersection. We configure a bucket policy that denies all traffic unless it originates from a specific VPC Endpoint, alongside an IAM Role allowing read/write operations.

### 1. Hardened S3 Bucket Policy (`bucket-policy.json`)
This bucket policy allows access to an IAM Role but blocks any traffic that does not transit through our private VPC Endpoint (VPCE):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EnforceTLSRequestsOnly",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::production-financial-records",
        "arn:aws:s3:::production-financial-records/*"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    },
    {
      "Sid": "RestrictAccessToVPCEndpointOnly",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::production-financial-records",
        "arn:aws:s3:::production-financial-records/*"
      ],
      "Condition": {
        "StringNotEquals": {
          "aws:sourceVpce": "vpce-0123456789abcdef0"
        }
      }
    }
  ]
}
```

### 2. Granting IAM Role Permissions (`iam-policy.json`)
Staged in the identity's home account, this policy grants read/write permissions to our microservice role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadWriteAccessToRecords",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::production-financial-records",
        "arn:aws:s3:::production-financial-records/*"
      ]
    }
  ]
}
```

## Verifying Policy Effectiveness
Test your configuration using the AWS CLI inside your private network to confirm that operations succeed:
```bash
aws s3 cp local-report.csv s3://production-financial-records/reports/
```
Now, attempt to access the bucket from an authorized IAM user credentials but from an external internet connection (outside the VPC Endpoint). The operation will fail with:
```bash
An error occurred (AccessDenied) when calling the ListObjectsV2 operation: Access Denied
```
This proves that the resource-based `Deny` condition overrides the identity-based `Allow` permission, creating a bulletproof security perimeter around your sensitive data.
