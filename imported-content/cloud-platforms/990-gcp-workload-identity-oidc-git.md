# GCP Workload Identity Federation: Eliminating Static Keys in GitHub Actions Pipelines

## The Problem: The Danger of Static Service Account Keys

In modern DevOps, pipelines frequently deploy infrastructure, push container images, or upload build artifacts to Google Cloud Platform (GCP). Traditionally, this integration was achieved by creating a GCP Service Account, exporting a JSON key file, and saving it as a repository secret (e.g., `GCP_CREDENTIALS`) in GitHub.

```
Traditional (Insecure) Secret Flow:
+------------------------+                        +------------------------+
| GitHub Actions Runner  | --(Sends JSON Key)---> | Google Cloud Platform  |
| * Stores static secret |                        | * Grant unlimited API  |
| * High leakage risk    |                        |   access with key      |
+------------------------+                        +------------------------+
            ^
            | (Key leaked via logs, misconfigured action, or git history)
            v
+------------------------+
|  Malicious Actor       |
+------------------------+
```

This traditional approach introduces severe security liabilities:
1. **No Automatic Expiry:** A compromised JSON key remains valid indefinitely until it is manually revoked or rotated.
2. **Leaked Secrets:** Key files are easily leaked via build logs, compromised third-party dependencies, or accidental commits.
3. **No Granular Auditing:** Tracking which developer, run, or branch utilized a specific key is highly complex when using static credentials.

---

## The Solution: Workload Identity Federation (WIF)

Workload Identity Federation leverages OpenID Connect (OIDC) to establish a trust relationship between GitHub and GCP. Instead of using a static key, GitHub Actions requests an ephemeral, short-lived OIDC token. GCP's Security Token Service (STS) validates this token and issues a temporary GCP access token valid for a maximum of one hour.

```
OIDC Token Exchange Architecture:
+------------------------+      1. Issue JWT      +------------------------+
| GitHub Actions Runner  | <--------------------- | GitHub OIDC Provider   |
| (No static secrets)    |                        +------------------------+
+------------------------+
      |
      | 2. Exchange JWT (OIDC Token)
      v
+------------------------+      3. Validate Token +------------------------+
|   GCP STS Endpoint     | <--------------------> | Google Cloud IAM       |
|   (Security Token)     |                        | * Matches claims       |
+------------------------+                        +------------------------+
      |
      | 4. Ephemeral Access Token (Valid max 1 hr)
      v
+------------------------+
| Deploy/Write to GCP    |
+------------------------+
```

---

## Technical Implementation

To set up Workload Identity Federation, you must provision a Workload Identity Pool and a Provider, and then map the claims inside the GitHub OIDC token to your target GCP Service Account.

### Step 1: Provisioning WIF with Terraform

The following Terraform configuration defines a secure Workload Identity Pool, restricts access exclusively to a single GitHub organization or repository, and grants permission for that federation provider to act as a target Service Account.

```hcl
# main.tf

provider "google" {
  project = "my-gcp-project-id"
  region  = "us-central1"
}

resource "google_iam_workload_identity_pool" "github_pool" {
  workload_identity_pool_id = "github-actions-pool"
  display_name              = "GitHub Actions Pool"
  description               = "Identity Pool for secure GitHub Actions OIDC integration"
}

resource "google_iam_workload_identity_pool_provider" "github_provider" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github_pool.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions-provider"
  display_name                       = "GitHub Actions Provider"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.owner"      = "assertion.repository_owner"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Create target service account for the pipeline
resource "google_service_account" "pipeline_sa" {
  account_id   = "github-pipeline-sa"
  display_name = "GitHub Pipeline Service Account"
}

# Bind WIF identity to the target Service Account with conditional claims (Restrict to your Repo)
resource "google_service_account_iam_binding" "wif_binding" {
  service_account_id = google_service_account.pipeline_sa.name
  role               = "roles/iam.workloadIdentityUser"

  members = [
    "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github_pool.name}/attribute.repository/my-github-org/my-target-repo"
  ]
}

# Output variables required for GitHub Actions YAML
output "workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github_provider.name
}

output "service_account_email" {
  value = google_service_account.pipeline_sa.email
}
```

---

### Step 2: Configuring the GitHub Actions Workflow

To utilize this federation, the GitHub workflow must request explicit OIDC permissions (`id-token: write`) to obtain the JWT from the runner environment.

Create the following file at `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Google Cloud with WIF

on:
  push:
    branches:
      - main

permissions:
  contents: read
  id-token: write # CRITICAL: Permits fetching GitHub's OIDC JWT

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        id: auth
        uses: google-github-actions/auth@v2
        with:
          token_format: 'access_token'
          workload_identity_provider: 'projects/123456789012/locations/global/workloadIdentityPools/github-actions-pool/providers/github-actions-provider'
          service_account: 'github-pipeline-sa@my-gcp-project-id.iam.gserviceaccount.com'

      # Verify authentication succeeded by listing storage buckets
      - name: List GCS Buckets
        run: |
          gcloud storage buckets list --format="value(name)"
```

---

## Architectural Breakdown of Claims Validation

When GitHub Actions requests access, GCP validates the assertion claims sent in the JWT. The mapping `attribute.repository = assertion.repository` acts as a crucial firewall. Without this check, *any* GitHub runner from *any* repository could exchange their OIDC token for access to your service account. 

By enforcing:
`principalSet://.../attribute.repository/my-github-org/my-target-repo`

We ensure that only workflows executing inside `my-github-org/my-target-repo` are authorized to obtain short-lived credentials. If a malicious user attempts to target your provider from a different repository, Google IAM immediately rejects the exchange with a `403 Forbidden` error.
