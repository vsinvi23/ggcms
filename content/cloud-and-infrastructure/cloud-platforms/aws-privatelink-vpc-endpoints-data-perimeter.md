---
title: "AWS PrivateLink: VPC Endpoints, Hyperplane, and Blocking Data Exfiltration"
description: "How AWS PrivateLink routes traffic to AWS services and SaaS backends over the private AWS backbone instead of NAT gateways, and how to pair Interface VPC Endpoints with strict endpoint policies to build a zero-trust data perimeter in Terraform."
categorySlug: "cloud-platforms"
articleType: "GUIDE"
tags:
  - "aws-privatelink"
  - "vpc-endpoints"
  - "data-exfiltration"
  - "terraform"
  - "network-security"
  - "hyperplane"
---

# AWS PrivateLink: Interface Endpoint Security and Blocking Data Exfiltration

## The Problem: NAT Gateways and the Outbound Exfiltration Loophole

To access native AWS services (such as Amazon S3, SQS, or AWS Secrets Manager) from an isolated, private subnet within an AWS VPC, architects historically provisioned an Internet Gateway (IGW) or a NAT Gateway. This configuration routes all API requests bound for `*.amazonaws.com` over the public internet to AWS's public edge interfaces.

While this allows workloads to function, it introduces several severe problems:

1. **Unrestricted Outbound Access / Data Exfiltration:** A NAT Gateway cannot distinguish between a legitimate API call to a corporate-owned S3 bucket and an illegitimate API call to an anonymous, attacker-controlled S3 bucket. If a compute instance in the private subnet is compromised, an attacker can use standard AWS CLI commands to exfiltrate database backups, proprietary code, or keys directly to an external bucket — completely bypassing standard network-layer firewall inspection.
2. **Massive Operational NAT Costs:** Routing private VPC traffic to the public internet requires deploying AWS NAT Gateways. At roughly $0.045 per hour plus $0.045 per GB of data processed, high-throughput pipelines processing terabytes of data incur thousands of dollars in NAT charges monthly.
3. **Regulatory Compliance Violations:** Standards like PCI-DSS, HIPAA, and GDPR explicitly mandate that sensitive data transit must be kept within isolated, private network boundaries, free from public routability.

---

## The Solution: AWS PrivateLink, Hyperplane, and Endpoint Policies

**AWS PrivateLink** solves these problems by establishing a private connection between your VPC and supported AWS services, or third-party SaaS services, without traversing the public internet.

Under the hood, PrivateLink utilizes **AWS Hyperplane**, a multi-tenant, distributed stateful network virtualization platform. Hyperplane provisions **Interface VPC Endpoints**, represented as Elastic Network Interfaces (ENIs) with private IP addresses directly inside your private subnets, and routes traffic entirely within the AWS internal network backbone.

Crucially, because the connection is localized as an ENI, you can attach an **Endpoint Policy** to it — an IAM-style resource policy that sits at the network boundary, controlling exactly *who* can use the endpoint and *what* resources they can access. This is what closes the exfiltration loophole a plain NAT Gateway cannot.

### Insecure NAT Routing vs. Secure PrivateLink Data Perimeter

```text
INSECURE: Routing via NAT (Exfiltration Risk)
[ Private Subnet VM ] ===(NAT Gateway)===> [ Public S3 Endpoint ] ===> Attacker's S3 Bucket (OK)
                                                                 ===> Corporate S3 Bucket (OK)

SECURE: PrivateLink + VPC Endpoint Policy (Restricted Perimeter)
+--------------------------------------------------------------+
| Private Subnet (No Internet / NAT Routes)                    |
|  [ Compute VM ]                                              |
+-------|--------------------------------------------------------+
        | (Private DNS: s3.us-east-1.amazonaws.com)
        v
+--------------------------------------------------------------+
| VPC S3 Interface Endpoint (ENI with Private IP, via Hyperplane)|
|  - Security Group: Port 443 strictly from Subnet             |
|  - Endpoint Policy: Allow S3 actions ONLY to Corporate Buckets|
+-------|--------------------------------------------------------+
        |
        |=== (AWS Global Backbone - No Public Internet) ===> Corporate S3 Bucket (ALLOWED)
        |=== (AWS Global Backbone - No Public Internet) ===x Attacker's S3 Bucket (BLOCKED)
```

When the application attempts to reach an AWS service or a registered SaaS endpoint, DNS resolution (via `private_dns_enabled`) directs the request to the private IP of the Interface Endpoint instead of the service's public address. The traffic remains entirely inside the AWS regional network backbone, routed by Hyperplane's distributed state machine rather than by a standard NAT device.

---

## Technical Configuration: Enforcing an S3 Data Perimeter in Terraform

The Terraform configuration below provisions an AWS S3 Interface VPC Endpoint and attaches a zero-trust Endpoint Policy. This policy enforces a strict data perimeter: it allows access only to a named corporate bucket, and explicitly denies any traffic whose target resource does not belong to the organization's own AWS account.

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

This configuration guarantees that even if a compute instance is fully compromised, any attempt to run a command like `aws s3 cp backup.sql s3://some-unauthorized-bucket/` will instantly fail with an `AccessDenied` error at the VPC endpoint level. It turns a standard flat VPC network into a cryptographically closed enclave, eliminating a major vector for cloud-native data exfiltration.

### Applying the Same Pattern to a Second Service: Secrets Manager

The same Interface Endpoint pattern applies to any PrivateLink-supported service. Here is a companion endpoint for AWS Secrets Manager, with its own dedicated security group scoped to a single application subnet:

```hcl
resource "aws_security_group" "endpoint_sg" {
  name        = "secrets-manager-endpoint-sg"
  description = "Allows inbound HTTPS traffic to the PrivateLink Endpoint"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS from application subnet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [aws_subnet.private_a.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_vpc_endpoint" "secrets_manager" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.us-east-1.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [aws_subnet.private_a.id]
  security_group_ids  = [aws_security_group.endpoint_sg.id]
  private_dns_enabled = true # Overrides public DNS for Secrets Manager
}
```

---

## Operational Best Practices

* **Enable Private DNS**: Always set `private_dns_enabled = true` on your Interface VPC Endpoints. This overrides the default public DNS resolution for the target service (e.g., `secretsmanager.us-east-1.amazonaws.com`) to resolve to the private IP of your endpoint ENIs, eliminating the need to modify application connection strings.
* **Apply Endpoint Policies, not just Security Groups**: Security Groups control network-layer reachability (which ports, which subnets); Endpoint Policies control the resource-layer question of which specific S3 buckets, KMS keys, or Secrets Manager secrets can be reached through that endpoint. Both layers are needed — Security Groups alone cannot stop an authenticated call to an unauthorized bucket.
* **Cross-AZ Redundancy**: Always deploy your VPC Interface Endpoints across multiple Availability Zones. PrivateLink endpoints are highly available within an AZ, but mapping them to subnets in multiple AZs ensures your infrastructure is resilient to single-AZ AWS network disruptions.
* **Verify enforcement, don't assume it**: Test both a legitimate in-VPC call (which should succeed) and an out-of-perimeter call from outside the VPC endpoint (which should fail with `AccessDenied`) before relying on the perimeter in production.
