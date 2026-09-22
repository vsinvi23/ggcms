---
title: "Terraform State Locking: Hardened S3 and DynamoDB Backends"
description: "Why local Terraform state causes race-condition corruption and plaintext secret exposure, and how to build a production-grade remote backend with S3 versioning, KMS encryption, and DynamoDB distributed locking."
type: "ARTICLE"
categorySlug: "cloud-platforms"
articleType: "GUIDE"
tags:
  - "terraform"
  - "state-locking"
  - "s3"
  - "dynamodb"
  - "kms"
  - "infrastructure-as-code"
---

# Terraform State Locking: Hardened S3 and DynamoDB Backends

Two engineers, working on different tickets, both run `terraform apply` against the same production directory within a few minutes of each other — one adding a subnet, the other updating a security group. Neither knows the other is running. With local state, both processes read the same starting state file, compute independent plans, and write their own updated version back — whichever finishes last silently overwrites the other's changes. The infrastructure it created is now orphaned: real cloud resources exist that Terraform no longer knows about, and the next `plan` either tries to recreate them (name collision) or shows a confusing diff nobody can explain. This is state corruption, and it's a certainty, not an edge case, the first time a second person or a CI runner touches the same Terraform directory.

## The Problem: Local State Has Two Independent Failure Modes

1. **Race-condition corruption.** Concurrent `apply` runs against the same state file are a classic distributed-writer-without-coordination problem: without an external lock, the last write wins and the other run's changes are lost from Terraform's bookkeeping, even though the underlying cloud resources it created still exist.
2. **Plaintext secret exposure.** Terraform's state file stores every resource attribute in plaintext exactly as returned by the cloud provider's API — including database master passwords, generated API keys, and TLS private keys. A state file committed to git, or sitting in an unencrypted bucket, is a full secrets dump.

## The Solution: Centralized State (S3) Plus Distributed Locking (DynamoDB)

A hardened backend needs two independent mechanisms working together: a shared, encrypted, versioned store for the state file itself, and a separate locking primitive that serializes concurrent access to it.

```text
+---------------+           +--------------------+          +--------------------+
|  Dev / CI Run |           | DynamoDB Lock Table|          |  S3 State Bucket   |
+-------+-------+           +---------+----------+          +---------+----------+
        |                             |                               |
        | 1. Acquire Lock (conditional write on LockID)                |
        +============================>|                                |
        | 2. Lock Confirmed           |                                |
        |<----------------------------+                                |
        | 3. Read Current State (decrypt via KMS)                      |
        +============================================================>|
        | 4. Return State                                              |
        |<------------------------------------------------------------+
        | 5. Apply Changes & Write New State (encrypt via KMS)         |
        +============================================================>| (new S3 version)
        | 6. Release Lock (delete LockID)                              |
        +============================>|                                |
        v                             v                                v

Concurrent second run: step 1 fails — DynamoDB item already exists — Terraform exits immediately.
```

* **DynamoDB distributed lock**: before touching the state, Terraform performs a *conditional write* to DynamoDB — create an item keyed by `LockID` only if it doesn't already exist. If it does, another run holds the lock and this run fails fast rather than racing.
* **S3 server-side encryption (SSE-KMS)** with a Customer Managed Key ensures the state is unreadable at rest without explicit KMS `Decrypt` permission — separate from S3 bucket read access.
* **S3 object versioning** keeps every prior state version immutable, so a corrupted or bad state write can be rolled back to the last known-good version.

## Step 1: Bootstrap the Backend Infrastructure

The bucket and lock table must exist *before* Terraform can use them as a backend, so this bootstrap step runs once, with local state, before anything else consumes it.

```hcl
# bootstrap.tf — provisioned once, with local state, before any remote-backend config exists

provider "aws" {
  region = "us-east-1"
}

# Customer Managed Key — state encryption is separable from bucket-level access
resource "aws_kms_key" "tf_key" {
  description             = "KMS key for Terraform remote state encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

resource "aws_s3_bucket" "tf_state" {
  bucket        = "company-production-tfstate-bucket"
  force_destroy = false # Never allow accidental deletion of state history
}

resource "aws_s3_bucket_versioning" "state_versioning" {
  bucket = aws_s3_bucket.tf_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state_encryption" {
  bucket = aws_s3_bucket.tf_state.id
  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.tf_key.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "block_public" {
  bucket                  = aws_s3_bucket.tf_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Deny any request over plain HTTP — state must always travel encrypted in transit
resource "aws_s3_bucket_policy" "state_bucket_policy" {
  bucket = aws_s3_bucket.tf_state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "EnforceTLSRequestsOnly"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource = [
        aws_s3_bucket.tf_state.arn,
        "${aws_s3_bucket.tf_state.arn}/*",
      ]
      Condition = {
        Bool = { "aws:SecureTransport" = "false" }
      }
    }]
  })
}

# Lock table — hash key MUST be named exactly "LockID"
resource "aws_dynamodb_table" "tf_locks" {
  name         = "company-production-tfstate-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}
```

## Step 2: Point Every Consumer at the Remote Backend

Once bootstrapped, every application-level Terraform root configuration references the shared bucket and lock table:

```hcl
# backend.tf
terraform {
  required_version = ">= 1.5.0"

  backend "s3" {
    bucket         = "company-production-tfstate-bucket"
    key            = "environments/production/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "company-production-tfstate-locks"
    encrypt        = true
    kms_key_id     = "arn:aws:kms:us-east-1:123456789012:key/your-kms-key-uuid"
  }
}
```

Run `terraform init` after adding this block; Terraform detects the switch from local to remote state and prompts to migrate the existing state file into the bucket.

## What a Concurrent Run Actually Sees

With the lock table in place, the second engineer's `apply` doesn't corrupt anything — it fails immediately and visibly:

```bash
Error: Error acquiring the state lock
Error message: ConditionalCheckFailedException: The lock is held by user@ci-runner-01
```

This is the entire point: a loud, immediate failure is vastly preferable to a silent, undetected state overwrite discovered a week later when someone's `plan` shows unexplained drift.

## IAM Least Privilege for Consumers

The role or user running `terraform apply` should never have broad S3/DynamoDB/KMS access — scope it to exactly the resources this backend needs:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::company-production-tfstate-bucket/environments/production/*"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"],
      "Resource": "arn:aws:dynamodb:us-east-1:123456789012:table/company-production-tfstate-locks"
    },
    {
      "Effect": "Allow",
      "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
      "Resource": "arn:aws:kms:us-east-1:123456789012:key/your-kms-key-uuid"
    }
  ]
}
```

## Operational Best Practices

* **Isolate backends per environment.** Never share a single S3 path or DynamoDB table across `dev`, `staging`, and `production` — a bug or compromised credential in one environment's pipeline should not be able to touch another environment's state or lock table.
* **Enable point-in-time recovery on the lock table**, not just versioning on the bucket — a corrupted lock table entry (stuck lock from a killed process) is a real operational scenario, and `terraform force-unlock` should be a deliberate, audited action, not a routine one.
* **Enforce TLS-only access via bucket policy**, as shown above — state in transit is as sensitive as state at rest.
* **Treat the state file's contents as secrets**, even encrypted — grant `kms:Decrypt` only to the roles that genuinely need to run Terraform, not broadly to "anyone with S3 read."

## Conclusion

Remote state with locking isn't an optional hardening step for teams past a certain size — it's the difference between "Terraform safely rejects a concurrent run" and "Terraform silently corrupts your infrastructure's source of truth." S3 with KMS envelope encryption and versioning solves the plaintext-secret and rollback problem; DynamoDB's conditional-write locking solves the race-condition problem. Neither alone is sufficient — a versioned but unlocked bucket still corrupts under concurrent writers, and a locked table with an unencrypted bucket still leaks secrets at rest.
