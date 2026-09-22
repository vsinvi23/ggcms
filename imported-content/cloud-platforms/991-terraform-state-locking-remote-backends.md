# Terraform State Hardening: Encryption-at-Rest and DynamoDB Concurrency Locks

## The Problem: State Corruption and Plaintext Secret Exposure

Terraform maintains a record of mapped infrastructure in a state file (`terraform.tfstate`). This file acts as a database mapping your declarative code to real-world cloud resources.

However, storing the state file locally or within a standard cloud bucket without hardening introduces two severe security and operational risks:
1. **Secret Leakage:** Terraform state files store *all* resource properties in unencrypted plaintext. This includes auto-generated database master passwords, private TLS keys, service account credentials, and API tokens. Committing this file to source control or leaving it unencrypted in a standard bucket is a catastrophic security exposure.
2. **State Corruption (The Split-Brain Scenario):** If two engineers or two pipeline runs execute `terraform apply` concurrently on the exact same workspace, they will read the same initial state, make overlapping changes to the cloud API, and concurrently attempt to write their changes back. This results in state corruption, orphaned resources, and duplicate deployments.

```
Race Condition without Locking:
+---------------------+             +---------------------+
|  CI Pipeline Run A  |             |  CI Pipeline Run B  |
+---------------------+             +---------------------+
           |                                   |
     1. Read State                       1. Read State
           |                                   |
     2. Modifying DB                     2. Modifying DB
           |                                   |
     3. Write State                      3. Write State (OVERWRITES A!)
           v                                   v
+-----------------------------------------------------------------+
|                       S3 State Bucket                           |
|        (Corrupted state, orphaned resources, database drift)    |
+-----------------------------------------------------------------+
```

---

## The Solution: Hardened Remote Backend (S3 + DynamoDB)

To secure the state file, we design a remote backend architecture utilizing AWS S3 and DynamoDB. S3 provides native encryption-at-rest and strict bucket policies, while DynamoDB functions as a distributed, pessimistic locking mechanism.

```
Secure Remote State Architecture:
+-------------------------+
|   Terraform Workspace   |
+-------------------------+
    |               |
    | 1. Acquire    | 2. Read/Write State
    |    Lock       |    (HTTPS with TLS 1.3, KMS Customer Managed Key)
    v               v
+------------+  +---------------------------------------------------+
|  DynamoDB  |  |                     AWS S3                        |
|  Lock Table|  | * Default Block Public Access                     |
|  * LockID  |  | * Bucket Policy (Deny HTTP, Deny Unencrypted)     |
+------------+  +---------------------------------------------------+
```

---

## Technical Implementation: Hardened Infrastructure Provisioning

The following Terraform configuration creates an isolated, hardened S3 bucket with KMS customer-managed key encryption and a DynamoDB table formatted for state locking.

```hcl
# backend-bootstrap/main.tf

provider "aws" {
  region = "us-east-1"
}

# KMS Key for S3 State Encryption-at-Rest
resource "aws_kms_key" "state_key" {
  description             = "KMS Key for hardening Terraform remote state files"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Environment = "Security-Operations"
  }
}

# Hardened S3 Bucket
resource "aws_s3_bucket" "state_bucket" {
  bucket        = "corporate-hardened-terraform-state-prod"
  force_destroy = false

  lifecycle {
    prevent_destroy = true
  }
}

# Force Block Public Access
resource "aws_s3_bucket_public_access_block" "state_block" {
  bucket                  = aws_s3_bucket.state_bucket.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable S3 Bucket Versioning for recovery
resource "aws_s3_bucket_versioning" "state_versioning" {
  bucket = aws_s3_bucket.state_bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Enforce Server-Side Encryption using our KMS Customer Managed Key
resource "aws_s3_bucket_server_side_encryption_configuration" "state_encryption" {
  bucket = aws_s3_bucket.state_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.state_key.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

# S3 Bucket Policy to enforce SSL and block unencrypted uploads
resource "aws_s3_bucket_policy" "state_policy" {
  bucket = aws_s3_bucket.state_bucket.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnforceSSLOnly"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.state_bucket.arn,
          "${aws_s3_bucket.state_bucket.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

# DynamoDB Table for optimistic lock state coordination
resource "aws_dynamodb_table" "state_locks" {
  name         = "corporate-terraform-state-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID" # MUST be exactly LockID (Type String)

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.state_key.arn
  }
}
```

---

## Technical Configuration: Consuming the Backend

Once the bootstrap resources are provisioned, developers or CI/CD pipelines configure their projects to target this secure backend. This setup initializes the automated lock/unlock flow.

Add this code block to your primary root-module configuration files:

```hcl
# root-infra/backend.tf

terraform {
  required_version = ">= 1.5.0"

  backend "s3" {
    bucket         = "corporate-hardened-terraform-state-prod"
    key            = "environments/prod/networking/vpc.tfstate"
    region         = "us-east-1"
    encrypt        = true # Force SSE-S3 or SSE-KMS
    dynamodb_table = "corporate-terraform-state-locks"
  }
}
```

---

## Behind the Scenes: The Concurrency Lock Lifecycle

When a developer runs `terraform apply` with this configuration, the following lifecycle is executed under the hood:

1. **Lock Acquisition:** Terraform writes a dynamic lock item directly into the DynamoDB table. The partition key `LockID` is set to `corporate-hardened-terraform-state-prod/environments/prod/networking/vpc.tfstate-md5sum`.
2. **Concurrent Rejection:** If a second developer attempts to execute an apply, Terraform queries DynamoDB, sees an active lock, outputs the details of who holds the lock (e.g., username, host, and start time), and aborts immediate execution:
   ```text
   Acquiring state lock. This may take a moment...
   Error: Error acquiring the state lock: State lock already held by Info:
   ID:          b8893941-8c44-b4a1-0943-7bb09192eb91
   Path:        corporate-hardened-terraform-state-prod/...
   Who:         jenkins@runner-12.internal
   Version:     1.5.7
   Created:     2026-03-31 10:14:02 UTC
   ```
3. **Write & Release:** Once the first execution finishes successfully, Terraform writes the encrypted payload to S3 and calls `DeleteItem` on the DynamoDB record, freeing the lock safely for the next runner.
