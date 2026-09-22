---
title: "Kubernetes RBAC: Hardening Roles, Bindings, and Service Account Tokens"
description: "How Kubernetes RBAC's Subject/Role/Binding model works, why auto-mounted default service account tokens are a top lateral-movement vector, and how to lock workloads down with least-privilege Roles and short-lived projected tokens."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "GUIDE"
tags:
  - "rbac"
  - "service-account"
  - "least-privilege"
  - "kubernetes-security"
  - "projected-tokens"
  - "clusterrole"
---

# Kubernetes RBAC: Hardening Roles, Bindings, and Service Account Tokens

## The Problem: A Free Credential in Every Pod

Every Kubernetes pod is, by default, provisioned with a ServiceAccount token automatically mounted at `/var/run/secrets/kubernetes.io/serviceaccount/token`. If the namespace's `default` ServiceAccount (or whatever ServiceAccount the pod runs as) is bound — directly or transitively through a `ClusterRole` — to broad permissions, that mounted token becomes a live credential handed to any attacker who achieves remote code execution inside the pod.

```text
Compromised pod
  |
  +--> reads /var/run/secrets/kubernetes.io/serviceaccount/token
  |
  +--> attacker uses the token from outside the cluster:
        curl -H "Authorization: Bearer <token>" https://<api-server>/api/v1/secrets
```

If the bound Role or ClusterRole permits reading `secrets`, or any mutating verb (`create`, `patch`, `delete`), that single leaked token is enough to read every credential in the namespace, deploy malicious workloads, or destroy resources — no additional exploit required.

## The Model: Subjects, Roles, and Bindings

RBAC has three moving parts:

- **Subject** — who is asking: a User, a Group, or (for workloads) a **ServiceAccount**.
- **Role / ClusterRole** — what's allowed: a list of `(apiGroups, resources, verbs)` rules. A `Role` is scoped to one namespace; a `ClusterRole` is cluster-wide (or reusable, see below).
- **RoleBinding / ClusterRoleBinding** — the connection between a Subject and a Role.

```text
+-------------------+      +-------------------+      +-------------------+
|     Identity      |      |      Binding       |      |    Permissions    |
+-------------------+      +-------------------+      +-------------------+
| ServiceAccount     +----->  RoleBinding        +----->  Role (namespace  |
| (app-sa)           |      | (app-bind)         |      |  scoped: get/    |
|                    |      |                    |      |  list/watch)     |
+---------+----------+      +----------+---------+      +---------+---------+
          |                            ^                            ^
          |                  +---------+---------+        +---------+---------+
          +----------------->+ ClusterRoleBinding |------->+ ClusterRole       |
                             | (cluster-wide)      |        | (cluster-wide)    |
                             +---------------------+        +-------------------+
```

Critically, **a `ClusterRole` referenced by a namespace-scoped `RoleBinding` is constrained to that namespace** — this lets you define a reusable permission set once as a `ClusterRole` and grant it narrowly per-namespace via ordinary `RoleBinding`s, without ever needing a `ClusterRoleBinding`.

## Step 1: Disable Auto-Mounted Tokens by Default

Most pods — a stock nginx server, a Redis instance — never call the Kubernetes API at all and don't need a token mounted. Disable auto-mounting on the `default` ServiceAccount of every namespace so this is opt-in, not opt-out:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: default
  namespace: production
automountServiceAccountToken: false
```

Any new pod in `production` that doesn't explicitly reference a different ServiceAccount now gets no API token at all, closing off the most common leak vector by default.

## Step 2: Create a Dedicated, Narrowly-Scoped Role Per Workload

When a workload genuinely needs API access — say, a Prometheus scraper that needs to list pods — create a Role that grants exactly the verbs and resources it needs, nothing more:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: production
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "watch", "list"]
- apiGroups: ["apps"]
  resources: ["deployments/status"]
  verbs: ["get"]
```

Never write the wildcard anti-pattern below, even "temporarily" — it grants every verb on every resource in every API group, which is functionally equivalent to `cluster-admin` scoped to that namespace:

```yaml
# NEVER DO THIS
rules:
- apiGroups: ["*"]
  resources: ["*"]
  verbs: ["*"]
```

## Step 3: Bind and Assign

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: prometheus-scraper-sa
  namespace: production
automountServiceAccountToken: true   # explicitly opted in
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods-binding
  namespace: production
subjects:
- kind: ServiceAccount
  name: prometheus-scraper-sa
  namespace: production
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus-scraper
  namespace: production
spec:
  template:
    spec:
      serviceAccountName: prometheus-scraper-sa
      containers:
      - name: scraper
        image: prom/prometheus:v2.45.0
```

Only this specific ServiceAccount, bound to this specific Role, gets the token — every other pod in the namespace still gets nothing, because the namespace's `default` ServiceAccount has auto-mounting disabled.

## Step 4: Go Further — Short-Lived Projected Tokens

Even an explicitly-mounted static ServiceAccount token is long-lived and audience-unbound by default, meaning a leaked copy remains valid until the ServiceAccount is deleted or the token manually rotated. A `projected` volume mounts a **bound, time-limited, audience-scoped** token instead:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: billing-worker
  namespace: production
spec:
  replicas: 1
  selector:
    matchLabels:
      app: billing-worker
  template:
    metadata:
      labels:
        app: billing-worker
    spec:
      serviceAccountName: billing-engine
      containers:
      - name: worker
        image: billing-app:v1.2.0
        volumeMounts:
        - mountPath: /var/run/secrets/tokens
          name: sa-token
      volumes:
      - name: sa-token
        projected:
          sources:
          - serviceAccountToken:
              path: sa-token
              expirationSeconds: 3600   # expires in 1 hour
              audience: api-server
```

A token leaked from this pod is only useful for at most an hour and only against the declared `audience` — a materially smaller blast radius than a static, unbounded token.

## Auditing for Escalation Paths

Two RBAC verbs deserve special scrutiny during any audit: `escalate` and `bind` (and, separately, `impersonate`). A Role or ClusterRole granting any of these on `roles`/`clusterroles`/`rolebindings` lets its holder grant *themselves* additional permissions beyond what RBAC would otherwise allow them to create — effectively a built-in privilege-escalation primitive. Also flag any `secrets` read access carefully: a pod that can read arbitrary secrets can often pivot to a higher-privileged identity's credentials stored elsewhere in the cluster.

Tools like `kube-score` or `checkov` can flag overly broad bindings (wildcard rules, `cluster-admin` bound to workload ServiceAccounts, anonymous-user bindings) automatically as part of CI.

## Key Takeaways

- Disable `automountServiceAccountToken` on every namespace's `default` ServiceAccount; opt individual workloads back in only when they genuinely call the API.
- Prefer namespace-scoped `Role`/`RoleBinding` over `ClusterRole`/`ClusterRoleBinding` — even a `ClusterRole`'s permissions are namespace-confined when referenced from a `RoleBinding`.
- Never write `apiGroups: ["*"], resources: ["*"], verbs: ["*"]` — enumerate exactly what a workload needs.
- Use `projected` service account token volumes with a short `expirationSeconds` and a specific `audience` for workloads that do need API access, rather than the static, unbounded default token.
- Audit specifically for `escalate`, `bind`, and `impersonate` verbs and for any Role granting `secrets` access — these are the RBAC constructs most directly usable for privilege escalation.
