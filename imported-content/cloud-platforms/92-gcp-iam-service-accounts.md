# GCP IAM Workload Federation: Eliminating Service Account Keys

## The Static Credential Problem
For years, the standard method for authenticating external workloads (like GitHub Actions, on-premises servers, or AWS instances) to Google Cloud Platform (GCP) involved generating Service Account JSON keys. These static, long-lived credentials present a massive security liability.

If a developer accidentally commits a Service Account key to a public repository, or if a CI/CD runner is compromised and its environment variables are dumped, attackers gain immediate, persistent access to your GCP environment. Rotating these keys is notoriously difficult, leading to organizations keeping them active for years. 

The modern, secure approach completely eliminates the need to download or store these JSON keys. The solution is **Workload Identity Federation**.

## Mental Model: Trusting External Identities
Instead of giving your external system a password (the JSON key) to prove who it is, you tell GCP to trust the external system's identity provider (IdP). 

When using Workload Identity Federation, GCP uses OpenID Connect (OIDC) or SAML to verify a cryptographic token provided by the external system. If the token is valid, GCP dynamically issues short-lived access tokens to the external workload.

```text
[ GitHub Actions ] -- 1. Requests OIDC Token --> [ GitHub IdP ]
                                                        |
                                                 2. Returns Signed JWT
                                                        |
[ GitHub Actions ] -- 3. Presents JWT to GCP --> [ GCP STS (Security Token Service) ]
                                                        |
                                                 4. Validates JWT Signature & Claims
                                                        |
[ GitHub Actions ] <-- 5. Returns Short-Lived Token -- [ GCP IAM ]
       |
 6. Accesses GCP Resources (e.g., Cloud Storage, GKE)
```

## Implementation: Configuring Identity Federation
Let's walk through configuring GCP to trust GitHub Actions, allowing a workflow to authenticate without a JSON key.

### Step 1: Create a Workload Identity Pool
The Pool acts as a logical container for external identities that you want GCP to trust.

```bash
gcloud iam workload-identity-pools create "github-actions-pool" \
  --project="my-secure-project" \
  --location="global" \
  --display-name="GitHub Actions Pool"
```

### Step 2: Create a Workload Identity Provider
The Provider links the Pool to the specific external IdP (in this case, GitHub). We also define attribute mappings, which tell GCP how to map claims in the GitHub OIDC token to Google Cloud identity attributes.

```bash
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="my-secure-project" \
  --location="global" \
  --workload-identity-pool="github-actions-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```
*Crucial Detail:* The `--attribute-mapping` flag translates the `repository` claim from GitHub's JWT into a GCP attribute named `attribute.repository`.

### Step 3: Bind the External Identity to a Service Account
We don't assign permissions directly to the external identity. Instead, we allow the external identity to impersonate an existing GCP Service Account. 

Let's assume you have a Service Account named `deployer@my-secure-project.iam.gserviceaccount.com` that has the permissions necessary to deploy your app. We will allow *only* a specific GitHub repository to impersonate it.

```bash
gcloud iam service-accounts add-iam-policy-binding "deployer@my-secure-project.iam.gserviceaccount.com" \
  --project="my-secure-project" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/github-actions-pool/attribute.repository/my-org/my-repo"
```
*Note: Replace `123456789012` with your GCP Project Number (not the Project ID).*

## Authenticating in the CI/CD Pipeline
Now, your GitHub Actions workflow can authenticate using the official Google Auth action. No JSON keys are required in GitHub Secrets.

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    # Required to fetch the OIDC token
    permissions:
      contents: 'read'
      id-token: 'write' 

    steps:
    - uses: actions/checkout@v4

    - id: auth
      name: Authenticate to Google Cloud
      uses: google-github-actions/auth@v2
      with:
        workload_identity_provider: 'projects/123456789012/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider'
        service_account: 'deployer@my-secure-project.iam.gserviceaccount.com'

    - name: Deploy to Cloud Run
      run: |
        gcloud run deploy my-service --image gcr.io/my-project/image --region us-central1
```

## Conclusion
Workload Identity Federation bridges trust between platforms using cryptographic verification, entirely eliminating the attack vector of stolen static keys. By mapping specific OIDC claims to GCP roles, you can enforce strict, granular boundaries—ensuring that only a specific repository, branch, or environment can access your cloud resources. Always default to federation over JSON keys for any external workload integration.