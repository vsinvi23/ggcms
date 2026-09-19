---
title: "Production Deployment of Microservices on GCP Cloud Run"
description: "A step-by-step guide to deploying secure, serverless containerized microservices on Google Cloud Run with Direct VPC egress, Cloud SQL integration, and Secret Manager."
type: "ARTICLE"
categorySlug: "cloud-platforms"
articleType: "TUTORIAL"
tags:
  - "gcp"
  - "cloud-platforms"
---

# Production Deployment of Microservices on GCP Cloud Run

Google Cloud Run is a fully managed serverless execution platform for stateless containerized workloads. It scales dynamically from zero to thousands of instances while offering native Google Cloud VPC connectivity, automatic HTTPS termination, and Secret Manager integration.

In this step-by-step tutorial, we build minimal multi-stage Docker containers, configure environment variables and secrets, establish Direct VPC egress for internal database communication, and execute production `gcloud` deployment commands.

---

## 1. Prerequisites & Container Multi-Stage Optimization

To minimize cold starts and reduce security attack vectors, containers deployed to Cloud Run should use static multi-stage builds resulting in images under 30MB.

```dockerfile
# Stage 1: Build
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o server ./cmd/server

# Stage 2: Minimal Runtime Environment
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/server .
EXPOSE 8080
USER nobody
ENTRYPOINT ["/app/server"]
```

---

## 2. Production `gcloud` Deployment Command

Use `gcloud run deploy` with explicit resource caps, minimum instances (to eliminate cold-start latency for production endpoints), VPC access, and GCP Secret Manager bindings:

```bash
#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="gg-cms-backend"
REGION="us-central1"
IMAGE="gcr.io/ggcms-free-tier-vivek/gg-cms-backend:latest"

gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 1 \
  --max-instances 10 \
  --cpu 1 \
  --memory 512Mi \
  --network default \
  --subnet default \
  --vpc-egress private-ranges-only \
  --set-env-vars "APP_ENV=production,PORT=8080" \
  --set-secrets "DB_WRITE_URL=gg-cms-db-write-url:latest,JWT_SECRET=gg-cms-jwt-secret:latest"
```

---

## 3. Direct VPC Egress Architecture for Internal Cloud SQL / Compute Engine

When Cloud Run services communicate with private backend databases (e.g. PostgreSQL running on Google Compute Engine or Cloud SQL):

```text
 ┌────────────────────────────────┐                 ┌───────────────────────────────┐
 │ Cloud Run Service              │                 │ Internal Compute Engine /     │
 │ (Serverless Container)         │                 │ Cloud SQL Instance            │
 └──────────────┬─────────────────┘                 └──────────────┬────────────────┘
                │ Direct VPC Egress                                │ Private IP
                │ (--vpc-egress=private-ranges-only)               │ 10.128.0.5:5432
                ▼                                                  ▼
 ┌──────────────────────────────────────────────────────────────────────────────────┐
 │ Google Cloud Default VPC Network (RFC 1918 Private Subnet)                      │
 └──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Key Deployment Principles

1. **Keep Min-Instances = 1 for Production APIs**: Prevents cold-start delays on critical customer user requests.
2. **Inject Credentials via Secret Manager**: Never hardcode database URIs or JWT secrets in Dockerfiles or plain environment variables.
3. **Configure `--vpc-egress private-ranges-only`**: Ensures external outbound internet traffic bypasses VPC fees while keeping internal RFC 1918 IP database traffic encrypted inside the internal Google network.
