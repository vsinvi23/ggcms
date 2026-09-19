---
title: "DevOps, Kubernetes & Cloud Infrastructure Engineering Interview Track"
description: "SME evaluation on zero-downtime deployment strategies, Kubernetes operator patterns, Terraform state locks, and observability topology."
categorySlug: "containers-orchestration"
articleType: "INTERVIEW_PREP"
level: "Staff"
durationMinutes: 480
---

# DevOps, Kubernetes & Cloud Infrastructure Engineering Interview Track

Welcome to the DevOps, Kubernetes & Cloud Infrastructure evaluation track. This module tests your mastery of container orchestration, GitOps automation, infrastructure as code, and cloud reliability engineering.

---

### Question 1: How do you guarantee zero-downtime rolling updates in Kubernetes with Pod Readiness Probes, PreStop Hooks, and Graceful Termination?

Think Prompt: Analyze `maxSurge`, `maxUnavailable`, SIGTERM propagation, `preStop` sleep delays, and kube-proxy endpoint propagation delay.

Model Answer / Explanation:
1. Pod Termination Mechanics: When a pod is terminated during a rolling update, Kubernetes simultaneously sends a `SIGTERM` signal to container processes AND removes the pod IP from EndpointSlice objects. However, `kube-proxy` and ingress controllers take up to 10-15 seconds to update iptables/IPVS rules across cluster nodes.
2. PreStop Lifecycle Hook: Add a `preStop` HTTP or exec hook (`sleep 15`) to delay SIGTERM processing inside the application container, ensuring in-flight requests are served while ingress proxies stop routing new traffic.
3. Graceful Application Shutdown: Application processes catch `SIGTERM`, stop accepting new connections, finish active HTTP requests within a configurable timeout (e.g., 30s), and shut down cleanly before `terminationGracePeriodSeconds` (45s) expires.
4. Deployment Configuration: Tune rolling update strategy parameters:

```yaml
spec:
  replicas: 10
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 25%
      maxUnavailable: 0
  template:
    spec:
      terminationGracePeriodSeconds: 45
      containers:
      - name: app
        lifecycle:
          preStop:
            exec:
              command: ["/bin/sh", "-c", "sleep 15"]
        readinessProbe:
          httpGet:
            path: /healthz/ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
```

Common Mistakes:
- Setting `maxUnavailable: 50%` on low replica deployments, causing capacity degradation during rollouts
- Immediately terminating container processes on SIGTERM without waiting for service endpoint propagation
- Aggressive readiness probes that mark initializing pods dead during temporary CPU spikes

Related Concepts: Kubernetes Rolling Update, PreStop Hooks, Readiness Probes, Kube-Proxy, EndpointSlices
Related Courses: kubernetes-zero-downtime-deployments, terraform-modular-architecture, gcp-cloud-run-deployment-guide

---

### Question 2: How do you manage Terraform state isolation, remote backend locks, and drift detection in multi-environment GitOps pipelines?

Think Prompt: Evaluate S3/GCS remote backends, DynamoDB/GCP state locking, workspace vs directory isolation, and Atlantis/Terraform Cloud automated plan checks.

Model Answer / Explanation:
1. Directory & State Isolation: Maintain separate Terraform root directories per environment (`environments/prod/`, `environments/staging/`). Avoid workspaces for environment separation due to shared backend state risk.
2. Remote State & Locking: Configure Cloud Storage (GCS) or AWS S3 backends with native state locking (`lock_table` in DynamoDB or GCS object generation locks) to prevent concurrent execution overwrites.
3. GitOps PR Validation: Integrate Atlantis or GitHub Actions with Terraform Cloud. On PR creation, automatically execute `terraform plan` and comment the output diff on the PR for peer review.
4. Automated Drift Detection: Run a daily scheduled pipeline (`terraform plan -detailed-exitcode`) that checks live cloud infrastructure against stored state files and fires PagerDuty/Slack alerts on drift.

Common Mistakes:
- Storing Terraform state files in local disk or committing `.tfstate` to Git repositories
- Mixing production and staging resource definitions within a single monolithic state file
- Applying manual `gcloud` or `aws` CLI changes directly in cloud consoles, bypassing Terraform state

Related Concepts: Terraform Remote Backend, State Locking, GitOps, Infrastructure Drift, Atlantis
Related Courses: terraform-modular-architecture, gcp-cloud-run-deployment-guide

---

### Question 3: How do you architect high-availability Kubernetes ingress routing, TLS termination, and ingress controller autoscaling?

Think Prompt: Evaluate NGINX Ingress Controller vs Envoy / Gateway API, cert-manager ACME automatic renewal, ExternalDNS, and HPA based on ingress request latency.

Model Answer / Explanation:
1. Ingress Architecture: Deploy NGINX or Envoy Gateway API controllers as a `DaemonSet` or `Deployment` across multiple Availability Zones with Pod Anti-Affinity rules.
2. Automated TLS Management: Deploy `cert-manager` with ACME Let's Encrypt / HashiCorp Vault ClusterIssuer objects. cert-manager automatically completes HTTP-01 or DNS-01 challenges and stores TLS X.509 certificates in Kubernetes TLS secrets.
3. ExternalDNS Synchronization: Deploy `ExternalDNS` to watch Ingress/Gateway objects and dynamically update AWS Route53 / GCP Cloud DNS A-records without manual DNS configuration.
4. Autoscaling: Configure Kubernetes Horizontal Pod Autoscaler (HPA) targeting Custom Metrics (e.g. `nginx_ingress_controller_requests_per_second` or p99 latency) via Prometheus Adapter.

Common Mistakes:
- Running single-replica ingress controllers creating a single point of failure
- Manual X.509 certificate renewals leading to unexpected production downtime
- Hardcoding node IP addresses in DNS records instead of using Cloud Load Balancer IPs

Related Concepts: Gateway API, cert-manager, ExternalDNS, Envoy, Horizontal Pod Autoscaler
Related Courses: kubernetes-zero-downtime-deployments, tls-x509-certificate-management

---

### Question 4: How do you design an enterprise-grade Prometheus & Grafana telemetry infrastructure for multi-cluster Kubernetes monitoring?

Think Prompt: Evaluate Prometheus Operator, Thanos / Cortex long-term storage, ServiceMonitor CRDs, and metric cardinality control.

Model Answer / Explanation:
1. Cluster Monitoring Deployment: Deploy `kube-prometheus-stack` using Prometheus Operator. Define `ServiceMonitor` and `PodMonitor` Custom Resource Definitions (CRDs) to declaratively declare scrape endpoints.
2. Long-Term Storage & Deduplication: Deploy Thanos Sidecar containers alongside Prometheus instances. Thanos ships block metrics to Google Cloud Storage (GCS) or S3 object stores and deduplicates metrics across HA Prometheus pairs.
3. Cardinality Control: Enforce strict metric relabeling rules in Prometheus configs (`metric_relabel_configs`) to drop high-cardinality labels (e.g., `user_id`, `email`, raw request URIs with dynamic IDs).
4. Alerting Rules: Write Prometheus Alertmanager rules focusing on Golden Signals (Latency p99 > 500ms, HTTP 5xx Error Rate > 1%, Container OOMKilled count > 0).

Common Mistakes:
- Including unbounded UUIDs or user IDs as Prometheus metric labels, exhausting Prometheus RAM
- Storing Prometheus TSDB data on ephemeral pod disks without object storage shipping
- Alerting on transient non-actionable CPU spikes instead of customer-impacting latency or error rates

Related Concepts: Prometheus Operator, Thanos, ServiceMonitor, Metric Cardinality, Alertmanager
Related Courses: kubernetes-zero-downtime-deployments, gcp-cloud-run-deployment-guide
