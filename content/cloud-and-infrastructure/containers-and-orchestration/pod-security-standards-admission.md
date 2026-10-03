---
title: "Pod Security Standards and Admission: Enforcing Restricted Workloads Natively"
description: "Why PodSecurityPolicy was removed in Kubernetes v1.25, what replaced it, and how to roll out the Privileged, Baseline, and Restricted Pod Security Standards using namespace-level Pod Security Admission labels — including a safe warn/audit migration path."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "GUIDE"
tags:
  - "pod-security-standards"
  - "pod-security-admission"
  - "podsecuritypolicy"
  - "kubernetes-hardening"
  - "securitycontext"
  - "seccomp"
---

# Pod Security Standards and Admission: Enforcing Restricted Workloads Natively

## The Problem: Unhardened Pods as a Node Takeover Vector

Kubernetes pod specs are, by default, highly permissive. Left unhardened, a pod can mount the host's root filesystem (`hostPath`), run as UID 0, share the host's network namespace (`hostNetwork: true`), or request powerful Linux capabilities like `CAP_SYS_ADMIN`. Any one of these turns a compromised application container into a launchpad for compromising the entire node — and from there, potentially the cluster.

```text
[ Attacker compromises application container ]
                |  (uses hostPath mount, or CAP_SYS_ADMIN, or hostNetwork)
                v
[ Escalates to worker-node root ]
                |  (reads kubelet credentials, local disk, neighboring secrets)
                v
[ Full cluster compromise ]
```

Kubernetes used to address this with **PodSecurityPolicy (PSP)** — but PSP was notoriously hard to reason about (its authorization model, via RBAC bindings to policy objects, confused most operators), had no dry-run mode, and was deprecated in v1.21 and **fully removed in v1.25**. Any cluster still relying on PSP after that point has zero enforcement unless it adopted a replacement.

## The Solution: Pod Security Standards + Pod Security Admission

Kubernetes replaced PSP with two complementary, built-in pieces:

```text
+---------------------------------------------------------+
| 1. Pod Security Standards (PSS) — three profiles         |
|    - Privileged:  no restrictions (system-level pods)     |
|    - Baseline:    blocks known privilege-escalation paths |
|    - Restricted:  hardened, container-escape resistant    |
+---------------------------------------------------------+
                           |
                           v   evaluated by
+---------------------------------------------------------+
| 2. Pod Security Admission (PSA) — three modes             |
|    - enforce: rejects violating pods outright             |
|    - warn:    admits the pod, returns a client warning     |
|    - audit:   admits the pod, records the violation        |
+---------------------------------------------------------+
```

- **Privileged** — effectively unrestricted; reserved for system-level infrastructure (CNI plugins, storage drivers) that genuinely needs raw node access.
- **Baseline** — the sane default: blocks the well-known privilege-escalation vectors (host namespaces, host ports, arbitrary capabilities, `hostPath` volumes) while otherwise leaving typical pod configs alone.
- **Restricted** — the hardened profile for multi-tenant application workloads: forces non-root execution, drops all Linux capabilities except `NET_BIND_SERVICE`, and requires seccomp confinement.

Unlike PSP, PSA is configured with **plain namespace labels** — no RBAC bindings, no separate policy objects to author from scratch.

## The Admission Lifecycle

A pod creation request passes through several phases before it's ever persisted:

```text
   [ API request: create Pod ]
              |
              v
   [ Mutating webhooks ]        (e.g., sidecar injection)
              |
              v
   [ Schema validation ]
              |
              v
   [ Validating webhooks ]      (PSA checks namespace labels against Pod spec)
              |
      +-------+--------+
      v                v
  [ ALLOW ]        [ REJECT ]
      |                |
      v                v
 [ Saved to etcd ]  [ API server returns error to caller ]
```

PSA runs at the validating phase, comparing the incoming pod's `securityContext` against whichever profile the target namespace declares.

## Enforcing Restricted on a Namespace

PSA reads three label pairs per profile mode — `enforce`, `warn`, `audit` — each with a matching `-version` pin so the enforced ruleset doesn't silently shift when the cluster is upgraded:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: billing-prod
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: "v1.30"
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/audit-version: "v1.30"
    pod-security.kubernetes.io/warn: restricted
    pod-security.kubernetes.io/warn-version: "v1.30"
```

## Writing a Pod That Actually Passes Restricted

Most default images fail `restricted` immediately — a stock `nginx` image runs as root, for instance. A compliant pod has to explicitly lock down both the pod-level and container-level `securityContext`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secured-api
  namespace: billing-prod
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 10001
    runAsGroup: 10001
    fsGroup: 10001
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: web
    image: nginxinc/nginx-unprivileged:latest   # must not require root
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      runAsNonRoot: true
      capabilities:
        drop:
        - ALL
    ports:
    - containerPort: 8080
```

Each field closes a specific escalation path:

- **`runAsNonRoot: true`** — the kubelet verifies at runtime that the container's actual UID is not 0, blocking exploits that rely on root-owned processes inside the container.
- **`seccompProfile.type: RuntimeDefault`** — restricts which syscalls the container can invoke to the runtime's (containerd/CRI-O) vetted default set.
- **`allowPrivilegeEscalation: false`** — prevents a child process from acquiring more privileges than its parent, neutralizing SUID-bit binaries.
- **`capabilities.drop: ["ALL"]`** — removes every default Linux capability; a compromised process here cannot touch network routing tables, mount namespaces, or load kernel modules.

If this pod is submitted to a namespace enforcing `restricted` and fails any of these checks, the API server rejects it outright — the deployment's controller surfaces the reason directly in its event log:

```text
Error creating: pods "secured-api-xxxx" is forbidden: violates PodSecurity "restricted":
non-root user enforcement violation, read-only root filesystem violation.
```

## Rolling Out Without an Outage: warn/audit First

Never flip `enforce: restricted` directly onto a namespace with running workloads. Instead:

1. Apply `warn: restricted` and `audit: restricted` labels only — pods continue running, but any violation is surfaced to the caller's CLI output and recorded in the Kubernetes audit log.
2. Let teams review the accumulated warnings/audit entries over a soak period and patch their `securityContext`s.
3. Once audits show no remaining violations, add `enforce: restricted` for real enforcement.

For workloads that genuinely require elevated access (an ingress controller needing host ports, or a storage DaemonSet needing host mounts), place them in a dedicated namespace labeled `pod-security.kubernetes.io/enforce: privileged` rather than weakening the standard for everyone else.

## When PSA Isn't Enough

Native PSA only evaluates the fixed PSS profiles — it cannot express custom rules like "deny images from Docker Hub" or "require a specific label on every pod." For that level of custom governance, layer an external admission-webhook policy engine such as **OPA Gatekeeper** or **Kyverno** on top of PSA, rather than trying to force PSA's fixed profiles to do something they were never designed for.

## Key Takeaways

- PodSecurityPolicy was deprecated in v1.21 and fully removed in v1.25 — any cluster on a newer version relying on PSP alone has no pod-hardening enforcement at all.
- Pod Security Admission enforces one of three built-in profiles (Privileged, Baseline, Restricted) via plain namespace labels, in one of three modes (enforce, warn, audit) — no RBAC bindings required.
- Always stage a new policy with `warn`/`audit` first, review real violations against running workloads, and only switch to `enforce` once the audit is clean.
- Restricted requires non-root execution, all capabilities dropped, `allowPrivilegeEscalation: false`, and a seccomp profile — most stock images need modification (or an unprivileged variant) to pass it.
- For governance rules beyond the fixed PSS profiles, add OPA Gatekeeper or Kyverno alongside PSA rather than trying to stretch PSA past its design.
