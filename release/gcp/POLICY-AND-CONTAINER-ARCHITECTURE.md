# GCP Policy & Container Architecture Review Document

> **Project**: `ggcms-free-tier-vivek`  
> **Target Domains**: `https://geekgully.com` & `https://www.geekgully.com`  
> **Unified Container Service**: `gg-cms-backend` (Cloud Run)  
> **Database Infrastructure**: `ggcms-db-vm` (Compute Engine VM, PostgreSQL 16 & MongoDB 7)

---

## 1. Executive Summary & Policy Changes

To achieve a **$0 Always-Free, Production-Grade GCP Deployment** while providing **Public Web Access on Custom Domains**, two critical policy and networking changes were configured:

### 🔒 IAM & Organization Policy Changes (`iam.allowedPolicyMemberDomains`)

1. **The Issue Encountered**:  
   Google Workspace organizations (`serenyax.com`) automatically enforce an Organization Policy constraint (`constraints/iam.allowedPolicyMemberDomains`) that restricts granting public unauthenticated access (`allUsers`) on GCP resources.
2. **The Policy Resolution**:  
   - **Constraint Overridden**: `constraints/iam.allowedPolicyMemberDomains` on project `ggcms-free-tier-vivek` was overridden to **Allow All**.
   - **IAM Invoker Binding**: `roles/run.invoker` was bound to `allUsers` on Cloud Run service `gg-cms-backend`.
   - **Security Guarantee**: Unauthenticated public users can access public static UI routes & landing pages, while **all administrative and data-modifying API routes (`/api/...`) strictly require a signed JWT token**.

---

## 2. Container & Service Interconnection Architecture

```
                                    +-------------------------------------------------------+
                                    |                  Public Internet                      |
                                    +-------------------------------------------------------+
                                           |                                      |
                                  https://geekgully.com                  https://www.geekgully.com
                                  (Cloud Run Domain Mapping)            (Cloud Run Domain Mapping)
                                           \                                      /
                                            +------------------------------------+
                                                             |
                                                             v
                                              +------------------------------+
                                              |    Google Cloud Frontend     |
                                              |    (Managed SSL & Ingress)   |
                                              +------------------------------+
                                                             |
                                                             v
                                        +------------------------------------------+
                                        |    GCP Cloud Run: gg-cms-backend         |
                                        |    - Go 1.25 REST API Server             |
                                        |    - Embedded React SPA Static Assets    |
                                        |    - Canonical Redirect (.run.app -> UI) |
                                        +------------------------------------------+
                                           |                                   |
                +--------------------------+                                   +--------------------------+
                | Private mTLS Tunnel                                                                     | Secret Access
                v                                                                                         v
+----------------------------------------------------+                                   +----------------------------------+
| Compute Engine VM: ggcms-db-vm (10.128.0.2)       |                                   | GCP Secret Manager               |
| - PostgreSQL 16 (Port 5432) over TLS               |                                   | - db-passwords                   |
| - MongoDB 7 (Port 27017) over TLS                  |                                   | - db-tls-ca / cert / key         |
| - Internal VPC (Zero Public Ports)                 |                                   +----------------------------------+
+----------------------------------------------------+
```

---

## 3. Detailed Component Interconnections

### B. Canonical Domain Redirect Middleware (Hardened Routing)
- **Automatic HTTP 301 Redirect**: Any incoming web requests hitting default `*.run.app` endpoints are automatically issued an HTTP `301 Moved Permanently` redirect to `https://geekgully.com`.
- **Implementation in Go Router**:
  ```go
  r.Use(func(c *gin.Context) {
      if strings.Contains(c.Request.Host, ".run.app") {
          target := "https://geekgully.com" + c.Request.URL.String()
          c.Redirect(http.StatusMovedPermanently, target)
          c.Abort()
          return
      }
      c.Next()
  })
  ```
- **SEO & Security Benefit**: Prevents duplicate content indexation in search engines while ensuring all visitors load the official `https://geekgully.com` domain.


### B. Cloud Run ➔ Compute Engine VM Databases (PostgreSQL 16 & MongoDB 7)
- **Networking**: Cloud Run connects to `ggcms-db-vm` over Google Cloud's internal Virtual Private Cloud (VPC) network at `10.128.0.2`.
- **Security**: Databases do **NOT** listen on public IP addresses. Database ports (`5432`, `27017`) are blocked by VPC Firewall rules for all external IPs.
- **Encryption**: Connections use client-certificate mTLS (Mutual TLS) loaded from GCP Secret Manager during container startup.

### C. Cloud Run ➔ GCP Secret Manager
- **Identity**: Cloud Run runs under a dedicated, hardened Service Account (`cloudrun-runner@ggcms-free-tier-vivek.iam.gserviceaccount.com`).
- **Role Assignment**: `roles/secretmanager.secretAccessor` (Least-Privilege model).
- **Secrets Managed**: `db-passwords`, `db-tls-ca`, `db-tls-cert`, `db-tls-key`.

### D. Local Workstation ➔ GCP Cloud Run Access (Auth Proxy)
- **Local Mac Proxy**: `node release/gcp/local-ui-proxy.js` runs on `http://localhost:8085`.
- **Token Injection**: Automatically generates and appends Google OAuth Identity Tokens (`gcloud auth print-identity-token`) to every HTTP request, allowing instant local developer testing.

---

## 4. Verification & Audit Tools

1. **Free Tier Quota Check**:
   ```bash
   bash release/gcp/check-free-tier-limits.sh
   ```
2. **Database Backup & Recovery**:
   ```bash
   bash release/gcp/backup/postgres-backup.sh --full
   bash release/gcp/backup/mongodb-backup.sh --snapshot
   ```
