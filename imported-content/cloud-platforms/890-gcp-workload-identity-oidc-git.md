# GCP Workload Identity Federation: Eliminating Static Keys in GitHub Actions Pipelines

## The Problem: The Peril of Long-Lived Service Account Keys

Integrating external CI/CD platforms like GitHub Actions with Google Cloud Platform (GCP) traditionally required generating and exporting a long-lived Service Account JSON key. This key would be stored as a GitHub Secret and injected into the pipeline runner's environment.

This pattern is a severe security anti-pattern:
1. **Key Sprawl:** Static keys are easily leaked via logs, misconfigured repositories, or compromised developer workstations.
2. **Lack of Rotation:** Keys are rarely rotated due to the operational overhead of updating external secrets, leading to persistent vulnerabilities.
3. **Coarse Auditing:** When an external pipeline authenticates with a static key, Cloud Audit Logs attribute the action to the Service Account, but distinguishing *which* specific GitHub workflow invoked it is difficult or impossible.

To secure CI/CD pipelines, we must eliminate static credentials entirely in favor of short-lived, dynamically requested access tokens tied to cryptographic identity.

## The Architecture: Workload Identity Federation

GCP Workload Identity Federation (WIF) solves this by extending GCP IAM to trust external Identity Providers (IdPs) via OpenID Connect (OIDC) or SAML. Instead of holding a secret, GitHub Actions presents a cryptographically signed JSON Web Token (JWT) proving its identity. GCP verifies this token and issues a short-lived OAuth 2.0 access token in return.

```text
+-------------------+                          +-------------------+
|  GitHub Actions   |                          |    Google Cloud   |
|     Runner        |                          |      Platform     |
+-------------------+                          +-------------------+
          |                                              |
          | 1. Generate OIDC Token (JWT)                 |
          |    signed by GitHub                          |
          |--------------------------------------------->|
          |                                              |
          |                                              | 2. Verify JWT signature
          |                                              |    against GitHub's public keys.
          |                                              | 3. Evaluate Attribute Mapping.
          |                                              |
          | 4. Issue Short-Lived Access Token            |
          |<---------------------------------------------|
          |                                              |
          | 5. Call GCP API (e.g., gsutil, gcloud)       |
          |    with Access Token                         |
          |--------------------------------------------->|
```

## Configuring the Trust Boundary

To establish this federated trust, you must configure a Workload Identity Pool and a Provider in GCP.

### 1. Create the Workload Identity Pool
The pool acts as the namespace for external identities.

```bash
gcloud iam workload-identity-pools create "github-actions-pool" \
  --project="my-security-project" \
  --location="global" \
  --display-name="GitHub Actions Pool"
```

### 2. Create the OIDC Provider
The provider tells GCP to trust GitHub's OIDC issuer and defines how to map claims from the GitHub JWT into GCP attributes.

```bash
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="my-security-project" \
  --location="global" \
  --workload-identity-pool="github-actions-pool" \
  --display-name="GitHub OIDC Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

*Security Note:* The `attribute-mapping` is critical. It maps the incoming JWT claims (`assertion.repository`) to GCP attributes (`attribute.repository`).

### 3. Bind the External Identity to a GCP Service Account
We bind the specific GitHub repository to a target Service Account. This ensures that *only* workflows originating from the designated repository can impersonate the Service Account.

```bash
# Get the Project Number
PROJECT_NUMBER=$(gcloud projects describe my-security-project --format="value(projectNumber)")

gcloud iam service-accounts add-iam-policy-binding "deployer-sa@my-security-project.iam.gserviceaccount.com" \
  --project="my-security-project" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-actions-pool/attribute.repository/my-org/my-secure-repo"
```

## Implementing in GitHub Actions

With the GCP side configured, the GitHub Action can now authenticate dynamically using the `auth` action provided by Google. No static JSON keys are required.

```yaml
name: Deploy to GCP
on:
  push:
    branches:
      - main

# Required to allow the workflow to request the OIDC token
permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: 'projects/123456789012/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider'
          service_account: 'deployer-sa@my-security-project.iam.gserviceaccount.com'

      - name: Verify Authentication
        run: |
          gcloud auth list
          gsutil ls gs://my-secure-bucket
```

## Summary
Workload Identity Federation represents a massive leap in cloud security posture. By shifting from asymmetric, static secrets to OIDC-backed, dynamically evaluated attribute constraints, organizations can eliminate the risk of leaked Service Account keys. Furthermore, it enables granular authorization rules, ensuring that an identity is not just "GitHub," but a specific workflow, executing on a specific branch, in a specific repository.