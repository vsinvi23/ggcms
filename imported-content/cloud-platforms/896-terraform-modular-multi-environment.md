# DRY Terraform: Designing Reusable Modules and Multi-Environment Workspaces

## The Problem: The "Copy-Paste" Infrastructure Anti-Pattern

As organizations adopt Infrastructure as Code (IaC) using Terraform, they often begin by writing monolithic configuration files for a single environment (e.g., Development). When the time comes to deploy Staging and Production, the fastest—and most dangerous—path is to copy and paste the entire directory, manually finding and replacing values like `env = "dev"` to `env = "prod"`.

This approach violates the "Don't Repeat Yourself" (DRY) principle and leads to configuration drift. If a security architect mandates that all S3 buckets must have logging enabled, the engineering team must remember to update the configuration in three separate, disconnected directories. Inevitably, one environment is missed, leading to critical security vulnerabilities in Production.

To scale securely, Terraform configuration must be modularized, completely abstracted from environment-specific data, and orchestrated using robust workspace strategies.

## The Architecture: Modules and Environment Injection

A DRY Terraform architecture separates the *definition* of the infrastructure (the Module) from the *instantiation* of the infrastructure (the Environment Configuration).

### 1. The Reusable Module
A module is a self-contained package of Terraform configurations that encapsulates a specific architectural pattern. A well-designed module hardcodes the security and compliance requirements (e.g., encryption, logging, private networking) and exposes only safe, necessary variables to the consumer.

```hcl
# modules/secure-s3-bucket/main.tf
variable "bucket_prefix" { type = string }
variable "environment"   { type = string }
variable "kms_key_arn"   { type = string }

# The baseline bucket
resource "aws_s3_bucket" "this" {
  bucket = "${var.bucket_prefix}-${var.environment}"
}

# HARDCODED SECURITY: Public access is blocked globally
resource "aws_s3_bucket_public_access_block" "block" {
  bucket                  = aws_s3_bucket.this.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# HARDCODED SECURITY: Encryption is enforced using the provided KMS key
resource "aws_s3_bucket_server_side_encryption_configuration" "sse" {
  bucket = aws_s3_bucket.this.id
  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.kms_key_arn
      sse_algorithm     = "aws:kms"
    }
  }
}
```

By centralizing this logic, the security team guarantees that no bucket can be created via this module without public access blocks and KMS encryption.

### 2. Environment Instantiation (Terragrunt or Workspaces)

With the module defined, we need a mechanism to inject environment-specific variables (like the AWS Account ID, Region, and KMS Keys) without duplicating the module code.

There are two primary patterns for this:

#### Pattern A: Native Terraform Workspaces
Terraform natively supports Workspaces, which maintain separate state files for the same configuration directory. You can use the `terraform.workspace` variable to conditionally look up environment data.

```hcl
# envs/main.tf
locals {
  # A map of environment-specific variables
  env_config = {
    default = { kms_arn = "arn:aws:kms:dev-key", prefix = "my-app" }
    dev     = { kms_arn = "arn:aws:kms:dev-key", prefix = "my-app" }
    prod    = { kms_arn = "arn:aws:kms:prod-key", prefix = "my-app-secure" }
  }
  
  # Select the config based on the active workspace
  config = local.env_config[terraform.workspace]
}

module "app_data_bucket" {
  source        = "../modules/secure-s3-bucket"
  bucket_prefix = local.config.prefix
  environment   = terraform.workspace
  kms_key_arn   = local.config.kms_arn
}
```
*Workflow:* `terraform workspace select prod` followed by `terraform apply`.

#### Pattern B: Directory-Driven with Terragrunt
For enterprise scale, tools like Terragrunt are often preferred. Terragrunt allows you to define a directory structure that matches your environments and use `terragrunt.hcl` files to simply pass variables to a remote module.

```text
infrastructure/
├── modules/
│   └── secure-s3-bucket/ (The Terraform code)
└── environments/
    ├── dev/
    │   └── terragrunt.hcl (Passes dev variables)
    └── prod/
        └── terragrunt.hcl (Passes prod variables)
```

```hcl
# environments/prod/terragrunt.hcl
terraform {
  source = "../../modules/secure-s3-bucket"
}

inputs = {
  bucket_prefix = "my-app-secure"
  environment   = "prod"
  kms_key_arn   = "arn:aws:kms:prod-key"
}
```

## Security and Operational Benefits

1. **Enforced Baselines:** Security teams can author and maintain the core modules. Application teams consume these modules, inheriting all security controls (IAM boundaries, encryption, logging) implicitly.
2. **Blast Radius Reduction:** By separating environments into distinct state files (via Workspaces or Terragrunt), an error in a `dev` deployment physically cannot corrupt the `prod` state file.
3. **Auditability:** When an auditor asks, "Are all S3 buckets encrypted?", you only need to review the source code of the `secure-s3-bucket` module, rather than hunting through hundreds of disjointed configuration files.

## Summary
Copy-pasting Terraform configuration is a catastrophic operational risk. By adhering to DRY principles—extracting infrastructure definitions into hardened, reusable modules and injecting environment data dynamically via Workspaces or Terragrunt—security architects can guarantee consistent, compliant deployments across the entire software development lifecycle while eliminating configuration drift.