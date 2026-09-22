# Kubernetes RBAC: Hardening Cluster Roles, Roles, and Service Account Tokens

### The Problem: Over-Privileged Workloads
Kubernetes manages authorization via Role-Based Access Control (RBAC). Historically, Kubernetes assigned a default ServiceAccount to every Pod, mounting its token into the container. If developers assign broad privileges (like `cluster-admin` or wildcard access to Secrets) to default accounts to "make things work," a single Server-Side Request Forgery (SSRF) vulnerability or Remote Code Execution (RCE) in an application can lead to complete cluster takeover. 

### The Solution: Principle of Least Privilege
Securing Kubernetes requires strict enforcement of the Principle of Least Privilege (PoLP). This means creating dedicated `ServiceAccounts` for specific workloads, writing granular `Roles` bound to exact namespaces and resource types, avoiding `ClusterRoles` when possible, and preventing the auto-mounting of tokens where they are not required.

### Architecture: RBAC Components

```text
 +------------------+        +------------------+        +------------------+
 |  ServiceAccount  | <----- |   RoleBinding    | -----> |       Role       |
 | (Identity/User)  |        | (The Connector)  |        | (Permissions)    |
 +------------------+        +------------------+        +------------------+
          |                                                       |
          v                                                       v
 +------------------+                                    +------------------+
 |       Pod        |                                    | Resources: pods  |
 | (Runs as the SA) |                                    | Verbs: get, list |
 +------------------+                                    +------------------+
```

### Defining Granular Roles
A `Role` grants access within a single namespace. A `ClusterRole` applies cluster-wide. Always prefer `Role` unless you are configuring cluster-level agents (like ingress controllers or logging daemonsets).

Never use wildcards `*` for verbs or resources unless absolutely necessary.

```yaml
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: data-processing
  name: configmap-reader
rules:
- apiGroups: [""] # "" indicates the core API group
  resources: ["configmaps"]
  verbs: ["get", "list", "watch"]
```

If a Pod only needs to read a specific Secret, limit the rule by `resourceNames`.

```yaml
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: data-processing
  name: specific-secret-reader
rules:
- apiGroups: [""]
  resources: ["secrets"]
  resourceNames: ["api-credentials"] # Restrict to a single secret
  verbs: ["get", "watch"]
```

### Binding the Role to a Dedicated ServiceAccount
Avoid using the `default` ServiceAccount. Create a purpose-built identity.

```yaml
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: data-worker-sa
  namespace: data-processing
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-configmap-binding
  namespace: data-processing
subjects:
- kind: ServiceAccount
  name: data-worker-sa
  namespace: data-processing
roleRef:
  kind: Role
  name: configmap-reader
  apiGroup: rbac.authorization.k8s.io
```

### Mitigating Token Exfiltration
By default, Kubernetes mounts a ServiceAccount token into every container at `/var/run/secrets/kubernetes.io/serviceaccount`. If your application does not need to talk to the Kubernetes API (which is true for 95% of standard web applications), disable this auto-mount behavior. 

Disable it at the ServiceAccount level:
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: standard-web-sa
automountServiceAccountToken: false
```

Or override it directly at the Pod specification level:
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: frontend
spec:
  serviceAccountName: standard-web-sa
  automountServiceAccountToken: false
  containers:
  - name: web
    image: nginx:alpine
```

### Bound Service Account Tokens
Historically, ServiceAccount tokens were static, non-expiring JWTs stored as Secrets. Modern Kubernetes (1.21+) utilizes Bound Service Account Tokens. These are short-lived, audience-bound tokens projected via volumes directly into the Pod. They expire when the Pod is deleted or after a set duration. If you must use a token, this projection is handled automatically by the kubelet.

### Operational Considerations
1.  **RBAC Auditing**: Use tools like `kubectl auth can-i --as=system:serviceaccount:namespace:sa-name list secrets` to verify effective permissions.
2.  **Tools**: Employ audit tools like `kube-score` or `checkov` in your CI/CD pipeline to statically analyze YAML files for permissive RBAC roles (e.g., catching `verbs: ["*"]` or `cluster-admin` bindings).

Hardening RBAC contains the blast radius. If a container is compromised, the attacker is left with an isolated environment devoid of the credentials needed to query the API server or access other namespace resources.