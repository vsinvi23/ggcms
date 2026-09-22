# Kubernetes RBAC: Hardening Cluster Roles, Roles, and Service Account Tokens

### The Problem: Over-Privileged Pods and Token Theft

In Kubernetes, every pod is provisioned with a default ServiceAccount token mounted at `/var/run/secrets/kubernetes.io/serviceaccount/token`. By default, this token might be bound to a highly permissive role (often observed in legacy configurations or poorly vetted Helm charts), granting the pod sweeping read/write access to the cluster's API. If an attacker achieves Remote Code Execution (RCE) inside a pod, they can immediately exfiltrate this token and pivot, querying secrets, launching malicious daemonsets, or destroying resources.

### The Solution: Principle of Least Privilege and Explicit Mounts

Securing internal cluster authorization requires strict adherence to Role-Based Access Control (RBAC) and explicit token management:
1.  **Disable Auto-mounting:** Prevent tokens from being mounted by default.
2.  **Namespace Scoping:** Prefer `Roles` (namespace-scoped) over `ClusterRoles` (cluster-scoped).
3.  **Granular Verbs:** Restrict API actions (verbs) and targets (resources).

### Architecture: RBAC Entity Mapping

The RBAC system maps identities to permissions via bindings.

```text
+-------------------+        +-------------------+        +-------------------+
|     Identity      |        |      Binding      |        |    Permissions    |
+-------------------+        +-------------------+        +-------------------+
| ServiceAccount    |        | RoleBinding       |        | Role (NS Scoped)  |
| (e.g., app-sa)    +------->+ (e.g., app-bind)  +------->+ (e.g., app-role)  |
|                   |        |                   |        | [get, list, watch]|
+-------------------+        +-------------------+        +-------------------+
          |                            ^                            ^
          |                            |                            |
          |                  +---------+---------+        +---------+---------+
          |                  | ClusterRoleBinding|        | ClusterRole       |
          +----------------->+ (Global Scope)    +------->+ (Global Scope)    |
                             +-------------------+        +-------------------+
```

### Implementation: Secure RBAC Provisioning

#### 1. Preventing Default Token Leaks

Ensure that default ServiceAccounts in all namespaces (and any custom ServiceAccounts that do not explicitly require API access) have auto-mounting disabled.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: frontend-sa
  namespace: production
# CRITICAL: Prevent the token from being injected into the pod
automountServiceAccountToken: false
```

#### 2. Creating a Least-Privilege Role

When a pod *does* need to interact with the Kubernetes API (e.g., a Prometheus scraper needing to list pods), create a tightly scoped `Role`. Avoid `ClusterRole` unless absolutely necessary (e.g., cross-namespace operators).

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: production
rules:
- apiGroups: [""] # "" indicates the core API group
  resources: ["pods"]
  verbs: ["get", "watch", "list"] # Read-only operations
- apiGroups: ["apps"]
  resources: ["deployments/status"]
  verbs: ["get"]
```

*Anti-pattern to avoid:*
```yaml
# NEVER DO THIS
rules:
- apiGroups: ["*"]
  resources: ["*"]
  verbs: ["*"]
```

#### 3. Binding the Role to the ServiceAccount

Link the `ServiceAccount` to the `Role` via a `RoleBinding`.

```yaml
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
```

#### 4. Configuring the Pod to Use the Service Account

Finally, instruct the Pod/Deployment to run under the specific identity. If `automountServiceAccountToken: false` is set on the `ServiceAccount`, but the pod *needs* it, you can override it at the pod level (or vice-versa).

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus-scraper
spec:
  template:
    spec:
      serviceAccountName: prometheus-scraper-sa
      # Since this specific pod needs the API, we explicitly mount it.
      # Other pods using the default SA won't get tokens.
      automountServiceAccountToken: true
      containers:
      - name: scraper
        image: prom/prometheus:v2.45.0
```

### Operational Considerations

*   **Secrets Access:** Be exceptionally cautious when granting `get` or `list` access to the `secrets` resource. If a pod can read secrets, it can potentially elevate its own privileges by extracting higher-privileged tokens or database credentials.
*   **Escalation Prevention:** RBAC in Kubernetes prevents a user from creating a Role with more privileges than they currently possess, preventing vertical privilege escalation.
*   **Auditing:** Regularly audit RBAC configurations using tools like `kube-score`, `checkov`, or specialized RBAC visualizers to detect overly permissive bindings (e.g., `system:anonymous` bindings).
