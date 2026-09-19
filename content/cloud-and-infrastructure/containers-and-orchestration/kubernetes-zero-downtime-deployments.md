---
title: "Kubernetes Zero-Downtime Deployments: RollingUpdate, Probes, & PDBs"
description: "A production guide to achieving true zero-downtime updates in Kubernetes using RollingUpdate strategies, readiness/liveness probes, preStop lifecycle hooks, and PodDisruptionBudgets."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "GUIDE"
tags:
  - "docker"
  - "kubernetes"
---

# Kubernetes Zero-Downtime Deployments: RollingUpdate, Probes, & PDBs

Deploying application updates in Kubernetes without dropping active HTTP connections or returning `502 Bad Gateway` errors requires careful orchestration between the Kubernetes API server, kube-proxy, readiness probes, and container lifecycle hooks.

In this guide, we configure production-grade Kubernetes manifests enforcing zero-downtime **RollingUpdates**, **PodDisruptionBudgets (PDB)**, and **preStop hooks**.

---

## 1. Zero-Downtime RollingUpdate Architecture

```text
========================================================================================================
                                      ROLLING UPDATE SEQUENCE
========================================================================================================
 ┌──────────────┐      ┌─────────────────────────┐      ┌─────────────────────────┐
 │ New Pod      │ ───► │ Container Startup &     │ ───► │ Readiness Probe Passes  │
 │ Scheduled    │      │ Initialization          │      │ (Added to EndpointSlice)│
 └──────────────┘      └─────────────────────────┘      └────────────┬────────────┘
                                                                     │
                                                                     ▼
 ┌──────────────┐      ┌─────────────────────────┐      ┌─────────────────────────┐
 │ Old Pod      │ ◄─── │ Terminating Status      │ ◄─── │ Removed from Service    │
 │ Destroyed    │      │ Executes preStop Hook   │      │ Endpoint Routing        │
 └──────────────┘      └─────────────────────────┘      └─────────────────────────┘
```

---

## 2. Complete Zero-Downtime Deployment Manifest (`deployment.yaml`)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gg-cms-api
  namespace: production
  labels:
    app.kubernetes.io/name: gg-cms-api
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 25%        # Create up to 1 extra pod during deployment
      maxUnavailable: 0    # NEVER allow available pods to drop below replica target
  selector:
    matchLabels:
      app: gg-cms-api
  template:
    metadata:
      labels:
        app: gg-cms-api
    spec:
      containers:
      - name: api-server
        image: gcr.io/ggcms-free-tier-vivek/gg-cms-backend:v1.4.0
        ports:
        - containerPort: 8080
        lifecycle:
          preStop:
            exec:
              # Give kube-proxy 10 seconds to drain endpoint rules before sending SIGTERM
              command: ["/bin/sh", "-c", "sleep 10"]
        readinessProbe:
          httpGet:
            path: /healthz/ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
          successThreshold: 1
          failureThreshold: 2
        livenessProbe:
          httpGet:
            path: /healthz/live
            port: 8080
          initialDelaySeconds: 15
          periodSeconds: 10
        resources:
          requests:
            cpu: "250m"
            memory: "256Mi"
          limits:
            cpu: "1000m"
            memory: "512Mi"
```

---

## 3. PodDisruptionBudget (`pdb.yaml`)

A **PodDisruptionBudget (PDB)** prevents voluntary cluster maintenance operations (such as node upgrades or cluster autoscaler node drains) from causing outages.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: gg-cms-api-pdb
  namespace: production
spec:
  minAvailable: 75%
  selector:
    matchLabels:
      app: gg-cms-api
```

---

## 4. Key Takeaways

1. **Set `maxUnavailable: 0`**: Guarantees existing pods are never terminated before new replacement pods are completely healthy.
2. **Always Use `preStop` Sleep Hooks**: Prevents dropped HTTP requests while ingress controllers and kube-proxy update iptables/IPVS routing tables.
3. **Separate Readiness from Liveness**: `readinessProbe` controls traffic routing; `livenessProbe` triggers container restarts.
