# Security Logging: Implementing Immutable WORM Audit Trails

## The Problem: The Post-Compromise Wipe

A sophisticated threat actor operates in stages. After establishing persistence and escalating privileges, the immediate next step is defense evasion: wiping or modifying system, application, and access logs to obscure their tracks. 

If your application logs are stored locally on the web server, or if the application server has modification/deletion rights to the centralized log aggregator (e.g., Elasticsearch, Splunk), the audit trail is highly volatile. An attacker who gains root on the web node can systematically delete evidence of their intrusion, rendering incident response and forensic analysis impossible.

## The Mechanics: Write-Once-Read-Many (WORM)

To achieve true non-repudiation and meet strict compliance mandates (like SEC Rule 17a-4(f), HIPAA, or PCI-DSS), audit logs must be immutable. WORM (Write-Once-Read-Many) storage ensures that once a log entry is written, it cannot be modified, deleted, or overwritten by *any* user—including administrators or root accounts—until a specified retention period expires.

### Architectural Diagram: Immutable WORM Logging Pipeline

```text
[ App Servers ] ---> [ Fluent-Bit / Vector ] ---> [ Kinesis Firehose ]
      |                      |                             |
  (Writes Logs)         (Aggregates)              (Streams to Bucket)
                                                           |
                                                           v
                                         +-----------------------------------+
                                         |      AWS S3 (WORM Storage)        |
                                         | - Versioning: Enabled             |
                                         | - Object Lock: Compliance Mode    |
                                         | - Retention: 365 Days             |
                                         +-----------------------------------+
                                                           |
                                                           v
                                              [ SIEM / Security Analysts ]
                                                   (Read-Only Access)
```

In this architecture, the web tier only possesses IAM permissions to `PutObject`. WORM properties are enforced at the hardware/control-plane level by the cloud provider. Even if an attacker steals the AWS root credentials, they cannot delete the S3 objects if Object Lock Compliance mode is engaged.

## Implementation: AWS S3 Object Lock via Terraform

To build a robust WORM architecture on AWS, you must configure an S3 bucket with Object Lock enabled at creation. There are two retention modes:
- **Governance Mode:** Prevents deletion by standard users, but IAM users with `s3:BypassGovernanceRetention` can delete objects. (Not suitable for strict compliance).
- **Compliance Mode:** Prevents deletion by *everyone*, including the AWS root account, until the retention period expires.

### Robust Code: Terraform Blueprint

This Terraform configuration provisions a strict WORM bucket tailored for immutable security logs.

```hcl
resource "aws_s3_bucket" "audit_logs" {
  bucket = "serenya-immutable-audit-logs"

  # Object Lock MUST be enabled at bucket creation
  object_lock_enabled = true
}

# Versioning is required for Object Lock
resource "aws_s3_bucket_versioning" "audit_logs_versioning" {
  bucket = aws_s3_bucket.audit_logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Configure Compliance Mode for WORM
resource "aws_s3_bucket_object_lock_configuration" "audit_logs_lock" {
  bucket = aws_s3_bucket.audit_logs.id

  rule {
    default_retention {
      mode  = "COMPLIANCE"
      days  = 365
    }
  }
}

# Enforce Encryption (SSE-KMS)
resource "aws_kms_key" "audit_log_key" {
  description             = "KMS key for immutable audit logs"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "audit_logs_encryption" {
  bucket = aws_s3_bucket.audit_logs.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.audit_log_key.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

# Block Public Access Entirely
resource "aws_s3_bucket_public_access_block" "audit_logs_block" {
  bucket                  = aws_s3_bucket.audit_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```

### Application-Level Log Formatting

For SIEM ingestion to be effective, the application must emit logs in structured JSON, avoiding multi-line stack traces that complicate parsing.

```json
{
  "timestamp": "2024-03-24T14:22:11Z",
  "event_type": "authentication_failure",
  "severity": "HIGH",
  "source_ip": "198.51.100.42",
  "user_id": "usr_8891aX",
  "action": "login",
  "reason": "invalid_credentials",
  "request_id": "req_xyz123"
}
```

## Conclusion

A security log is only valuable if its integrity is guaranteed. By decoupling log storage from the application tier and enforcing strict Compliance-mode Object Locking at the infrastructure level, organizations ensure their forensic data survives even total host compromise.
