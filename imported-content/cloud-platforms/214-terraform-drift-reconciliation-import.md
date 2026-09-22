# Terraform State Drift: Reconciling Manual Console Changes using `terraform import`

## The Problem: The Inevitability of State Drift

Terraform operates on a declarative model: you write configuration code defining your desired infrastructure, and Terraform creates it, recording the result in a state file (`terraform.tfstate`). This state file acts as Terraform's source of truth, mapping your HCL code to real-world cloud resources.

However, in emergency situations—such as mitigating an ongoing DDoS attack or applying a critical hotfix to a database—engineers often bypass the CI/CD pipeline and make manual changes directly via the AWS, Azure, or GCP web consoles. 

When this happens, the real-world infrastructure diverges from what Terraform recorded in its state file. This discrepancy is known as **State Drift**. If left unresolved, the next time Terraform runs, it will attempt to "fix" the drift by reverting the manual emergency changes back to the outdated state defined in the codebase, potentially causing an immediate outage.

## The Solution: Drift Reconciliation and State Import

To resolve state drift, you must bridge the gap between the manually altered real-world infrastructure and your Terraform configuration. This process involves two critical phases:
1. Updating the Terraform HCL code to match the new reality.
2. Instructing Terraform to bind existing cloud resources to the updated code without destroying or recreating them.

Historically, this binding was done exclusively via the `terraform import` CLI command. With Terraform 1.5+, a new, more declarative `import` block was introduced, streamlining the process.

### The Mental Model: The Three States

To reconcile drift, you must align three distinct concepts:

```text
[ Real World (Cloud) ]  <--->  [ State File (.tfstate) ]  <--->  [ Terraform Code (.tf) ]
   (Manual changes)               (Outdated mapping)             (Outdated definition)
```

If a user manually creates an S3 bucket or modifies a Security Group in the console, the Real World moves ahead. To synchronize, we update the Terraform Code to match the Real World, and use the `import` mechanism to update the State File, linking the code to the existing resource.

## Modern Drift Resolution: The `import` Block

Imagine an engineer manually created an AWS S3 bucket named `corp-emergency-backup-prod` via the AWS Console. Terraform knows nothing about it.

### Step 1: Write the corresponding Terraform Code

First, you must define the resource in your `.tf` files exactly as it exists in the cloud. If you omit required fields, Terraform might attempt to overwrite the real-world settings.

```hcl
resource "aws_s3_bucket" "emergency_backup" {
  bucket = "corp-emergency-backup-prod"
  
  # Ensure these match the manual configurations
  force_destroy = false
}

resource "aws_s3_bucket_versioning" "emergency_backup_versioning" {
  bucket = aws_s3_bucket.emergency_backup.id
  versioning_configuration {
    status = "Enabled"
  }
}
```

### Step 2: Define the Import Block

In Terraform 1.5 and newer, you use a declarative `import` block. This block tells Terraform: "Do not create this resource. Instead, look for a resource in AWS with this specific ID, and map it to the resource address in my code."

```hcl
import {
  to = aws_s3_bucket.emergency_backup
  id = "corp-emergency-backup-prod" # The actual AWS Bucket Name
}
```

### Step 3: Plan and Apply

Execute `terraform plan`. Terraform will recognize the `import` block, query the AWS API for the bucket, and compare it against your HCL code.

```bash
terraform plan
```

If your HCL code perfectly matches the real-world configuration, the plan will output:
`Plan: 1 to import, 0 to add, 0 to change, 0 to destroy.`

If your HCL code is missing a tag that the engineer added manually, Terraform will show a `change` to remove that tag. You must update your HCL code to include the missing tag until the plan shows `0 to change`.

Once the plan is clean, execute:

```bash
terraform apply
```

Terraform will update the state file. The Real World, State File, and Terraform Code are now fully synchronized.

## Legacy Method: The CLI Command

For Terraform versions prior to 1.5, or for complex modular imports, the imperative CLI command is used instead of the `import` block.

```bash
terraform import aws_s3_bucket.emergency_backup corp-emergency-backup-prod
```

While effective, this method is imperative. It modifies the state file directly on your local machine (or remote backend) independent of a code commit, making it harder to track via Pull Requests in a GitOps workflow. The declarative `import` block is now the industry standard best practice.

## Conclusion

State drift is a reality of cloud operations. While strict IAM controls should prevent manual console changes, emergencies happen. By mastering the `import` process—carefully writing matching HCL and cleanly binding the real-world resources to the state file—infrastructure teams can safely adopt manual hotfixes into their immutable Infrastructure-as-Code pipelines without risking destructive rollbacks.