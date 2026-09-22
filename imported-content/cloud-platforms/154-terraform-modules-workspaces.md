# Scaling Infrastructure as Code: Terraform Modules and Workspaces

## The Problem: The Blast Radius of Monolithic IaC

When organizations begin their Infrastructure as Code (IaC) journey, they often start with a single, monolithic Terraform configuration directory. All resources—VPCs, routing tables, security groups, database instances, and compute clusters—are declared in a massive, multi-thousand-line `main.tf` file. 

This approach quickly runs into scaling limits. First, the **blast radius** is dangerously high: a minor modification to a tag or a firewall rule in a single file could accidentally trigger the recreation or deletion of a critical production database. Second, provisioning identical environments for development, staging, and production requires copy-pasting code trees. This creates configuration drift, as variables and module definitions diverge over time.

```
Monolithic IaC (High Blast Radius):
[ main.tf (VPC, Subnets, DB, K8s, DNS) ] ---> Single State File (s3://terraform.tfstate)
                                              | (One typo can delete everything!)
                                              v
                                       Target Cloud Providers
```

To manage cloud resources safely at scale, platform teams must adopt dry (Don't Repeat Yourself) design principles, splitting configurations into reusable building blocks and managing isolated deployment environments.

---

## The Mental Model: Modules as Functions, Workspaces as Environments

To scale Terraform, we must distinguish between modularizing code and separating environment states:

```
+-----------------------------------------------------------+
|             Terraform Reusable Modules (The Blueprint)     |
+-----------------------------------------------------------+
                              |
                              v Instantiates
+-----------------------------------------------------------+
|             Terraform Workspaces (Separated States)       |
+-----------------------------------------------------------+
         |                                         |
         v active="dev"                            v active="prod"
+---------------------------+             +---------------------------+
| dev.tfstate (Dev Resources) |             | prod.tfstate (Prod Resources) |
+---------------------------+             +---------------------------+
```

1. **Terraform Modules:** Act as reusable templates or functions. They accept inputs (`variables.tf`), provision a logical group of resources, and return outputs (`outputs.tf`). They allow you to bundle infrastructure patterns (like an AWS VPC with private subnets and NAT gateways) into a standardized, audited package.
2. **Terraform Workspaces:** Act as isolated state instances of the exact same configuration directory. When you switch workspaces, Terraform points to a completely separate state file (e.g., `dev.tfstate` vs. `prod.tfstate`), ensuring changes in one environment have zero impact on the other.

---

## Technical Configuration: Modularization with Workspace Isolation

The following configuration defines a standard app-tier provisioning pattern using a local VPC module. It uses the active workspace name (`terraform.workspace`) to dynamically size the database cluster and assign resource tags.

### 1. The Reusable VPC Module (`modules/vpc/main.tf`)
```hcl
variable "cidr_block" { type = string }
variable "env"        { type = string }

resource "aws_vpc" "main" {
  cidr_block           = var.cidr_block
  enable_dns_hostnames = true
  tags = {
    Name        = "app-vpc-${var.env}"
    Environment = var.env
  }
}

output "vpc_id" { value = aws_vpc.main.id }
```

### 2. The Main Root Configuration (`main.tf`)
```hcl
terraform {
  backend "s3" {
    bucket         = "company-global-tfstate"
    key            = "app-infrastructure/state.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-lock-table"
  }
}

# Define local variable mappings that vary by active Workspace
locals {
  env = terraform.workspace
  
  vpc_cidrs = {
    default = "10.0.0.0/16"
    dev     = "10.10.0.0/16"
    prod    = "10.20.0.0/16"
  }

  instance_types = {
    default = "t3.micro"
    dev     = "t3.small"
    prod    = "m5.large"
  }
}

# Instantiate the custom VPC module
module "network" {
  source     = "./modules/vpc"
  cidr_block = lookup(locals.vpc_cidrs, local.env, locals.vpc_cidrs["default"])
  env        = local.env
}

# Deploy compute resources scaled dynamically
resource "aws_instance" "web_server" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = lookup(locals.instance_types, local.env, locals.instance_types["default"])
  subnet_id     = "subnet-abc12345" # Placeholder for dynamic subnet reference

  tags = {
    Name        = "web-server-${local.env}"
    Environment = local.env
  }
}
```

---

## Operational Workflows and Boundaries

To apply this configuration across staging and production, operators execute the following sequence:

```bash
# Initialize backend and modules
terraform init

# Create and switch to the dev workspace
terraform workspace new dev
terraform apply -auto-approve

# Switch to the prod workspace to deploy production
terraform workspace new prod
terraform apply -auto-approve
```

While workspaces are excellent for managing identical environments with low overhead, they have a critical boundary: they utilize the exact same provider configuration and backend backend block. For organizations requiring hard security boundaries (e.g., Dev and Prod running on entirely separate cloud provider accounts), directory-based layout configurations combined with reusable modules are preferred to enforce strict IAM boundaries.
