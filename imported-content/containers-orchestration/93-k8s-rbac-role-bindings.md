# Kubernetes RBAC: Hardening Cluster Roles and Service Accounts

## The Over-Privileged Pod Problem
A common, catastrophic mistake in Kubernetes deployments is granting workloads excessive permissions within the cluster. When a pod is scheduled, Kubernetes automatically mounts a Service Account token into the pod's filesystem at `/var/run/secrets/kubernetes.io/serviceaccount`. 

If a cluster administrator binds the `default` service account to a highly privileged `ClusterRole` (such as `cluster-admin`), any pod running in that namespace instantly becomes a potential vector for total cluster takeover. If an attacker exploits a remote code execution (RCE) vulnerability in your web app, they can simply extract the mounted token and use `kubectl` (or curl) to delete nodes, read secrets across all namespaces, or deploy malicious daemonsets.

Securing Kubernetes requires strict adherence to Role-Based Access Control (RBAC) and the principle of least privilege.

## Mental Model: Subjects, Roles, and Bindings
Kubernetes RBAC operates on three core components:

1. **Subject**: The entity requesting access. This can be a User (human), a Group, or a ServiceAccount (a pod/machine).
2. **Role / ClusterRole**: The set of permissions. What actions (verbs) can be performed on what resources (nouns)? `Roles` are limited to a specific namespace. `ClusterRoles` apply cluster-wide.
3. **RoleBinding / ClusterRoleBinding**: The bridge that connects a Subject to a Role. 

```text
[ Subject (ServiceAccount: api-reader) ]
                   |
                   v
[ RoleBinding (Bind 'api-reader' to 'secret-reader-role') ]
                   |
                   v
[ Role (Verbs: get, list, watch | Resources: secrets) ]
```

## Implementation: Hardening Service Accounts

### Step 1: Disable Auto-Mounting of Tokens
Not every pod needs to talk to the Kubernetes API. A standard Nginx web server or a Redis database does not need a Service Account token. 

You should default to disabling the automatic mounting of the Service Account token, and only enable it explicitly for pods that require it (like Ingress controllers, monitoring agents, or CI/CD runners).

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: default
  namespace: production
automountServiceAccountToken: false
```
By setting this on the default service account, all new pods in the `production` namespace will be denied API access tokens by default.

### Step 2: Creating Dedicated Service Accounts and Roles
When a pod *does* need API access, create a dedicated Service Account for it, alongside a tightly scoped Role.

Imagine an internal dashboard that needs to list running pods in the `monitoring` namespace, but nothing else.

First, define the restricted Role:
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: monitoring
  name: pod-reader-role
rules:
- apiGroups: [""] # "" indicates the core API group
  resources: ["pods"]
  verbs: ["get", "list", "watch"]
```

### Step 3: Binding the Subject to the Role
Next, create the Service Account and bind it to the Role.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: dashboard-sa
  namespace: monitoring
automountServiceAccountToken: true # Explicitly enabled for this SA
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods-binding
  namespace: monitoring
subjects:
- kind: ServiceAccount
  name: dashboard-sa
  namespace: monitoring
roleRef:
  kind: Role
  name: pod-reader-role
  apiGroup: rbac.authorization.k8s.io
```

Finally, ensure the dashboard deployment is configured to use the `dashboard-sa` Service Account via the `spec.template.spec.serviceAccountName` field.

## Anti-Pattern: Avoiding ClusterRoleBindings
A `ClusterRoleBinding` grants permissions across the *entire* cluster, ignoring namespace boundaries. 

Binding a ServiceAccount to a highly privileged `ClusterRole` (like `edit` or `admin`) is highly dangerous. If you must use a `ClusterRole` (because you want to reuse a common set of permissions across many namespaces), bind it using a standard `RoleBinding`. 

When you use a `RoleBinding` to reference a `ClusterRole`, the permissions granted by the `ClusterRole` are constrained exclusively to the namespace where the `RoleBinding` exists.

## Conclusion
Kubernetes RBAC is your primary defense against lateral movement and privilege escalation inside the cluster. Start by disabling `automountServiceAccountToken` on all default service accounts. For workloads that genuinely require API interaction, craft granular, namespace-bound Roles that restrict verbs and resources strictly to what the application needs to function. Never use `ClusterRoleBindings` unless absolute global visibility is required by administrative tooling.