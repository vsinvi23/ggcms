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

## 4. The Scenario: A New Revision Goes Out and Immediately Errors for Every User

### Why `gcloud run deploy` Alone Is a Risky Default

Running `gcloud run deploy` (Section 2) creates a new **revision** and, by default, immediately routes 100% of traffic to it — there is no automatic canary, no health-check gate beyond the container starting successfully. If the new revision has a bug that only manifests under real traffic (a bad migration, a misconfigured secret, a dependency that fails on first request), every user hits it at once, with no automatic rollback.

```text
  Default deploy: instant 100% cutover, no safety net
  ─────────────────────────────────────────────────────
  Revision gg-cms-backend-00042 (v1.3.0) ── 100% traffic
                    │
                    │ gcloud run deploy (new image)
                    ▼
  Revision gg-cms-backend-00043 (v1.4.0) ── 100% traffic immediately
                                              (00042 still exists, but
                                               gets ZERO traffic —
                                               no gradual verification)
```

### Splitting Traffic Across Revisions for a Safe Rollout

Cloud Run keeps every revision available and lets you split traffic between them by percentage — deploy the new revision WITHOUT sending it traffic, then shift gradually while watching error rates:

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Deploy the new revision but keep 100% of traffic on the current one
gcloud run deploy gg-cms-backend \
  --image gcr.io/ggcms-free-tier-vivek/gg-cms-backend:v1.4.0 \
  --region us-central1 \
  --no-traffic \
  --tag canary

# 2. Send 5% of live traffic to the new revision, 95% stays on the stable one
gcloud run services update-traffic gg-cms-backend \
  --region us-central1 \
  --to-revisions gg-cms-backend-00043=5,gg-cms-backend-00042=95

# 3. Once error rates and latency look healthy, shift the rest
gcloud run services update-traffic gg-cms-backend \
  --region us-central1 \
  --to-latest
```

```text
  Gradual traffic shift across two live revisions:
  ─────────────────────────────────────────────────────
  gg-cms-backend-00042 (v1.3.0, stable) ──► 95% of requests
  gg-cms-backend-00043 (v1.4.0, canary) ──►  5% of requests
                                              (also reachable directly
                                               via its --tag canary URL
                                               for targeted smoke tests,
                                               independent of the split)

  If 00043 shows elevated 5xx rates:
  gcloud run services update-traffic gg-cms-backend \
    --to-revisions gg-cms-backend-00042=100     ← instant rollback,
                                                    00042 never stopped running
```

💡 **Interactive Takeaway**: Because Cloud Run revisions are immutable and kept warm independently, "rollback" is just another `update-traffic` call pointing back at the previous revision — there's no redeploy, no rebuild, no waiting for a container to start. This is only possible because the old revision was never torn down in the first place.

---

## 5. Cold Starts: Why `--min-instances` Is a Cost/Latency Tradeoff, Not a Free Fix

Section 2's `--min-instances 1` eliminates cold starts for that one warm instance, but it isn't free: Cloud Run bills for the CPU and memory of every min-instance continuously, even when it's serving zero requests — unlike the scale-to-zero instances above it, which cost nothing while idle.

```text
  min-instances=0 (default, cheapest):           min-instances=1:
  ─────────────────────────────────────          ─────────────────────────────────
  Idle: $0/hour, 0 instances running              Idle: billed continuously for
                                                    1 instance's CPU + memory
  First request after idle period:                First request after idle period:
    Cloud Run pulls image, starts container,        Already-warm instance handles
    initializes app ──► 500ms-3s+ COLD START         it ──► no cold start latency
    latency added to that one unlucky request

  Best for: background jobs, internal tools,      Best for: user-facing production
  low-traffic endpoints where occasional           APIs where p99 latency matters
  latency spikes are acceptable                    and traffic never fully stops
```

A middle ground worth knowing: `--min-instances` can be set per-revision and combined with Cloud Scheduler to warm up capacity ahead of a known traffic pattern (e.g. scale up before a daily batch job's dependent API calls) rather than paying for an always-warm instance around the clock.

---

## 6. Concurrency: One Setting That Changes Both Cost and Isolation

`--concurrency` (default 80) controls how many simultaneous requests a single container instance handles before Cloud Run starts a new one. It's easy to leave at the default without realizing it directly trades off cost against blast radius:

```text
  --concurrency=80 (default):                    --concurrency=1:
  ─────────────────────────────────────          ─────────────────────────────────
  1 instance handles up to 80 requests            1 instance handles exactly 1
  at once ──► fewer instances needed for           request at a time ──► an instance
  the same load ──► lower cost                     crash or memory leak affects
                                                     only ONE in-flight request
  Risk: a shared resource (in-memory cache,        Cost: far more instances needed
  a global mutex, a connection pool sized for      for the same load — appropriate
  1 request) can be silently corrupted by          mainly for CPU-heavy, non-thread-
  concurrent access if the app wasn't written       -safe legacy workloads that
  to be safely concurrent                           can't be made concurrency-safe
```

For a stateless Go HTTP service using per-request context (the pattern used throughout this guide's own codebase), the default of 80 is almost always correct — dropping it to 1 only makes sense when the application genuinely cannot handle concurrent requests safely, and that's usually worth fixing in the code rather than working around at the infrastructure layer.

---

## 7. Key Deployment Principles

1. **Keep Min-Instances = 1 for Production APIs, and Know What It Costs**: Prevents cold-start delays on critical customer requests, but bills continuously for that warm instance — apply it deliberately, not as a blanket default for every service.
2. **Inject Credentials via Secret Manager**: Never hardcode database URIs or JWT secrets in Dockerfiles or plain environment variables.
3. **Configure `--vpc-egress private-ranges-only`**: Ensures external outbound internet traffic bypasses VPC fees while keeping internal RFC 1918 IP database traffic encrypted inside the internal Google network.
4. **Deploy with `--no-traffic` and Shift Gradually**: Cloud Run's immutable, independently-warm revisions make percentage-based traffic splitting and instant rollback possible — a straight `gcloud run deploy` skips that safety net entirely.
5. **Tune `--concurrency` Deliberately**: The default of 80 minimizes cost for stateless, concurrency-safe services; only lower it when the application has a genuine shared-state hazard that can't be fixed in code.
