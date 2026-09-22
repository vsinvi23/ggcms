# DRY Terraform: Designing Reusable Modules and Multi-Environment Workspaces

## The Problem: The Copy-Paste Antipattern and Configuration Drift

As organizations scale their cloud infrastructure, they typically maintain multiple isolated staging environments (such as `dev`, `staging`, and `production`). 

A common operational failure is the "copy-paste" antipattern, where entire directory structures of Terraform resources are cloned from one environment to the next.

```
Anti-Pattern: Copy-Pasted Code Drift
infrastructure/
├── dev/
│   └── vpc.tf   <-- Code diverged over time (e.g., added extra route table manually)
├── staging/
│   └── vpc.tf   <-- Lacks the networking security group fixes applied in production
└── prod/
    └── vpc.tf   <-- Master file with unique, undocumented tweaks
```

This approach leads to several severe architectural issues:
1. **Configuration Drift:** A configuration patch applied to resolve a networking bug in `dev` is rarely ported perfectly back to `production`, resulting in environments silently diverging.
2. **Maintenance Overhead:** Adding a standard tag (e.g., `ComplianceOwner`) requires searching, editing, and verifying identical resources across dozens of disparate files.
3. **Violations of DRY (Don't Repeat Yourself):** Massive blocks of security groups, subnets, and routing table definitions are duplicated, significantly increasing the probability of configuration errors.

---

## The Solution: Highly Parameterized Modules and Directory Layering

To achieve clean, DRY infrastructure-as-code, we decouple **generic infrastructure topology** (defined in reusable, version-controlled **Modules**) from **environment-specific parameters** (defined in static **Environment Root Modules**).

```
Clean Module Consumption Flow:
+------------------------------------+
|  environment/prod/main.tf          |  <-- Enforces parameters only (e.g., CIDR, Multi-AZ)
+------------------------------------+
                  |
                  | Declares dependency & feeds variables
                  v
+------------------------------------+
|  modules/vpc/                      |  <-- Hardened, generic topology blueprint
|  * main.tf (No hardcoded values)   |  * Enforces tagging, subnet math, & security groups
|  * variables.tf (Input Validation) |
+------------------------------------+
```

### Key Architectural Guidelines:
1. **Zero Hardcoded Environment Variables in Modules:** Any property that can change between environments (instance types, IP CIDRs, cluster sizing) MUST be injected as a variable.
2. **Defensive Input Validation:** Modules must utilize Terraform's native `validation` blocks to fail early when a consumer attempts to pass invalid parameters.
3. **Dynamic Blocks:** Use dynamic block generation inside security groups or nested resources to accommodate environment variations without duplicating structure.

---

## Technical Implementation: Designing a Hardened Network Module

Below is a production-grade, highly reusable local module for a hardened VPC with automated private/public subnet partitioning.

### Step 1: The Reusable Module Definition

Create the following files in `modules/vpc/`:

```hcl
# modules/vpc/variables.tf

variable "vpc_cidr" {
  type        = string
  description = "Base CIDR block for the corporate VPC network"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0)) && split("/", var.vpc_cidr)[1] <= "20"
    description = "The VPC CIDR must be a valid IPv4 CIDR block and have a prefix length of /20 or larger."
  }
}

variable "environment" {
  type        = string
  description = "Environment identifier to enforce tag standardization"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    description = "Environment must be one of: dev, staging, prod."
  }
}

variable "availability_zones" {
  type        = list(string)
  description = "Target availability zones to map subnets across"
}
```

```hcl
# modules/vpc/main.tf

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "vpc-${var.environment}"
    Environment = var.environment
    ManagedBy   = "Terraform-DRY-Engine"
  }
}

# Automated subnet calculation using cidrsubnet() function
resource "aws_subnet" "public" {
  count                   = length(var.availability_zones)
  vpc_id                  = aws_vpc.this.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index) # E.g., 10.0.0.0/24, 10.0.1.0/24
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = var.environment == "prod" ? false : true # Disable public IPs in production

  tags = {
    Name        = "subnet-${var.environment}-public-${var.availability_zones[count.index]}"
    Environment = var.environment
    Tier        = "Public"
  }
}

resource "aws_subnet" "private" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 8) # E.g., 10.0.8.0/24, 10.0.9.0/24
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name        = "subnet-${var.environment}-private-${var.availability_zones[count.index]}"
    Environment = var.environment
    Tier        = "Private"
  }
}

output "vpc_id" {
  value       = aws_vpc.this.id
  description = "VPC ID generated by module execution"
}
```

---

### Step 2: Consuming the Module in Environment Roots

Now, developers define thin, declarative root-modules that act as config maps feeding variables directly into the modular backend.

Create the following file in `environments/prod/`:

```hcl
# environments/prod/main.tf

provider "aws" {
  region = "us-east-1"
}

# Configure remote backend tracking
terraform {
  required_version = ">= 1.5.0"
  backend "s3" {
    bucket         = "corporate-dry-state"
    key            = "environments/prod/vpc.tfstate"
    region         = "us-east-1"
    dynamodb_table = "corporate-dry-locks"
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

# Consume module without duplicating topology logic
module "production_network" {
  source = "../../modules/vpc"

  vpc_cidr           = "10.120.0.0/16"
  environment        = "prod" # Validated strictly by module schema
  availability_zones = slice(data.aws_availability_zones.available.names, 0, 3) # Map across exactly 3 AZs
}

output "prod_vpc_identifier" {
  value = module.production_network.vpc_id
}
```

---

## Sizing and Subnet Mathematics

By leveraging the `cidrsubnet(prefix, newbits, netnum)` function in our reusable module, we eliminate manual subnet collision calculations:

* `prefix` represents the master VPC network address (e.g., `10.120.0.0/16`).
* `newbits` adds additional bits to the subnet mask. Adding `4` bits to a `/16` yields `/20` subnets.
* `netnum` specifies the exact index of the derived block. 

This mathematical partition guarantees that subnets are mapped systematically without overlapping CIDR bounds, removing human miscalculations entirely from multi-region networking templates.
