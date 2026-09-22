# DRY Terraform: Designing Reusable Modules and Multi-Environment Workspaces

## The Problem: Copy-Paste Infrastructure
As organizations adopt Infrastructure as Code (IaC) with Terraform, a common anti-pattern emerges: directory-based environments. Teams create separate folders for `dev`, `staging`, and `prod`, copying and pasting raw Terraform configuration across them. 
When a change is required (e.g., adding an encryption flag to an S3 bucket), engineers must manually apply the exact same code change in three different directories. This violates the DRY (Don't Repeat Yourself) principle, inevitably leading to configuration drift, untracked modifications, and failed deployments when environments fall out of sync.

## The Solution: Terraform Modules and Workspaces (or Terragrunt)
To build scalable, enterprise-grade IaC, infrastructure must be componentized into reusable Modules, and state must be segregated using Workspaces or a higher-level wrapper like Terragrunt.

### Architecture Breakdown
Instead of copy-pasting raw resources, you define the architecture once in a Module. You then "instantiate" that module across different environments, passing in environment-specific variables.

```text
+-----------------------------------------------------------+
|                   Module: Web Application                 |
| (Defines ASG, ALB, RDS, Security Groups, IAM Roles)       |
|                                                           |
| Inputs: instance_type, min_size, db_password              |
+-----------------------------------------------------------+
       ^                       ^                       ^
       |                       |                       |
+-------------+         +-------------+         +-------------+
| Env: DEV    |         | Env: STAGE  |         | Env: PROD   |
| (Workspace) |         | (Workspace) |         | (Workspace) |
|             |         |             |         |             |
| instance=t3 |         | instance=t3 |         | min_size=4  |
| min_size=1  |         | min_size=2  |         | instance=m5 |
+-------------+         +-------------+         +-------------+
       |                       |                       |
       v                       v                       v
+-------------+         +-------------+         +-------------+
| State File  |         | State File  |         | State File  |
| env:/dev    |         | env:/stage  |         | env:/prod   |
+-------------+         +-------------+         +-------------+
```

### Technical Implementation

#### 1. Authoring the Module
A module is just a directory containing Terraform files. It exposes inputs (`variables.tf`) and outputs (`outputs.tf`).

```hcl
# modules/web-app/main.tf
resource "aws_instance" "web" {
  count         = var.instance_count
  ami           = var.ami_id
  instance_type = var.instance_type
  
  tags = {
    Environment = var.environment
  }
}
```

#### 2. Segregating State with Workspaces
Terraform Workspaces allow you to store multiple state files within a single backend (like an S3 bucket). By switching workspaces, you switch which state file Terraform reads and writes to.

```bash
# Create and switch to workspaces
terraform workspace new dev
terraform workspace new prod
```

#### 3. Root Module and Workspace Interpolation
In your root configuration, you call the module. To make the configuration dynamic based on the active workspace, you use the `terraform.workspace` interpolation variable, often combined with a `locals` map to select environment-specific values.

```hcl
# main.tf (Root Module)

locals {
  # Define environment-specific variables
  env_config = {
    default = { instance_type = "t3.micro", count = 1 }
    dev     = { instance_type = "t3.micro", count = 1 }
    staging = { instance_type = "t3.small", count = 2 }
    prod    = { instance_type = "m5.large", count = 4 }
  }
  
  # Select the config for the current workspace, fallback to default
  active_config = lookup(local.env_config, terraform.workspace, local.env_config["default"])
}

module "frontend_app" {
  source = "./modules/web-app"
  
  environment    = terraform.workspace
  instance_type  = local.active_config.instance_type
  instance_count = local.active_config.count
  ami_id         = "ami-0c55b159cbfafe1f0"
}
```

### Advanced Isolation: Terragrunt vs. Workspaces
While native Terraform Workspaces are excellent for simple environments, they share the same backend credentials. A compromised `dev` execution could theoretically overwrite the `prod` state file in S3 if the IAM role has broad permissions.

For strict production isolation, enterprises often avoid native Workspaces and use **Terragrunt**. Terragrunt acts as an orchestrator, allowing you to define distinct S3 backends, distinct AWS accounts, and distinct IAM roles for each environment, while still executing the exact same DRY Terraform module code.
