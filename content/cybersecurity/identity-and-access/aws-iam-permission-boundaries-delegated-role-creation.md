---
title: "AWS IAM Permission Boundaries: Delegating Role Creation Safely to Developers"
description: "How to let developers self-serve IAM role creation without opening a privilege-escalation path, using AWS IAM Permission Boundaries to cap the maximum permissions any developer-created role can ever hold."
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "aws-iam"
  - "permission-boundaries"
  - "privilege-escalation"
  - "least-privilege"
  - "delegated-administration"
---

# AWS IAM Permission Boundaries: Delegating Role Creation Safely to Developers

## The Problem: The Privilege Escalation Trap

In fast-paced cloud environments, developers constantly need to create new AWS IAM roles. A microservice needs a role to access an S3 bucket; a Lambda function needs a role to read from DynamoDB.

If Cloud Security insists on creating every role manually via Jira tickets, development grinds to a halt. However, if Security simply grants developers `iam:CreateRole` and `iam:PutRolePolicy`, a massive privilege escalation vulnerability is introduced.

A developer with the ability to create roles and attach policies could:

1. Create a new IAM Role called `SuperAdminRole`.
2. Attach the `AdministratorAccess` managed policy to it.
3. Assume that role, thereby elevating their privileges from a standard developer to a full AWS account administrator.

How can security teams delegate the creation of IAM roles to developers *without* handing over the keys to the kingdom?

## The Mental Model: The Fence and the Sandbox

AWS IAM Permission Boundaries solve this.

Think of a Permission Boundary as a **fence** built by the Security team. When a developer creates a new role, they are given a sandbox. They can build whatever they want (policies) inside that sandbox, but the boundary (the fence) dictates the *absolute maximum* permissions that role can ever have, regardless of the policies attached to it.

Even if a developer attaches `AdministratorAccess` to their newly created role, if the Permission Boundary only allows access to S3 and CloudWatch, the role will *only* be able to access S3 and CloudWatch. The effective permission is the **intersection** (the logical AND) of the identity-based policy and the Permission Boundary:

```
     Identity Policy                  Permission Boundary
   (What the dev attached,          (The fence, set by Security:
    e.g. AdministratorAccess)          e.g. S3 + CloudWatch only)
   +----------------------+          +----------------------+
   |                      |          |                      |
   |     EVERYTHING       |          |    S3, CloudWatch     |
   |   (s3, iam, ec2,     |          |                      |
   |    rds, vpc, ...)    |    ∩     |                      |
   |         ┌────────────┼──────────┼────────┐             |
   |         │  Effective │Permission│s        │             |
   |         │  (S3 & CloudWatch ONLY)         │             |
   |         └────────────┼──────────┼────────┘             |
   +----------------------+          +----------------------+

   Effective access = Identity Policy  AND  Permission Boundary
```

## Implementation Deep Dive: Enforcing Boundaries

To implement this safely, Security must do two things: create the boundary policy, and enforce its use during role creation.

### Step 1: Create the Permission Boundary Policy

The Security team authors a managed policy that defines the maximum allowed permissions for any developer-created role. Let's call it `DevRoleBoundary`.

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowSpecificServices",
            "Effect": "Allow",
            "Action": [
                "s3:*",
                "dynamodb:*",
                "lambda:*",
                "cloudwatch:*"
            ],
            "Resource": "*"
        },
        {
            "Sid": "DenyIAMEscalation",
            "Effect": "Deny",
            "Action": [
                "iam:CreateUser",
                "iam:DeleteUser",
                "iam:CreatePolicy"
            ],
            "Resource": "*"
        }
    ]
}
```

*Notice this policy ALLOWS specific standard services but explicitly DENIES IAM actions to prevent the role itself from creating further roles.*

### Step 2: Enforce the Boundary on the Developer's Role

Next, Security modifies the policy assigned to the *developers*. They grant `iam:CreateRole`, but with a strict condition: the developer can *only* create a role if they attach the `DevRoleBoundary` to it.

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowRoleCreationWithBoundary",
            "Effect": "Allow",
            "Action": [
                "iam:CreateRole",
                "iam:AttachRolePolicy",
                "iam:PutRolePolicy"
            ],
            "Resource": "arn:aws:iam::123456789012:role/dev-created-*",
            "Condition": {
                "StringEquals": {
                    "iam:PermissionsBoundary": "arn:aws:iam::123456789012:policy/DevRoleBoundary"
                }
            }
        },
        {
            "Sid": "PreventBoundaryRemoval",
            "Effect": "Deny",
            "Action": [
                "iam:DeleteRolePermissionsBoundary"
            ],
            "Resource": "arn:aws:iam::123456789012:role/dev-created-*"
        }
    ]
}
```

### The Security Mechanism in Action

1. **Attempted Abuse:** The developer runs `aws iam create-role --role-name SuperAdmin --assume-role-policy-document file://trust.json`.
   - **Result: Access Denied.** The request lacks the required boundary condition.
2. **Compliance:** The developer runs `aws iam create-role --role-name dev-created-app1 --permissions-boundary arn:aws:iam::123456789012:policy/DevRoleBoundary --assume-role-policy-document file://trust.json`.
   - **Result: Success.** The role is created.
3. **Attempted Escalation:** The developer attaches `AdministratorAccess` to `dev-created-app1`.
   - **Result: Success (but harmless).** The policy attaches, but because of the boundary, the role still cannot delete VPCs or spin up expensive EC2 instances. The boundary caps the permissions.

## Strategic Advantages

By utilizing Permission Boundaries, organizations achieve a state of "Delegated Administration."

- **Agility:** Developers self-serve their IAM needs instantly via Terraform or CDK without blocking on Security.
- **Safety:** Security mathematically guarantees the blast radius of any developer-created role is contained to safe, pre-approved services.

## Common Pitfalls

- **Forgetting `PreventBoundaryRemoval`:** Without an explicit `Deny` on `iam:DeleteRolePermissionsBoundary` (and `iam:PutRolePermissionsBoundary` to swap it for a looser one), a developer who can modify the role after creation can simply strip the boundary off and regain unrestricted access.
- **Scoping the `Resource` too broadly:** The `AllowRoleCreationWithBoundary` statement above restricts role creation to `role/dev-created-*`. If this is left as `Resource: "*"`, a developer could apply the boundary condition once to satisfy IAM, then later attach an *additional*, unbounded trust policy to an unrelated existing production role.
- **Boundaries are not policies you can query for effective access directly:** IAM does not expose a single API that returns "effective permissions" after intersecting an identity policy with a boundary. Test with the IAM Policy Simulator or `iam:SimulatePrincipalPolicy`, not by inspection alone.

This pattern is foundational for secure AWS landing zones and CI/CD pipelines, ensuring rapid deployment without compromising the integrity of the cloud environment.
