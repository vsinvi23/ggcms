# DRY Terraform: Designing Reusable Modules and Multi-Environment Workspaces

## The Problem: The Copy-Paste Drift and Environment Leakage

When organizations scale their cloud footprints, they must replicate infrastructure across multiple environments (such as `development`, `staging`, and `production`). A common but highly flawed approach is to copy and paste entire directory trees of Terraform configurations.

This copy-paste pattern quickly accrues architectural security and operational debt:
1. **Configuration Drift:** Manual updates to one environment are eventually omitted in another. Over time, production diverges structurally from staging, resulting in "works in staging, breaks in prod" deployment failures.
2. **Security Gaps:** A security group ingress rule opened in `dev` for temporary troubleshooting (e.g., port 22 open to `0.0.0.0/0`) is accidentally promoted to `prod` during a bulk copy-paste merge.
3. **The Workspace Isolation Fallacy:** Standard "Terraform Workspaces" (e.g., `terraform workspace select prod`) solve duplication by using the same code block with different state slices. However, because workspaces share the **same backend bucket** and the **same IAM credential context**, a compromised developer machine or CI pipeline can accidentally wipe out the production workspace while targeting development.

---

## The Solution: Custom Reusable Modules and Directory-Based Isolation

To write DRY (Don’t Repeat Yourself) infrastructure code while maintaining absolute security isolation, organizations must design custom, highly parameterized **Terraform Modules**, called from **directory-isolated environments**.

* **Custom Modules (`/modules`):** House the core blueprint of the infrastructure (e.g., a standardized VPC with explicit, opinionated subnet layouts and flow logging). This directory does not declare providers or hardcoded environment strings.
* **Directory Isolation (`/environments`):** Each environment lives in its own folder with its own unique backend configuration, distinct state bucket, and separate IAM role context. Production is physically isolated from Development.

### Secure Multi-Environment Directory Layout

```
├── modules/
│   └── network/
│       ├── main.tf        <-- Implements standard private/public subnet layouts
│       ├── variables.tf   <-- Declares customizable inputs (CIDR, logging)
│       └── outputs.tf     <-- Exposes resource identifiers (VPC ID, Subnets)
│
└── environments/
    ├── dev/
    │   ├── backend.tf     <-- Points to 'dev-terraform-state' S3 bucket
    │   └── main.tf        <-- Calls '../modules/network' with small CIDR & no flow-logs
    │
    └── prod/
        ├── backend.tf     <-- Points to 'prod-terraform-state' S3 bucket (Restricted)
        └── main.tf        <-- Calls '../modules/network' with full CIDR, strict multi-AZ, and enabled logs
```

---

## Technical Implementation: Standardizing the Network Module

The code below implements a standard network module that can be instantiated with custom parameters across dev and prod environments.

### `modules/network/variables.tf`

```hcl
# modules/network/variables.tf

variable "vpc_cidr" {
  type        = string
  description = "The primary CIDR block for the VPC"
}

variable "environment" {
  type        = string
  description = "Target environment name (dev, staging, prod)"
}

variable "enable_flow_logs" {
  type        = bool
  default     = false
  description = "If true, provision VPC flow logs to CloudWatch"
}
```

### `modules/network/main.tf`

```hcl
# modules/network/main.tf

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "vpc-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_subnet" "private" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, 1) # Auto-calculate subnets securely
  availability_zone = "us-east-1a"

  tags = {
    Name = "subnet-private-${var.environment}"
  }
}

# Standardized VPC Flow Log Security Control
resource "aws_flow_log" "vpc_log" {
  count           = var.enable_flow_logs ? 1 : 0
  log_destination = "arn:aws:s3:::corporate-audit-logs"
  traffic_type    = "ALL"
  vpc_id          = aws_vpc.main.id
}
```

---

## Consuming Modules inside Environments: Dev vs. Prod

Using our module, developers and operators can declare distinct, zero-drift environments. Notice how the Production configuration enforces strict audit controls, while the Development configuration optimizes for cost.

### `environments/dev/main.tf`

```hcl
# environments/dev/main.tf

provider "aws" {
  region = "us-east-1"
  # Uses local development AWS IAM credential profile
  profile = "company-dev"
}

module "vpc" {
  source           = "../../modules/network"
  vpc_cidr         = "10.10.0.0/16"
  environment      = "dev"
  enable_flow_logs = false # Disabled flow logs in dev to reduce costs
}
```

### `environments/prod/main.tf`

```hcl
# environments/prod/main.tf

provider "aws" {
  region = "us-east-1"
  # Enforces assume-role strictly linked to production CI environment keys
  profile = "company-prod"
}

module "vpc" {
  source           = "../../modules/network"
  vpc_cidr         = "10.20.0.0/16"
  environment      = "prod"
  enable_flow_logs = true # MANDATORY security policy control for production audit trails
}
```

By separating variables and backends while reusing code blueprints in `/modules`, teams eliminate duplicate configurations and ensure that any core architecture update in `/modules` can be safely vetted in `dev` and seamlessly integrated into `prod`.
