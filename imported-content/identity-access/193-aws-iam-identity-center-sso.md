# AWS IAM Identity Center: Managing Multi-Account SSO and Permission Sets

## The Problem
In modern enterprise environments, managing access to cloud infrastructure across tens or hundreds of AWS accounts is a monumental challenge. Legacy architectures rely on creating individual IAM users in every AWS account, which leads to credential proliferation (such as long-lived API Access Keys), stale accounts, and silent privilege creep. Security audits are nearly impossible when tracking identity attributes across disconnected environments.

AWS IAM Identity Center (formerly AWS Single Sign-On) solves this by centralizing federated access control. However, organizations often implement it poorly. They build overly permissive "Permission Sets" with excessive administrative privileges, assign excessive session durations (e.g., 12 hours) to critical production roles, or fail to automate the synchronization of user status from external Identity Providers (such as Okta or Azure AD) via SCIM. This can result in delayed de-provisioning, letting terminated employees retain active cloud access.

## The Mental Model
AWS IAM Identity Center consolidates identity access across an entire AWS Organization by serving as a central federation broker. Users and groups are synchronized from a centralized Identity Provider, mapped to standardized "Permission Sets," and assigned to specific target AWS Accounts.

```
+--------------------------------------------------------------+
|                    Enterprise IdP (e.g., Okta)               |
+--------------------------------------------------------------+
                               |
                   SCIM User/Group Sync & SAML Auth
                               |
                               v
+--------------------------------------------------------------+
|                 AWS IAM Identity Center (IdC)                |
|                                                              |
|   Groups ---------> [Mapped via Assignment] ---> Permission   |
|   (e.g., Platform-Devs)                            Sets       |
+--------------------------------------------------------------+
                               |
                   Dynamic Role Provisioning
                               v
+--------------------------------------------------------------+
|                     AWS Organizations                        |
|                                                              |
|   +-------------------+  +-------------------------------+   |
|   | Account A (Dev)   |  | Account B (Production)        |   |
|   |                   |  |                               |   |
|   | IAM Role: Dev-Set |  | IAM Role: ReadOnly-Set        |   |
|   +-------------------+  +-------------------------------+   |
+--------------------------------------------------------------+
```

When a user logs in, Identity Center dynamically provisions a temporary IAM role within the target account, backed by a cryptographically signed assertion and AWS Security Token Service (STS) temporary credentials.

## Attack Vectors
1. **Orphaned Access via Delayed De-provisioning**: If SCIM (System for Cross-domain Identity Management) synchronization is misconfigured or fails, a user disabled in the corporate Active Directory may remain enabled in AWS Identity Center. Active sessions are not instantly terminated, granting attackers a window to exploit.
2. **Session Hijacking via Excessive Session Duration**: If Permission Sets for highly privileged operations (e.g., AdministratorAccess) allow a 12-hour session duration, an attacker who compromises a developer's workstation can extract the temporary AWS credentials from the environment and use them for half a day unchallenged.
3. **Privilege Creep via Static Wildcard Policy Sets**: Defining Permission Sets that use wildcard permissions (`*`) or standard AWS-managed administrator policies on highly sensitive production accounts allows non-production personnel to perform destructive commands, modify database networks, or disable CloudTrail logging.

## Defensive Architecture
Securing IAM Identity Center requires defining strict Permission Sets with minimum viable session durations, explicit boundary conditions, and automated resource isolation.

### Terraform: Implementing a Secure Permission Set
The following Terraform configuration defines an enterprise-grade AWS Identity Center Permission Set. It establishes a tight 1-hour session duration and attaches a least-privilege IAM policy.

```hcl
# Retrieve the existing Identity Center Instance ARN
data "aws_ssoadmin_instances" "idc_instance" {}

# Define a secure Permission Set for Database Administrators
resource "aws_ssoadmin_permission_set" "dba_permission_set" {
  name             = "DBA-ReadOnly-Access"
  description      = "Least-privilege read-only access for Database Administrators"
  instance_arn     = tolist(data.aws_ssoadmin_instances.idc_instance.arns)[0]
  
  # Enforce a strict 1-hour session duration to limit credential hijack windows
  session_duration = "PT1H" 
}

# Attach an inline policy detailing exact permissions
resource "aws_ssoadmin_permission_set_inline_policy" "dba_inline_policy" {
  instance_arn       = tolist(data.aws_ssoadmin_instances.idc_instance.arns)[0]
  permission_set_arn = aws_ssoadmin_permission_set.dba_permission_set.arn

  inline_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = [
          "rds:Describe*",
          "rds:ListTagsForResource",
          "dynamodb:DescribeTable",
          "dynamodb:ListTables"
        ]
        Resource = "*"
      },
      {
        Effect   = "Deny"
        Action   = [
          "rds:Delete*",
          "rds:Modify*"
        ]
        Resource = "*"
      }
    ]
  })
}
```

## Best Practices
- **Implement automated SCIM synchronization**: Never provision users manually in AWS Identity Center. Enforce automated sync from Azure AD or Okta to ensure central user lifecycle events are propagated in near real-time.
- **Enforce a strict maximum session lifetime**: Restrict administrative role sessions to 1 hour, and public/developer read-only sessions to a maximum of 4-8 hours.
- **Employ Permission Boundaries**: Apply Customer Managed Policies and IAM Permission Boundaries within target accounts to limit the blast radius of any Identity Center Permission Set assignments.
