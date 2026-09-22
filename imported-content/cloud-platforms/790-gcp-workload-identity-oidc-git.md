# GCP Workload Identity Federation: Eliminating Static Keys in GitHub Actions Pipelines

## The Problem: The Security Debt of Long-Lived Service Account Keys

In automated continuous delivery pipelines (such as GitHub Actions deploying workloads to Google Cloud), machines require authentication to GCP APIs. Traditionally, teams achieved this by exporting a JSON key file for a GCP Service Account and saving it as a GitHub Actions repository secret.

This pattern introduces major architectural security flaws:
1. **No Automatic Expiration:** Static service account keys never expire by default. If a key is leaked or cached improperly, it remains active indefinitely unless manually revoked.
2. **High Exfiltration Risk:** If an attacker compromises the GitHub organization or an administrator's account, they can read or export these static credentials.
3. **Operational Overhead:** Implementing secure rotation programs for JSON files across dozens of repositories is complex, brittle, and prone to breaking active deployments.

---

## The Solution: Workload Identity Federation (WIF)

Workload Identity Federation (WIF) eliminates static credentials. It establishes a cryptographic trust relationship between GCP and GitHub Actions using OpenID Connect (OIDC). 

When a GitHub Actions runner runs a job, it obtains a short-lived OIDC JSON Web Token (JWT) directly from GitHub’s token service. This token contains metadata (claims) asserting the identity of the runner (repository name, workflow name, git branch, etc.). 

GCP acts as the Relying Party. It accepts the GitHub JWT, validates its cryptographic signature against GitHub's public key endpoint, checks if the metadata claims match configured constraints, and then exchanges it for a short-lived, low-privilege GCP OAuth 2.0 access token valid for up to one hour.

### Authentication Handshake Architecture

```
+---------------+           (1) Request JWT             +-----------------------+
|  GitHub Run   | ------------------------------------> |  GitHub OIDC Provider |
|  (GHA Runner) | <------------------------------------ |                       |
+---------------+            (2) Signed JWT             +-----------------------+
        |
        | (3) Exchange JWT for federated token
        v
+-------------------------------+                       +-----------------------+
|  GCP Security Token Service   | (4) Validate Sign.    |  GitHub Public JWKS   |
|  (STS Endpoint)               | --------------------> |  (token.actions...)   |
+-------------------------------+                       +-----------------------+
        |
        | (5) Check assertions (repo/branch claims)
        | (6) Issue federated token (short-lived)
        v
+-------------------------------+
|  GCP Service Account          | (7) Impersonate target Service Account
|  (IAM Engine)                 | ---------------------------------------> [ GCP APIs ]
+-------------------------------+
```

---

## Infrastructure as Code: Provisioning WIF with Terraform

To configure Workload Identity Federation, you must create a Workload Identity Pool, register GitHub as an OIDC Identity Provider, and bind the incoming federated identity to a target GCP Service Account.

### `wif.tf`

This Terraform configuration secures the federated trust boundary by validating that incoming tokens originate strictly from a specific GitHub organization and repository.

```hcl
# wif.tf - Provisioning GCP Workload Identity Federation for GitHub Actions

resource "google_service_account" "github_deployer" {
  account_id   = "github-deployer"
  display_name = "Service Account for GitHub Actions Deployments"
  project      = "my-secure-gcp-project"
}

resource "google_iam_workload_identity_pool" "github_pool" {
  workload_identity_pool_id = "github-actions-pool"
  display_name              = "GitHub Actions Pool"
  description               = "Identity Pool for secure GitHub Actions OIDC federation"
  project                   = "my-secure-gcp-project"
}

resource "google_iam_workload_identity_pool_provider" "github_provider" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github_pool.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  project                            = "my-secure-gcp-project"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.actor"      = "assertion.actor"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Bind IAM Role to the WIF Principal Set. ONLY allow the specific repository.
resource "google_service_account_iam_member" "wif_impersonation" {
  service_account_id = google_service_account.github_deployer.name
  role               = "roles/iam.serviceAccountTokenCreator"

  # PrincipalSet restricts token exchange strictly to GitHub organization 'my-org' and repo 'my-repo'
  member = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github_pool.name}/attribute.repository/my-org/my-repo"
}
```

---

## Pipeline Configuration: Integrating GitHub Actions

With GCP configured, you must authorize GitHub Actions to request the OIDC token. This is accomplished by declaring strict JWT permissions (`id-token: write`) inside the workflow file and using the official Google authentication action to execute the exchange.

### `.github/workflows/deploy.yml`

```yaml
name: Secure Deploy to Google Cloud

on:
  push:
    branches:
      - main

permissions:
  contents: read
  # CRITICAL: This permission is required to request the OIDC JWT from GitHub
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud via OIDC
        id: auth
        uses: google-github-actions/auth@v2
        with:
          # Format: projects/<project-number>/locations/global/workloadIdentityPools/<pool-id>/providers/<provider-id>
          workload_identity_provider: 'projects/123456789012/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider'
          service_account: 'github-deployer@my-secure-gcp-project.iam.gserviceaccount.com'
          token_format: 'access_token'

      - name: Deploy Resources with gcloud
        run: |
          gcloud compute instances list --project=my-secure-gcp-project
```

This configuration ensures that the pipeline runs securely without storing persistent cryptographic keys. Access is bounded, time-limited, and audited natively in Cloud Logging via Cloud IAM.
