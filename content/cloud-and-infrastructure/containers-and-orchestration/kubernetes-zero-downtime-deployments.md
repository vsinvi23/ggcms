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

## 4. The Scenario: Why `preStop` Actually Matters

### The Race Condition Between SIGTERM and iptables

When Kubernetes decides to terminate a pod, it does two things almost simultaneously: it sends `SIGTERM` to the container, AND it starts updating the Service's `EndpointSlice` to remove the pod from load-balancing. The problem is these two things are **not synchronized** — kube-proxy's iptables/IPVS rule propagation across every node in the cluster takes a non-zero amount of time, often 1-5 seconds. If the container terminates immediately on `SIGTERM`, some in-flight requests that were already routed to it — or new requests arriving at nodes that haven't updated their rules yet — will hit a connection refused or a `502 Bad Gateway`.

```text
  Without preStop hook (the race condition):
  ─────────────────────────────────────────
  t=0.0s   SIGTERM sent to container ────────► container exits almost immediately
  t=0.0s   EndpointSlice update begins
  t=0.0-3s kube-proxy propagates removal to ALL nodes  (still in progress!)
  t=1.5s   A request routed by a node that hasn't updated yet ──► 502 Bad Gateway
                                                                    (pod is already dead)

  With preStop hook (sleep 10):
  ─────────────────────────────────────────
  t=0.0s   Pod marked Terminating; EndpointSlice update begins
  t=0.0s   preStop hook runs: sleep 10  ────────► container KEEPS RUNNING, still
                                                    accepting in-flight requests
  t=0-3s   kube-proxy propagates removal to all nodes (completes well within 10s)
  t=10.0s  preStop hook completes ──► SIGTERM now sent ──► container exits cleanly
                                       (all nodes have already stopped routing to it)
```

💡 **Interactive Takeaway**: `sleep 10` in the `preStop` hook isn't an arbitrary delay — it's specifically sized to outlast the cluster's iptables/IPVS propagation window, so the pod keeps serving already-in-flight requests until every node has confirmed it's no longer a valid routing target.

---

## 5. RollingUpdate vs. Recreate: Choosing a Strategy

Kubernetes offers exactly two built-in `Deployment` strategies, and they make opposite tradeoffs:

| Strategy | Behavior | Downtime | When to use |
| :--- | :--- | :--- | :--- |
| **RollingUpdate** (this guide's default) | New pods created and verified healthy BEFORE old pods are terminated, in gradual batches controlled by `maxSurge`/`maxUnavailable` | Zero, if configured correctly (as in Section 2) | Stateless services that can run two versions side-by-side simultaneously — the overwhelming majority of HTTP APIs |
| **Recreate** | ALL old pods terminated first, THEN new pods created | Guaranteed downtime for the full rollout duration | Only when two versions can never coexist — e.g. a singleton worker holding an exclusive lock, or a schema migration that isn't backward-compatible with the old code |

```yaml
# Recreate strategy — deliberately accepts downtime because this
# consumer cannot run two versions against the same database schema
# simultaneously (the new version's migration is not backward-compatible)
spec:
  strategy:
    type: Recreate
```

Choosing `Recreate` is a rare, explicit tradeoff — it should never be the default, and using it usually signals a schema or state-compatibility problem that's worth fixing at the source rather than working around with downtime.

---

## 6. Service Routing During a Rollout

The `Service` object is what makes zero-downtime possible at all — it's the stable, unchanging target that Ingress and other pods talk to, while the actual pod IPs behind it churn continuously during a rollout:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: gg-cms-api
  namespace: production
spec:
  selector:
    app: gg-cms-api          # matches BOTH old and new ReplicaSet's pods —
                              # this is what makes the transition seamless
  ports:
  - port: 80
    targetPort: 8080
```

```text
  During the rollout, BOTH old and new pods match the Service's selector
  simultaneously — traffic is load-balanced across whichever pods are
  currently Ready, regardless of which ReplicaSet (old or new) they
  belong to:

  Service: gg-cms-api  (stable ClusterIP, never changes)
        │
        ├──► Pod (old ReplicaSet, v1.3.0) ── Ready ✓  ── still receiving traffic
        ├──► Pod (old ReplicaSet, v1.3.0) ── Terminating (preStop draining)
        ├──► Pod (new ReplicaSet, v1.4.0) ── Ready ✓  ── now receiving traffic
        └──► Pod (new ReplicaSet, v1.4.0) ── Not Ready (still starting up,
                                               readinessProbe hasn't passed)
                                               ── NOT added to EndpointSlice yet
```

An Ingress controller sitting in front of this `Service` never needs to know a rollout is happening at all — it always routes to the Service's stable ClusterIP, and the Service itself handles the underlying pod churn transparently.

---

## 7. Beyond RollingUpdate: Canary and Blue-Green

`RollingUpdate` mixes old and new versions together during the transition — acceptable for most changes, but risky for a change you want to validate with real traffic before committing fully. Two complementary patterns address that:

- **Canary deployment**: route a small percentage of traffic (e.g. 5%) to the new version while the rest continues hitting the old one, monitor error rates and latency, then progressively shift more traffic if it looks healthy. Typically implemented with a service mesh (Istio, Linkerd) or an Ingress controller's weighted routing, since vanilla `Deployment`/`Service` objects have no built-in concept of traffic percentage.
- **Blue-Green deployment**: run the full new version (\"green\") alongside the full old version (\"blue\") as two completely separate Deployments, then switch the Service's selector atomically from blue to green once green is fully validated. Rollback is instant — just flip the selector back — at the cost of running double the infrastructure during the transition.

```text
  RollingUpdate            Canary                    Blue-Green
  ────────────             ──────                    ───────────
  Gradual pod-by-pod       Gradual TRAFFIC-by-        Instant, all-or-nothing
  replacement, old and     traffic shift, with        cutover between two full,
  new mixed throughout     fine-grained % control     independently-running versions
```

💡 **Interactive Takeaway**: `RollingUpdate` with `maxUnavailable: 0` (this guide's core pattern) is the right default for routine deploys of stateless services. Reach for canary when you need graduated confidence in a risky change, and blue-green when you need instant, guaranteed rollback — both add operational complexity that isn't justified for every deploy.

---

## 8. Key Takeaways

1. **Set `maxUnavailable: 0`**: Guarantees existing pods are never terminated before new replacement pods are completely healthy.
2. **Always Use `preStop` Sleep Hooks**: Prevents dropped HTTP requests while ingress controllers and kube-proxy update iptables/IPVS routing tables — size the sleep to outlast your cluster's actual propagation window, not an arbitrary guess.
3. **Separate Readiness from Liveness**: `readinessProbe` controls traffic routing; `livenessProbe` triggers container restarts. Confusing the two can cause a slow-starting pod to be killed and restarted in a loop before it ever becomes ready.
4. **Reserve `Recreate` for Genuine Incompatibility**: Only use it when two versions truly cannot coexist — it's an explicit downtime tradeoff, never a default.
5. **The `Service` Selector Is What Makes This Work**: Because it matches both old and new pods during the transition, neither the Ingress controller nor calling services ever need to be aware a rollout is in progress.
6. **Escalate to Canary or Blue-Green for Riskier Changes**: `RollingUpdate` is the right default, but a change you want to validate incrementally or roll back instantly calls for a pattern with finer traffic control.
