# AWS PrivateLink: Interfacing with Services without Internet Transit

## The Problem: Data Exfiltration and the Excessive Cost of NAT Gateways

In enterprise cloud security, routing traffic over the public internet to reach SaaS platforms, APIs, or even internal AWS-native services (like KMS, Secrets Manager, or SQS) is an unacceptable architectural risk. This naive approach introduces several severe problems:

1. **Massive Operational NAT Costs**: Routing private VPC traffic to the public internet requires deploying AWS NAT Gateways. At $0.045 per hour plus $0.045 per GB of data processed, high-throughput pipelines processing terabytes of data incur thousands of dollars in NAT charges monthly.
2. **Data Exfiltration and Security Surface**: Private workloads require route paths to an Internet Gateway to communicate with external APIs. This expands the security boundary, increasing the risk of data exfiltration or host compromise if a security group or firewall rule is misconfigured.
3. **Regulatory Compliance Violations**: Standards like PCI-DSS, HIPAA, and GDPR explicitly mandate that sensitive data transit must be kept within isolated, private network boundaries, free from public routability.

---

## Technical Architecture: Private Link Integration via Hyperplane

**AWS PrivateLink** resolves these challenges by providing highly secure, private connectivity between VPCs, AWS services, and on-premises networks without exposing traffic to the public internet. 

Under the hood, PrivateLink utilizes **AWS Hyperplane**, a multi-tenant, distributed stateful network virtualization platform. Hyperplane maps an **Interface VPC Endpoint** (represented as an Elastic Network Interface [ENI] with a private IP address) directly into your private subnet.

### The Private Traversal Pattern

```
+------------------------------------------------------------------------+
|                      CONSUMER VPC (10.0.0.0/16)                        |
|                                                                        |
|  +--------------------+                     +-----------------------+  |
|  |   App Instance     |                     | Interface Endpoint    |  |
|  |   (10.0.1.105)     |====================>| (ENI - 10.0.1.50)     |  |
|  +--------------------+  Private ENI-to-ENI | +-------------------+ |  |
|                          Transit (Hyperplane| | Security Group    | |  |
+---------------------------------------------|-| Denies Outbound   | |'-+
                                              | | Internet Traffic  | |
                                              | +-------------------+ |
                                              +-----------+-----------+
                                                          |
                                                          | Private Link (Hyperplane)
                                                          v
+------------------------------------------------------------------------+
|                      PROVIDER VPC / AWS SERVICES                       |
|                                                                        |
|                         +-----------------------+                      |
|                         | Network Load Balancer |                      |
|                         +-----------+-----------+                      |
|                                     |                                  |
|                                     v                                  |
|                         +-----------------------+                      |
|                         | Target SaaS Backend / |                      |
|                         | AWS Native Service    |                      |
|                         +-----------------------+                      |
+------------------------------------------------------------------------+
```

When the application attempts to reach Secrets Manager or a registered SaaS endpoint, DNS resolution directs the request to the private IP of the interface endpoint. The traffic remains entirely inside the AWS regional network backbone.

---

## Implementation: Provisioning Private Endpoints in Terraform

The following Terraform configuration creates an Interface VPC Endpoint for AWS Secrets Manager inside a private VPC, complete with custom Security Groups restricting access strictly to the application instances.

```hcl
# 1. VPC & Subnet Definitions
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
}

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "us-east-1a"
}

# 2. Strict Security Group for the VPC Endpoint
resource "aws_security_group" "endpoint_sg" {
  name        = "secrets-manager-endpoint-sg"
  description = "Allows inbound HTTPS traffic to the PrivateLink Endpoint"
  vpc_id      = aws_vpc.main.id

  # Inbound: Allow application subnet to communicate on port 443 (HTTPS)
  ingress {
    description = "HTTPS from application subnet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [aws_subnet.private_a.cidr_block]
  }

  # Outbound: Deny all egress (Endpoints are strictly inbound receivers)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# 3. Provision the Interface VPC Endpoint (AWS Secrets Manager)
resource "aws_vpc_endpoint" "secrets_manager" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.us-east-1.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [aws_subnet.private_a.id]
  security_group_ids  = [aws_security_group.endpoint_sg.id]
  private_dns_enabled = true # Automatically overrides public DNS for Secrets Manager
}
```

---

## Operational Best Practices

* **Enable Private DNS**: Always set `private_dns_enabled = true` on your Interface VPC Endpoints. This overrides the default public DNS resolution for the target service (e.g., `secretsmanager.us-east-1.amazonaws.com`) to resolve to the private IP of your endpoint ENIs, eliminating the need to modify application connection strings.
* **Apply VPC Endpoint Policies**: Do not rely solely on Security Groups. Attach strict **Endpoint Policies** (IAM-like resource policies) to the VPC Endpoint to limit which principals can utilize the endpoint and what actions they can perform. For example, block all requests except those targeted at specific AWS KMS keys or S3 buckets.
* **Cross-AZ Redundancy**: Always deploy your VPC Interface Endpoints across multiple Availability Zones. PrivateLink endpoints are highly available within an AZ, but mapping them to subnets in multiple AZs ensures that your infrastructure is resilient to single-AZ AWS network disruptions.
