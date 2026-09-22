# GCP Workload Identity Federation: Eliminating Static Keys in GitHub Actions Pipelines

## The Problem: The Perils of Static Service Account Keys
Historically, authenticating a CI/CD pipeline (like GitHub Actions) to Google Cloud Platform (GCP) required generating a long-lived Service Account JSON key, storing it as a repository secret, and passing it to the pipeline runtime. This pattern introduces significant security vulnerabilities:
1. **Key Leakage:** Keys can be accidentally committed to source control or exposed in build logs.
2. **Lack of Rotation:** Static keys are rarely rotated due to operational overhead.
3. **Broad Blast Radius:** A compromised key provides persistent, untethered access until manually revoked.

## The Solution: Workload Identity Federation (WIF)
GCP Workload Identity Federation solves this by implementing an OpenID Connect (OIDC) trust relationship between the external Identity Provider (GitHub, in this case) and Google Cloud. Instead of passing a secret key, the pipeline uses its verifiable identity to request short-lived, scoped access tokens directly from GCP.

### Architecture Breakdown
The WIF flow relies on cryptographic verification of JSON Web Tokens (JWTs).

```text
+-------------------+                      +-------------------+
|                   |                      |                   |
|  GitHub Actions   |                      |   Google Cloud    |
|     Pipeline      |                      |                   |
+-------------------+                      +-------------------+
          |                                          |
          | 1. Request OIDC Token                    |
          |----------------------------------------> |
          |                                          |
          | <----------------------------------------|
          | 2. Receive GitHub JWT (signed by GitHub) |
          |                                          |
          | 3. Exchange JWT for GCP STS Token        |
          |----------------------------------------> | [GCP STS validates
          |                                          |  GitHub signature]
          | <----------------------------------------|
          | 4. Receive Short-Lived STS Token         |
          |                                          |
          | 5. Impersonate GCP Service Account       |
          |----------------------------------------> | [GCP IAM checks 
          |                                          |  binding rules]
          | <----------------------------------------|
          | 6. Receive GCP Access Token (OAuth2)     |
          |                                          |
          | 7. Access GCP Resources (e.g., GCS)      |
          |----------------------------------------> |
+-------------------+                      +-------------------+
```

### Technical Implementation

#### 1. Configuring the Workload Identity Pool
First, we establish a trust boundary by creating a Workload Identity Pool and an OIDC Provider in GCP. This tells GCP to trust identities issued by `https://token.actions.githubusercontent.com`.

```bash
# Create the Identity Pool
gcloud iam workload-identity-pools create "github-actions-pool" \
  --project="my-gcp-project" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Create the OIDC Provider within the Pool
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="my-gcp-project" \
  --location="global" \
  --workload-identity-pool="github-actions-pool" \
  --display-name="GitHub provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```
*Note the `attribute-mapping`. This maps claims from the GitHub JWT to GCP attributes, enabling granular access control.*

#### 2. Binding the Identity to a Service Account
We map the external identity (e.g., a specific GitHub repository) to a GCP Service Account. This prevents other repositories from assuming the role.

```bash
# Bind the specific GitHub repo to the Service Account
gcloud iam service-accounts add-iam-policy-binding "deploy-sa@my-gcp-project.iam.gserviceaccount.com" \
  --project="my-gcp-project" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/1234567890/locations/global/workloadIdentityPools/github-actions-pool/attribute.repository/my-org/my-repo"
```

#### 3. The GitHub Actions Workflow
In the CI/CD YAML, we use the `google-github-actions/auth` action. No static keys are required.

```yaml
name: Deploy to GCP
on:
  push:
    branches: [ "main" ]

# Required to request the OIDC token
permissions:
  contents: read
  id-token: write 

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: 'projects/1234567890/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider'
          service_account: 'deploy-sa@my-gcp-project.iam.gserviceaccount.com'

      - name: Deploy Workload
        run: gcloud run deploy my-service --image gcr.io/my-image --region us-central1
```

### Security Posture Improvements
By shifting to WIF, we eliminate the storage and transmission of static credentials. The authentication lifecycle is entirely ephemeral. The tokens generated are bounded by time (typically 1 hour) and scope (the permissions of the impersonated service account). Furthermore, the attribute mapping allows for strict policy enforcement, ensuring that only a specific GitHub branch, environment, or repository can trigger deployments, enforcing zero-trust principles at the CI/CD perimeter.
