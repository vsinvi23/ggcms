# Kubernetes RBAC: Hardening Cluster Roles, Roles, and Service Account Tokens

## The Problem: Over-Privileged Service Accounts
Role-Based Access Control (RBAC) in Kubernetes dictates who can do what, and to which resources. The most critical, yet frequently mismanaged, aspect of RBAC involves machine identities: **Service Accounts (SA)**.

By default, Kubernetes automatically provisions a `default` Service Account in every namespace and automatically mounts its JWT token into every Pod spun up in that namespace. If cluster administrators bind sweeping privileges (like `cluster-admin`) to this `default` account, or if developers explicitly request elevated permissions without understanding the scope, any pod compromise instantly becomes a full cluster compromise. An attacker who pops a shell in a vulnerable web app simply reads `/var/run/secrets/kubernetes.io/serviceaccount/token` and owns the API server.

## The Architecture: RBAC Primitives
Kubernetes RBAC separates the *identity*, the *permissions*, and the *binding* connecting them.

```text
[ Identity ]         [ Binding ]                 [ Permissions ]
User, Group, or      RoleBinding                 Role
ServiceAccount   -- (Namespaced context) ----> (Namespaced resources)
      |                  |                           |
      v                  v                           v
ServiceAccount   -- ClusterRoleBinding ----> ClusterRole
                   (Cluster-wide context)      (Cluster-wide resources)
```

- **Role/ClusterRole:** "What can be done?" (Verbs: get, list, create, delete)
- **RoleBinding/ClusterRoleBinding:** "Who can do it?" (Subjects: User, SA)

## Implementation: The Principle of Least Privilege

### 1. Disabling Automounting of Service Account Tokens
The absolute first step in hardening is ensuring that pods do not receive API tokens unless they explicitly need to talk to the Kubernetes API. The `default` Service Account should be crippled.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: default
  namespace: my-app
# Stop Kubernetes from injecting the token into every pod
automountServiceAccountToken: false
```

Alternatively, you can enforce this at the Pod Spec level:
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: static-web
spec:
  automountServiceAccountToken: false
  containers:
  - name: web
    image: nginx
```

### 2. Creating Dedicated Service Accounts
If a pod *does* need to interact with the API (e.g., a Prometheus scraper needing to list endpoints, or an operator managing Custom Resources), never use the `default` SA. Create a dedicated one.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: prometheus-scraper
  namespace: monitoring
```

### 3. Crafting Granular Roles
Permissions should be as narrow as possible. Avoid using the `*` wildcard for verbs or resources. 

**Anti-Pattern:**
```yaml
rules:
- apiGroups: ["*"]
  resources: ["*"]
  verbs: ["*"]
```

**Best Practice:**
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: monitoring
rules:
- apiGroups: [""] # Core API group
  resources: ["pods", "endpoints", "services"]
  verbs: ["get", "list", "watch"] # Read-only verbs
```

### 4. Binding the Role to the Service Account
Use a `RoleBinding` to constrain the permissions to a specific namespace. Only use `ClusterRoleBinding` if the service account genuinely requires cluster-wide visibility (like a cluster-level monitoring agent or a CNI plugin).

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods-binding
  namespace: monitoring
subjects:
- kind: ServiceAccount
  name: prometheus-scraper
  namespace: monitoring
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

## Auditing and Escalation Risks
When crafting RBAC rules, beware of privilege escalation vectors. A Service Account with the ability to `create` Pods effectively has root access, because it can create a privileged pod that mounts the underlying Node's root filesystem. 

Similarly, granting `escalate`, `bind`, or `impersonate` verbs can allow an entity to assume permissions greater than its own.

## Conclusion
Hardening Kubernetes RBAC requires treating the API server as a hostile environment. By disabling default token mounts, creating single-purpose Service Accounts, avoiding wildcards in Roles, and strictly limiting cluster-wide bindings, you drastically reduce the blast radius of compromised workloads and protect the control plane from internal hijacking.
