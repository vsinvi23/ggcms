---
title: "GCP Workload Identity Federation: Eliminating Service Account Keys"
description: "A practical guide to replacing long-lived GCP service account JSON keys with OIDC-based Workload Identity Federation for GitHub Actions, including Terraform provisioning, gcloud setup, and the CI/CD authentication handshake."
type: "ARTICLE"
categorySlug: "cloud-platforms"
articleType: "GUIDE"
tags:
  - "gcp"
  - "workload-identity-federation"
  - "oidc"
  - "iam"
  - "github-actions"
  - "ci-cd-security"
---

# GCP Workload Identity Federation: Eliminating Service Account Keys

A security engineer inherits a GitHub organization with forty repositories. Twelve of them have a GCP service account JSON key sitting in `GITHUB_SECRETS`, uploaded by different engineers over three years, none of them rotated since. One of those keys belongs to a service account with `roles/editor` on the production project — because rotating a scoped-down key is annoying, so nobody ever revisits the grant. If any one of those forty repos is compromised (a malicious dependency, a leaked secret in a fork's pull request, a misconfigured Actions workflow that echoes environment variables into logs), the attacker walks away with a credential that is valid, silently, for years.

This is the actual failure mode Workload Identity Federation (WIF) is built to eliminate: not "keys can leak" in the abstract, but "keys that never expire, are hard to audit, and are trusted regardless of *where* they're used."

## The Problem: Static Keys Have No Concept of "Who's Asking"

A downloaded GCP service account JSON key is a bearer credential — whoever holds the file can use it, from any IP, indefinitely, until someone manually revokes it. This creates four concrete operational failures:

1. **No default expiration.** Keys remain valid until explicitly deleted — commonly for years.
2. **No origin binding.** GCP cannot tell the difference between "the real CI runner" and "an attacker who exfiltrated the file."
3. **Rotation is a manual, coordinated chore.** Rotating a key means generating a new one, updating every secret store that references it, and hoping nothing breaks mid-rotation — so teams defer it indefinitely.
4. **Leakage is common.** Keys get committed to git history, pasted into support tickets, or dumped by a compromised build step that prints its environment.

Workload Identity Federation removes the credential file entirely. Instead of *presenting a secret*, the external workload *proves an identity claim* (via a short-lived, cryptographically signed OIDC token it already gets from its own platform, e.g. GitHub) and GCP exchanges that claim for a short-lived access token — typically valid for one hour, tied to a specific repository, and fully auditable.

## Mental Model: Trust the Identity Provider, Not a Password

Instead of handing your CI runner a password (the JSON key) that proves who it is, you tell GCP to trust an external identity provider's signature. GCP validates the token's signature and claims, then — if they match a configured policy — issues its own short-lived token.

```text
+---------------+           (1) Request OIDC Token         +-----------------------+
|  GitHub Run   | ----------------------------------------> |  GitHub OIDC Provider |
|  (GHA Runner) | <---------------------------------------- |                       |
+-------+-------+           (2) Signed JWT                  +-----------------------+
        |
        | (3) Present JWT to GCP STS
        v
+-------------------------------+     (4) Validate signature   +-----------------------+
|  GCP Security Token Service   | ----------------------------> |  GitHub JWKS          |
|  (STS)                        | <---------------------------- |  (public keys)        |
+-------------------------------+     (5) Signature OK          +-----------------------+
        |
        | (6) Check claims against Workload Identity Pool Provider config
        | (7) Issue short-lived federated token
        v
+-------------------------------+
|  Target GCP Service Account   | (8) Federated token exchanged for
|  (impersonated, not owned)    |     a real GCP access token (<=1h)
+-------------------------------+
        |
        v
   [ GCP APIs: Cloud Run, GCS, Compute, ... ]
```

Two identities are involved and they are never merged: the *external identity* (a specific GitHub repository/branch, asserted by GitHub's signed token) and the *GCP service account* it is allowed to **impersonate**. No permissions are ever granted directly to the external identity — permissions live on the service account, and the external identity is only ever authorized to borrow it temporarily.

## Step 1: Create the Workload Identity Pool

The pool is a logical container for external identities GCP is willing to consider trusting.

```bash
gcloud iam workload-identity-pools create "github-actions-pool" \
  --project="my-secure-project" \
  --location="global" \
  --display-name="GitHub Actions Pool"
```

## Step 2: Register GitHub as an OIDC Provider, with Attribute Mapping

The provider links the pool to a specific external IdP and declares how claims inside the external JWT map onto GCP-recognized attributes.

```bash
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="my-secure-project" \
  --location="global" \
  --workload-identity-pool="github-actions-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner == 'my-org'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

The `--attribute-condition` flag is not optional in any policy you'd actually want to run in production: without it, *any* GitHub organization's repository can attempt to present a token to this provider (GitHub's issuer is a single shared endpoint). The condition restricts acceptance to your own organization before the token is even considered for impersonation.

## Step 3: Provision the Same Trust Relationship in Terraform

For anything beyond a one-off pool, define the pool, provider, and binding as code so the trust boundary is reviewable in a pull request rather than a one-time `gcloud` command someone ran from their laptop.

```hcl
# wif.tf — Workload Identity Federation for GitHub Actions

resource "google_service_account" "github_deployer" {
  account_id   = "github-deployer"
  display_name = "Service Account for GitHub Actions Deployments"
  project      = "my-secure-project"
}

resource "google_iam_workload_identity_pool" "github_pool" {
  workload_identity_pool_id = "github-actions-pool"
  display_name              = "GitHub Actions Pool"
  description                = "Identity pool for GitHub Actions CI/CD workflows"
  project                    = "my-secure-project"
}

resource "google_iam_workload_identity_pool_provider" "github_provider" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github_pool.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  project                            = "my-secure-project"

  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.actor"            = "assertion.actor"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
  }

  # Reject tokens from any org except our own before impersonation is even considered
  attribute_condition = "assertion.repository_owner == 'my-org'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Bind ONLY a specific repository to impersonate the service account —
# never bind a wildcard principalSet here.
resource "google_service_account_iam_member" "wif_impersonation" {
  service_account_id = google_service_account.github_deployer.name
  role                = "roles/iam.workloadIdentityUser"

  member = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github_pool.name}/attribute.repository/my-org/my-repo"
}
```

## Step 4: Authenticate from the GitHub Actions Workflow

No `GITHUB_SECRETS` entry holding a JSON key is required. The workflow requests an OIDC token from GitHub itself (via the `id-token: write` permission), and the official Google auth action performs the exchange described in the diagram above.

```yaml
name: Secure Deploy to Google Cloud

on:
  push:
    branches:
      - main

permissions:
  contents: read
  # REQUIRED: without this, GitHub will not issue an OIDC token to the job
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
          service_account: 'github-deployer@my-secure-project.iam.gserviceaccount.com'
          token_format: 'access_token'

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy my-service --image gcr.io/my-project/image --region us-central1
```

Note `123456789012` is the numeric **GCP project number**, not the project ID string — a common source of a mysterious "provider not found" error the first time this is configured.

## Operational Best Practices

* **Never bind a wildcard `principalSet`.** A binding like `principalSet://iam.googleapis.com/.../attribute.repository/*` lets any repository in the world impersonate your service account. Always scope to an exact `attribute.repository` or, at minimum, `attribute.repository_owner`.
* **Set `attribute_condition` at the provider level, in addition to scoping the IAM binding.** Defense in depth: the provider rejects the org before the token is even evaluated for impersonation, independent of any binding-level mistake.
* **Grant least privilege on the target service account.** WIF removes the *key* risk, not the *over-permissioned service account* risk — a repository that can impersonate an `roles/editor` service account is still a serious blast radius.
* **Audit STS and IAM Credentials API activity.** Enable Data Access audit logs for `iamcredentials.googleapis.com` and the Security Token Service so every federation event is traceable back to the originating repository, branch, and commit SHA.
* **Use `token_format: access_token`, not exported credentials files**, in the GitHub Action — this keeps the entire lifecycle in-memory for the job's duration.

## Conclusion

Workload Identity Federation converts an external system's own identity assertion into a short-lived, tightly scoped, fully audited GCP credential — without ever generating a file that could be copied, committed, or exfiltrated. The pattern generalizes past GitHub Actions to any OIDC-capable platform (GitLab CI, AWS workloads via their own STS-issued tokens, Kubernetes service account tokens); the mechanics — pool, provider with an attribute condition, a tightly-scoped `principalSet` binding, and impersonation instead of key export — stay the same. Default to federation for any workload that lives outside GCP; treat a JSON key request as something that needs a specific justification, not the default path.
