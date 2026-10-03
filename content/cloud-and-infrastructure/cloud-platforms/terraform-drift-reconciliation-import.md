---
title: "Reconciling Terraform State Drift with the import Block"
description: "How to safely bring manually-created cloud resources under Terraform management using the declarative import block introduced in Terraform 1.5, without triggering a destructive plan."
type: "ARTICLE"
categorySlug: "cloud-platforms"
articleType: "HOW_TO"
tags:
  - "terraform"
  - "state-drift"
  - "terraform-import"
  - "infrastructure-as-code"
  - "gitops"
---

# Reconciling Terraform State Drift with the import Block

It's 2 AM during an active incident. An on-call engineer, bypassing the normal CI/CD pipeline entirely, logs into the AWS console and manually creates an S3 bucket — `corp-emergency-backup-prod` — to capture an emergency snapshot before a risky migration. The incident resolves. Three days later, someone runs the routine nightly `terraform plan` for that environment and it shows nothing unusual, because Terraform has no idea the bucket exists — it was never in the state file. Six months later, an engineer refactoring the module notices the bucket in the AWS console, has no record of why it exists, and the org has to decide: delete it and hope nothing depends on it, or manually reconcile it into Terraform's state without triggering a destroy-and-recreate that could take down whatever quietly started relying on it.

This is **state drift**: the gap between what's actually running in the cloud and what Terraform's state file believes is running. It's not a hypothetical — it's the routine, predictable result of any emergency hotfix, any manual console tweak "just this once," or any resource created by a different tool entirely.

## The Problem: Terraform Only Knows What It Wrote Down

Terraform is declarative — you write the desired end state in HCL, Terraform diffs it against its state file, and computes the actions needed to converge reality to that desired state. Critically, **the state file, not the cloud API, is Terraform's source of truth for "what exists."** If a resource was created outside Terraform's own `apply`, the state file has no record of it, and Terraform's next plan will either try to create a duplicate (if your HCL code independently declares a same-named resource) or, more dangerously, if your HCL doesn't yet describe it, silently ignore it while a future refactor destroys and recreates it under Terraform's eventual management — with real downtime if anything depends on that resource's continuity.

```text
[ Real World (Cloud) ]  <--->  [ State File (.tfstate) ]  <--->  [ Terraform Code (.tf) ]
   (manually created            (has no record of the           (doesn't declare the
    bucket exists)               manual bucket)                  bucket at all)
```

Reconciling drift means aligning all three: write HCL that matches the real resource, and bind that resource's existing state into Terraform's state file — without ever issuing a destroy-and-recreate.

## The Modern Solution: The Declarative `import` Block (Terraform 1.5+)

Terraform 1.5 introduced a declarative `import` block that lives in your `.tf` files (rather than being an imperative one-off CLI invocation), so the import operation itself becomes part of your reviewable, version-controlled code.

### Step 1: Write HCL That Matches the Real-World Resource

You must describe the resource exactly as it exists today. If your HCL omits a setting the console-created resource actually has, Terraform will plan to *change* it to match your code — potentially undoing a deliberate manual configuration you didn't know about.

```hcl
resource "aws_s3_bucket" "emergency_backup" {
  bucket        = "corp-emergency-backup-prod"
  force_destroy = false
}

resource "aws_s3_bucket_versioning" "emergency_backup_versioning" {
  bucket = aws_s3_bucket.emergency_backup.id
  versioning_configuration {
    status = "Enabled"
  }
}
```

### Step 2: Declare the Import Block

The `import` block tells Terraform: *do not create this resource — find the existing one by this ID and bind it to this resource address in my state.*

```hcl
import {
  to = aws_s3_bucket.emergency_backup
  id = "corp-emergency-backup-prod" # the actual bucket name in AWS
}

import {
  to = aws_s3_bucket_versioning.emergency_backup_versioning
  id = "corp-emergency-backup-prod" # versioning config keyed by the same bucket
}
```

### Step 3: Plan Before Touching Anything

```bash
terraform plan
```

The output tells you exactly how far your HCL is from reality. A perfect match looks like this:

```text
Plan: 2 to import, 0 to add, 0 to change, 0 to destroy.
```

If instead the plan shows a `~ change` — for example, a tag the on-call engineer added manually that your HCL doesn't declare — **do not apply yet.** Update your HCL to include that tag (or any other drifted attribute) and re-run `plan` until it reads `0 to change`. Applying an import plan that still shows changes means Terraform will modify the live resource to match your code on the very same run that imports it — which is exactly the kind of surprise this whole process exists to avoid.

### Step 4: Apply Once the Plan Is Clean

```bash
terraform apply
```

Terraform binds the existing resource into state without ever calling a create or destroy API against it. All three views — real world, state file, code — are now synchronized.

## Legacy Method: The Imperative CLI Command

For Terraform versions before 1.5, or for one-off ad hoc imports, the equivalent operation is the `terraform import` CLI command:

```bash
terraform import aws_s3_bucket.emergency_backup corp-emergency-backup-prod
```

This works, but it mutates the state file directly on whichever machine runs it — locally or in a CI job — with no corresponding line in a pull request. In a GitOps workflow where every state change should be traceable to a reviewed commit, this is a real auditability gap: a teammate reviewing the PR that adds `aws_s3_bucket.emergency_backup` to the codebase has no way to see, from the diff alone, that an import (not a fresh `apply`) is what will happen. The declarative `import` block closes that gap by making the import operation itself part of the reviewed code.

## Common Failure Mode: Importing Into the Wrong Module Path

A frequent mistake when reconciling drift inside a module structure is targeting the *root* resource address in the `import` block when the resource actually needs to live inside a child module:

```hcl
# Wrong — if the bucket belongs conceptually inside module.storage,
# importing to the root address creates a mismatch with future refactors
import {
  to = aws_s3_bucket.emergency_backup
  id = "corp-emergency-backup-prod"
}

# Correct — matches the resource address the module actually expects
import {
  to = module.storage.aws_s3_bucket.emergency_backup
  id = "corp-emergency-backup-prod"
}
```

Get the target address wrong and the next `plan` after a module refactor can show a destroy of the root-level resource and a create of the module-level one — the exact destructive surprise the import block exists to prevent.

## Conclusion

State drift from emergency manual changes is not a process failure to eliminate through stricter IAM alone — it's a predictable operational reality that needs a safe, reviewable reconciliation path. The `import` block turns what used to be an untracked, imperative CLI side-effect into a piece of code that goes through the same `plan`-before-`apply` discipline as everything else Terraform manages, and — critically — forces you to verify a `0 to change` plan before binding a resource into state, so the act of importing never itself becomes the thing that causes an outage.
