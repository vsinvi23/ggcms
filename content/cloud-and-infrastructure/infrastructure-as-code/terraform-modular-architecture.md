---
title: "Production Terraform Modular Architecture & State Management"
description: "A comprehensive guide to structuring DRY, modular Terraform codebases with remote state locking, environment isolation, input validation, and GCP/AWS provider modules."
type: "ARTICLE"
categorySlug: "infrastructure-as-code"
articleType: "GUIDE"
tags:
  - "terraform"
  - "ansible"
---

# Production Terraform Modular Architecture & State Management

Managing cloud infrastructure with Infrastructure as Code (IaC) requires modular code design, strict state locking, and complete separation between environments (`dev`, `test`, `prod`).

In this guide, we design a production-ready **Terraform Modular Architecture** targeting Google Cloud Platform (GCP).

---

## 1. Modular Directory Layout Architecture

```text
terraform-repository/
├── modules/
│   ├── gcp_cloud_run/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── gcp_postgres_db/
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
└── environments/
    ├── test/
    │   ├── main.tf
    │   ├── backend.tf
    │   └── terraform.tfvars
    └── prod/
        ├── main.tf
        ├── backend.tf
        └── terraform.tfvars
```

---

## 2. Reusable Terraform Cloud Run Module (`modules/gcp_cloud_run/main.tf`)

```hcl
variable "service_name" {
  type        = string
  description = "Name of Cloud Run service"
}

variable "container_image" {
  type        = string
  description = "Container image URL"
}

variable "min_instances" {
  type        = number
  default     = 1
}

resource "google_cloud_run_v2_service" "app" {
  name     = var.service_name
  location = "us-central1"
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = 10
    }

    containers {
      image = var.container_image

      resources {
        limits = {
          cpu    = "1000m"
          memory = "512Mi"
        }
      }
    }
  }
}

output "service_url" {
  value = google_cloud_run_v2_service.app.uri
}
```

---

## 3. Remote State Storage with GCS Locking (`environments/prod/backend.tf`)

Prevent concurrent state mutations using remote backend state locks stored in Google Cloud Storage:

```hcl
terraform {
  required_version = ">= 1.6.0"

  backend "gcs" {
    bucket = "ggcms-free-tier-vivek-tfstate"
    prefix = "env/production"
  }
}
```

---

## 4. Key Takeaways

1. **Always Store State Remotely with Locking**: Protect state files against accidental overwrites or secrets leakage by storing them in GCS or S3 with encryption enabled.
2. **Isolate Environments via Separate Directories**: Avoid relying on Terraform workspaces for production vs test; use distinct subdirectories (`environments/test/` vs `environments/prod/`).
3. **Keep Modules Focused**: Every module should manage a single logical cloud resource grouping.
