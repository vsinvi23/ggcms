---
title: "AWS PrivateLink: Interfacing with Services without Internet Transit"
description: "How AWS PrivateLink and VPC Endpoints eliminate NAT Gateway data-exfiltration risk, the difference between Gateway and Interface endpoints, and how to lock them down with endpoint policies using Terraform."
type: "ARTICLE"
categorySlug: "cloud-platforms"
articleType: "GUIDE"
tags:
  - "aws"
  - "privatelink"
  - "vpc-endpoints"
  - "networking"
  - "terraform"
  - "zero-trust"
---

# AWS PrivateLink: Interfacing with Services without Internet Transit

## The Data Exfiltration Problem

In a traditional AWS architecture, a Virtual Private Cloud (VPC) is isolated from the outside world. However, if your private EC2 instances need to interact with AWS managed services (like S3, DynamoDB, or KMS) or third-party SaaS providers (like Datadog or Snowflake), they typically require outbound internet access.

To facilitate this, architects often place instances in private subnets and route their traffic through a NAT Gateway in a public subnet. The NAT Gateway translates the private IP to a public IP, allowing the traffic to traverse the public internet to reach the AWS service API.

This creates a massive security vulnerability. If a malicious actor compromises the instance, they can use that same NAT Gateway to exfiltrate sensitive data to an external, attacker-controlled server.

To achieve a true "zero trust" network architecture, we must eliminate the NAT Gateway and keep all API traffic entirely within the AWS backbone. The solution is **AWS PrivateLink** (VPC Endpoints).

## Mental Model: VPC Endpoints vs. NAT Gateways

A NAT Gateway is a generic door to the entire internet. A VPC Endpoint (powered by AWS PrivateLink) is a dedicated, encrypted, point-to-point tunnel between your VPC and a specific service.

When you provision a VPC Endpoint, AWS creates Elastic Network Interfaces (ENIs) inside your private subnets. These ENIs are assigned private IP addresses from your VPC's CIDR block. When your application tries to reach `kms.us-east-1.amazonaws.com`, AWS DNS routes the request to the local ENI, completely bypassing the internet.

```text
[ Bad Architecture: NAT Gateway ]
Private EC2 -> Route Table -> NAT Gateway (Public IP) -> The Public Internet -> AWS KMS

[ Good Architecture: AWS PrivateLink ]
Private EC2 -> VPC Endpoint ENI (Private IP: 10.0.1.15) -> AWS Backbone -> AWS KMS
(No Internet Gateway or NAT Gateway required)
```

## Gateway vs. Interface Endpoints

AWS offers two types of VPC Endpoints:

1. **Gateway Endpoints**: Only available for S3 and DynamoDB. They work by automatically updating your VPC route tables to direct traffic for the S3/DynamoDB prefix lists to the endpoint. There is no hourly charge for Gateway Endpoints.
2. **Interface Endpoints (PrivateLink)**: Available for almost all other AWS services (KMS, SNS, SQS, STS) and third-party SaaS. These create physical ENIs in your subnets and rely on AWS Private DNS to resolve service URLs to those local ENIs. They incur an hourly charge per Availability Zone.

## Implementation: Provisioning Endpoints via Terraform

To secure a VPC, we must create a Gateway Endpoint for S3 and an Interface Endpoint for KMS, ensuring that instances can encrypt data and store it without any internet transit.

### Step 1: The Gateway Endpoint (S3)

```hcl
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.us-east-1.s3"

  # Gateway endpoints require Route Table associations
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]
}
```

### Step 2: The Interface Endpoint (KMS)

Because Interface Endpoints place ENIs inside your subnets, you must assign them a Security Group. This Security Group acts as a firewall for the API endpoint itself.

```hcl
resource "aws_security_group" "kms_endpoint_sg" {
  name        = "kms-vpc-endpoint-sg"
  vpc_id      = aws_vpc.main.id

  # Only allow HTTPS traffic from the VPC CIDR
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }
}

resource "aws_vpc_endpoint" "kms" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.us-east-1.kms"
  vpc_endpoint_type = "Interface"

  # Place ENIs in your private subnets
  subnet_ids = [aws_subnet.private_az1.id, aws_subnet.private_az2.id]

  security_group_ids = [aws_security_group.kms_endpoint_sg.id]

  # Override default AWS DNS to point to the ENIs
  private_dns_enabled = true
}
```

## Hardening with VPC Endpoint Policies

The true power of PrivateLink lies in Endpoint Policies. An Endpoint Policy is an IAM resource policy attached directly to the VPC Endpoint. It dictates *who* can pass through the tunnel.

Even if an attacker steals valid IAM credentials, you can block them from using your Endpoint to access their own external AWS accounts.

```json
{
  "Statement": [
    {
      "Action": "*",
      "Effect": "Allow",
      "Resource": "*",
      "Principal": "*"
    },
    {
      "Action": "s3:PutObject",
      "Effect": "Deny",
      "Resource": "*",
      "Principal": "*",
      "Condition": {
        "StringNotEquals": {
          "s3:ResourceAccount": "123456789012"
        }
      }
    }
  ]
}
```

This policy explicitly denies uploading data to any S3 bucket that does not belong to your organization's AWS account (`123456789012`), preventing a sophisticated form of data exfiltration — a stolen credential can still authenticate, but the endpoint itself refuses to forward the request to a foreign account's bucket.

## Key Takeaways

1. **A NAT Gateway is a generic door to the internet; a VPC Endpoint is a dedicated tunnel to one specific service** — the difference matters because a compromised instance behind a NAT Gateway can reach any external host, while one behind a PrivateLink-only architecture cannot reach the internet at all.
2. **Gateway Endpoints (S3, DynamoDB) are free and route-table-based; Interface Endpoints are ENI-based and billed hourly per AZ** — pick Gateway endpoints wherever the target service supports them.
3. **Endpoint Policies are a second, independent layer of defense on top of IAM** — they constrain what the tunnel itself will forward, even for credentials that IAM alone would authorize.
4. **PrivateLink should be the default architecture** for any private subnet talking to AWS services or approved SaaS providers, with NAT Gateways reserved for genuinely arbitrary outbound internet needs.
