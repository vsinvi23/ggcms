# GCP Workload Identity Federation: Eliminating Long-Lived Static Service Account Keys

## The Problem: The Toxic Risk of Exported Service Account JSON Keys

Historically, authenticating non-GCP workloads (such as GitHub Actions pipelines, GitLab runners, or on-premise Kubernetes clusters) to Google Cloud APIs required exporting a Service Account JSON key. These keys represent a catastrophic security vulnerability in cloud architecture for several reasons:

1. **Infinite Lifespan by Default**: Exported JSON keys are long-lived credentials that remain valid for up to 10 years unless manually rotated or explicitly revoked.
2. **Lack of Identity Context**: Once a private key file is downloaded, GCP loses visibility into *who* is using the key. If leaked, any entity from any IP address can impersonate the service account.
3. **No Automatic Rotation**: Hardcoding these keys as secrets in CI/CD platforms (e.g., GitHub Secrets) creates massive operational friction during rotation cycles, leading teams to defer rotation indefinitely.
4. **Credential Leakage**: A significant portion of cloud security breaches originate from developers accidentally committing Service Account JSON keys to public or private version-control repositories.

---

## Technical Architecture: Trust Federation via OIDC

**Workload Identity Federation** leverages OpenID Connect (OIDC) or SAML 2.0 to establish a secure, keyless trust relationship between GCP and external Identity Providers (IdPs) like GitHub, GitLab, or AWS. Instead of static keys, workloads use short-lived, ephemeral OAuth 2.0 access tokens.

### The Keyless Authentication Flow

```
+---------------+           +-----------------+          +---------------------+
| GitHub Action |           |   GitHub OIDC   |          | GCP Security Token  |
|  Runner       |           |   Provider      |          |    Service (STS)    |
+-------+-------+           +--------+--------+          +----------+----------+
        |                            |                              |
        | 1. Request OIDC Token      |                              |
        +===========================>|                              |
        |                            |                              |
        | 2. Returns Signed JWT      |                              |
        |<---------------------------+                              |
        |                                                           |
        | 3. Exchange JWT for Federated Token                       |
        +==========================================================>|
        |                                                           |
        | 4. Validate JWT with GitHub JWKS                          |
        |    & Issue Ephemeral GCP STS Token                        |
        |<----------------------------------------------------------+
        |
        | 5. Exchange STS Token for short-lived GCP IAM Access Token
        |    (via iamcredentials.generateAccessToken)
        v
+-------+-------+                                        +----------+----------+
|  GCP IAM      +<---------------------------------------+  Google  |          |
|  Service      |                                        |  Cloud   |          |
+---------------+                                        +----------+----------+
```

1. **OIDC Token Generation**: The GitHub Actions runner requests a cryptographically signed JSON Web Token (JWT) from GitHub’s OIDC provider. This token contains assertions about the environment (e.g., `repository`, `actor`, `ref`).
2. **Federated Token Exchange**: The runner sends this signed JWT to Google’s Security Token Service (STS).
3. **Assertion Validation**: GCP's STS verifies the signature of the incoming JWT against GitHub’s public keys (JWKS) and checks that the claims match the configured Workload Identity Pool constraints.
4. **Impersonation**: Upon successful verification, STS issues a temporary federated token. The runner exchanges this federated token with the GCP IAM Credentials API to receive a short-lived GCP Service Account access token (maximum lifespan of 1 hour).

---

## Implementation: Terraform Infrastructure as Code

The following Terraform configuration creates a Workload Identity Pool, configures GitHub as an OIDC provider, maps assertions, and grants the external repository access to a specific GCP Service Account without generating any keys.

```hcl
# 1. Create the Workload Identity Pool
resource "google_iam_workload_identity_pool" "github_pool" {
  workload_identity_pool_id = "github-actions-pool"
  display_name              = "GitHub Actions Pool"
  description               = "Identity pool for GitHub Actions CI/CD workflows"
}

# 2. Configure GitHub as the OIDC Identity Provider
resource "google_iam_workload_identity_pool_provider" "github_provider" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github_pool.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub OIDC Provider"

  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.actor"            = "assertion.actor"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
  }

  attribute_condition = "assertion.repository_owner == 'your-org-or-username'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# 3. Create the Target Service Account
resource "google_service_account" "cicd_sa" {
  account_id   = "github-cicd-deployer"
  display_name = "GitHub Actions Deployment SA"
}

# 4. Map the Federated Identity to the Service Account
resource "google_service_account_iam_member" "workload_user" {
  service_account_id = google_service_account.cicd_sa.name
  role               = "roles/iam.workloadIdentityUser"

  # Limit access strictly to a specific repository
  member = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github_pool.name}/attribute.repository/your-org-or-username/your-repo-name"
}
```

---

## Operational Best Practices

* **Always Restrict Subject Mappings**: Never write an IAM policy that allows a wildcard match on the Workload Identity Pool (`principalSet://iam.googleapis.com/.../*`). This allows *any* GitHub repository in the world to assume your Service Account. Restrict mapping strictly to your GitHub organization (`attribute.repository_owner`) or the exact repository name (`attribute.repository`).
* **Implement Least Privilege**: Assign only the minimal necessary IAM roles (such as Cloud Run Developer, Storage Object Admin, or Compute Instance Admin) to the targeted service account.
* **Audit STS Activity**: Enable `Data Write` and `Data Read` audit logging for the IAM Credentials API and Security Token Service in your GCP Logging settings to trace and audit every single federation event back to the originating GitHub user and commit ref.
