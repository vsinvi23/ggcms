# Hardening Kubernetes RBAC: Securing Roles, Bindings, and Service Account Tokens

Kubernetes Role-Based Access Control (RBAC) is the primary line of defense inside a cluster. However, many deployments suffer from severe configuration drift: wildcards (`*`) are applied to API groups, cluster-wide permissions are given to localized microservices, and default ServiceAccount tokens are automatically mounted into pods. If a pod with an over-privileged ServiceAccount token is compromised, the attacker can leverage the mounted credentials to query the API server, mutate cluster state, or even escalate privileges to cluster-admin.

This article details the engineering practices required to audit, restrict, and harden RBAC configurations and ServiceAccount token handling.

---

## The ServiceAccount Token Leak Vector

When a pod is scheduled, Kubernetes traditionally mounts a static, long-lived ServiceAccount token at `/var/run/secrets/kubernetes.io/serviceaccount/token`. If this token is leaked via directory traversal or a compromised container, it can be used externally without expiry.

```
Compromised Pod
  │
  ├─► Reads Token: /var/run/secrets/kubernetes.io/serviceaccount/token
  │
  └─► Attacker uses Token via external CLI:
        curl -H "Authorization: Bearer <token>" https://<api-server-ip>/api/v1/secrets
```

If the associated Role or ClusterRole has access to secrets or mutating verbs (like `create` or `patch`), the entire cluster can be fully compromised.

---

## Least-Privilege RBAC Architecture

A secure RBAC model operates under strict resource isolation:

```
  ┌────────────────────────────────────────────────────────┐
  │ Namespace: production                                  │
  │                                                        │
  │  ┌──────────────┐      RoleBinding      ┌───────────┐  │
  │  │ Pod (No     │───────────────────────►│ Role:     │  │
  │  │ Auto-Token)  │                       │ ConfigMap │  │
  │  └──────────────┘                       │ Reader    │  │
  │         │                               └─────┬─────┘  │
  │         │ (Uses projected token)              │        │
  │         ▼                                     ▼        │
  │  ┌──────────────┐                       ┌───────────┐  │
  │  │ Projected    │                       │ Read-only │  │
  │  │ Token Volume │                       │ Verbs     │  │
  │  └──────────────┘                       └───────────┘  │
  └────────────────────────────────────────────────────────┘
```

---

## Secure RBAC and ServiceAccount Configuration

To secure your applications, you must disable automatic token mounting, restrict Role verbs, and utilize short-lived projected volumes.

### 1. Hardened ServiceAccount Definition
Configure your ServiceAccount to reject automatic token mounts by setting `automountServiceAccountToken` to `false`.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: billing-engine
  namespace: production
automountServiceAccountToken: false
```

### 2. Fine-Grained Role Definition
Never use wildcards (`*`). Explicitly declare the `apiGroups`, `resources`, and `verbs`. In this example, the role is restricted strictly to reading a specific ConfigMap named `billing-rates`.

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: billing-config-reader
  namespace: production
rules:
- apiGroups: [""]
  resources: ["configmaps"]
  resourceNames: ["billing-rates"]
  verbs: ["get", "watch"]
```

### 3. Namespace-Bounded RoleBinding
Bind the ServiceAccount to the Role within the same namespace boundary, ensuring the permissions do not leak horizontally.

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: bind-billing-reader
  namespace: production
subjects:
- kind: ServiceAccount
  name: billing-engine
  namespace: production
roleRef:
  kind: Role
  name: billing-config-reader
  apiGroup: rbac.authorization.k8s.io
```

### 4. Pod Deployment with Projected Service Account Tokens
If the application absolutely requires API communication, use a `projected` volume to mount a short-lived token. This token automatically expires and is bound directly to the pod's lifetime and target audience.

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
              expirationSeconds: 3600 # 1-hour lifetime
              audience: api-server
```

---

## Operational Hardening Checklist

1. **Audit Default ServiceAccounts:** The `default` ServiceAccount in every namespace has no roles bound by default, but its token is mounted automatically. Always verify that `automountServiceAccountToken` is disabled or explicitly patched to `false` for default accounts.
2. **Eliminate Escalation Paths:** Ensure no role contains the `escalate`, `bind`, or `impersonate` verbs over RBAC resources, as these allow users or pods to bypass security validation.
3. **Use Namespace-Scoped Roles:** Prefer `Role` and `RoleBinding` over `ClusterRole` and `ClusterRoleBinding` unless cluster-wide resources (like Nodes or Namespaces) must be queried.

By applying these measures, you restrict your cluster's attack surface and isolate workloads from compromising the control plane.
