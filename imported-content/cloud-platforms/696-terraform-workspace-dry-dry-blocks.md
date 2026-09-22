# Scaling Infrastructure as Code: Terraform Modules and Multi-Environment Workspaces

## The Problem: Drifting Environments and the Fragility of Copy-Paste IaC

As infrastructure expands, engineering teams must maintain identical architectural patterns across multiple environments (such as `development`, `staging`, and `production`). A common but highly fragile anti-pattern is copy-pasting raw resource blocks from one folder or branch to another. This approach triggers several fatal operational bottlenecks:

1. **Configuration Drift**: Over time, individual modifications are manually applied to `development` or `staging` to patch immediate issues, but are never back-propagated. This results in "drifting" environments, causing deployments that pass testing in `staging` to fail catastrophically in `production`.
2. **Duplicated Boilerplate (Violating DRY)**: Maintaining duplicated blocks for VPCs, databases, and subnets across three different environments bloat the codebase. Updating a simple security group rule requires finding and editing that resource in every single repository directory.
3. **No Safety Isolation**: Relying on a single root Terraform file and controlling environments via manual variable values (`-var-file=prod.tfvars`) introduces the risk of human error. A developer could accidentally execute `terraform destroy` with the production variable file active, wiping out core production systems.

---

## Technical Architecture: Separated Directories & Reusable Blueprints

To scale IaC safely and maintain a strict **DRY (Don't Repeat Yourself)** structure, enterprise cloud architectures utilize a combination of **Reusable local or remote Terraform Modules** and **Directory-Isolated Environments**.

### Directory-Isolated Module Architecture

```
                       +-----------------------------+
                       |    Core Reusable Modules    |
                       |  (modules/autoscaled_web/)  |
                       +--------------+--------------+
                                      |
                      Local relative  |
                      Module imports  |
                                      v
         +----------------------------+----------------------------+
         |                                                         |
+--------v-------------------+                            +--------v-------------------+
|     ENVIRONMENT: DEV       |                            |     ENVIRONMENT: PROD      |
|  (environments/dev/)       |                            |  (environments/prod/)      |
|                            |                            |                            |
|  - backend.tf (Dev S3)     |                            |  - backend.tf (Prod S3)    |
|  - main.tf                 |                            |  - main.tf                 |
|    Calls module with:      |                            |    Calls module with:      |
|      instance_type = "t3.micro"                         |      instance_type = "c6i.large"
|      min_size      = 1     |                            |      min_size      = 3     |
|      max_size      = 2     |                            |      max_size      = 10    |
+----------------------------+                            +----------------------------+
```

### Why Directory-Separation Beats Native CLI Workspaces

While Terraform supports CLI-native workspaces (`terraform workspace select prod`), **Directory-Separation** is highly preferred in enterprise environments. Workspaces use the same backend state bucket, making it impossible to enforce strict IAM separations. 

Directory-separation allows:
- **Complete state isolation** using different S3 buckets or GCP Storage buckets in entirely separate cloud accounts.
- **Different backend credentials**: Compromising a developer's access to the `dev` state has zero blast radius on the `prod` state.
- **Explicit peer review** via git pull requests targeting specific directory pathways.

---

## Implementation: Production-Grade Reusable Modules

### Step 1: Create the Reusable Module (`modules/autoscaled_web/main.tf`)

This module defines an auto-scaled compute cluster with a secure Application Load Balancer. It exposes variables for configuration.

```hcl
# modules/autoscaled_web/variables.tf
variable "environment" { type = string }
variable "instance_type" { type = string }
variable "min_size" { type = number }
variable "max_size" { type = number }
variable "subnet_ids" { type = list(string) }
variable "vpc_id" { type = string }

# modules/autoscaled_web/main.tf
resource "aws_launch_template" "web" {
  name_prefix   = "${var.environment}-web-template-"
  image_id      = "ami-0c55b159cbfafe1f0" # Amazon Linux 2 AMI
  instance_type = var.instance_type

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required" # Enforce IMDSv2 for security
    http_put_response_hop_limit = 1
  }

  monitoring {
    enabled = true
  }
}

resource "aws_autoscaling_group" "web" {
  name_prefix         = "${var.environment}-asg-"
  vpc_zone_identifier = var.subnet_ids
  desired_capacity    = var.min_size
  min_size            = var.min_size
  max_size            = var.max_size

  launch_template {
    id      = aws_launch_template.web.id
    version = "$Latest"
  }

  tag {
    key                 = "Environment"
    value               = var.environment
    propagate_at_launch = true
  }
}
```

### Step 2: Instantiate for Production (`environments/prod/main.tf`)

Deploy the production infrastructure using the reusable module as a remote reference or local relative link, modifying variables to match production scale.

```hcl
# environments/prod/backend.tf
terraform {
  backend "s3" {
    bucket         = "company-production-tfstate"
    key            = "services/web/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "production-locks"
  }
}

# environments/prod/main.tf
provider "aws" {
  region = "us-east-1"
}

# Import VPC configuration outputs
data "terraform_remote_state" "vpc" {
  backend = "s3"
  config = {
    bucket = "company-production-tfstate"
    key    = "infrastructure/vpc/terraform.tfstate"
    region = "us-east-1"
  }
}

module "production_web" {
  source = "../../modules/autoscaled_web" # Reference local DRY module

  environment   = "production"
  instance_type = "c6i.large" # Production hardened instance
  min_size      = 3            # Multi-AZ redundant minimum
  max_size      = 10           # Scale out up to 10 nodes under heavy loads
  vpc_id        = data.terraform_remote_state.vpc.outputs.vpc_id
  subnet_ids    = data.terraform_remote_state.vpc.outputs.private_subnets
}
```

---

## Operational Best Practices

* **Pin Module Versions**: When using modules sourced from Git repositories (GitHub/GitLab), always append version tags to your sources (`source = "git::https://github.com/org/repo.git?ref=v1.4.2"`). This prevents changes in core modules from breaking downstream environment deployments.
* **Enforce IMDSv2**: Within all compute launch configurations/templates inside your modules, enforce the use of Instance Metadata Service Version 2 (`http_tokens = "required"`). This protects instances against server-side request forgery (SSRF) token leaks.
* **Run pre-commit Linters**: Enforce the use of automated formatting (`terraform fmt -check`), static security analysis (`tfsec` or `trivy`), and structural validation (`terraform validate`) as mandatory CI/CD gates before a pull request can be merged into any environment directory.
