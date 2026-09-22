# Kubernetes RBAC Explained: Roles, ClusterRoles, and Bindings

### The Problem

By default, an authenticated user or Service Account in Kubernetes has zero permissions. If you create a Service Account and try to `kubectl get pods` using its token, the API server will return `403 Forbidden`.

To secure a cluster, we need a granular, declarative way to state: *"Subject X is allowed to perform Action Y on Resource Z."* 

Kubernetes implements this through Role-Based Access Control (RBAC).

### The Four Pillars of RBAC

Kubernetes RBAC is built entirely around four API resources. Understanding how they interconnect is the key to cluster authorization.

1. **Role:** Defines a set of permissions within a specific namespace.
2. **ClusterRole:** Defines a set of permissions across the entire cluster.
3. **RoleBinding:** Attaches a Role to a User/Group/ServiceAccount within a namespace.
4. **ClusterRoleBinding:** Attaches a ClusterRole to a User/Group/ServiceAccount across the entire cluster.

### Roles and ClusterRoles (The "What")

A Role contains rules representing a set of permissions. Rules are additive; there are no "deny" rules in Kubernetes RBAC.

#### Namespace-scoped: Role

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: development
  name: pod-reader
rules:
- apiGroups: [""] # "" indicates the core API group
  resources: ["pods", "pods/log"]
  verbs: ["get", "watch", "list"]
```
This `Role` exists only in the `development` namespace. It allows reading Pods and Pod logs.

#### Cluster-scoped: ClusterRole

Some resources, like Nodes or PersistentVolumes, are not bound to a namespace. To grant access to these, or to grant access to namespace-scoped resources across *all* namespaces, you use a `ClusterRole`.

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: secret-reader
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list"]
```

### Bindings (The "Who")

A Role alone does nothing. It must be bound to a subject (a User, Group, or ServiceAccount) via a Binding.

#### RoleBinding

A `RoleBinding` applies the permissions in a namespace. 

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods-binding
  namespace: development
subjects:
- kind: User
  name: "alice@example.com"
  apiGroup: rbac.authorization.k8s.io
- kind: ServiceAccount
  name: dev-sa
  namespace: development
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```
Now, user Alice and the `dev-sa` Service Account can read Pods, but *only* in the `development` namespace.

#### The Hybrid: RoleBinding to a ClusterRole

This is the most misunderstood feature of Kubernetes RBAC. You can use a namespace-scoped `RoleBinding` to bind a `ClusterRole`. 

Why? Reusability. 
Instead of creating a `pod-reader` Role in 50 different namespaces, you create a single `view` ClusterRole. Then, you create a `RoleBinding` in specific namespaces pointing to that ClusterRole. This grants the permissions, but heavily restricts them to the namespace where the `RoleBinding` lives.

#### ClusterRoleBinding

A `ClusterRoleBinding` applies permissions across the entire cluster. 

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: read-secrets-global
subjects:
- kind: Group
  name: "security-auditors"
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: secret-reader
  apiGroup: rbac.authorization.k8s.io
```
Members of the `security-auditors` group can now read secrets in *every* namespace.

### Best Practices for RBAC

1. **Avoid Wildcards:** Never use `verbs: ["*"]` or `resources: ["*"]` outside of strictly controlled cluster-admin scenarios. It is easy to accidentally grant permission to delete the namespace or escalate privileges.
2. **Aggregated ClusterRoles:** Kubernetes allows you to construct complex ClusterRoles from smaller ones using labels (aggregation). Use the default built-in roles (`admin`, `edit`, `view`) when possible.
3. **Audit Bindings:** Regularly audit `ClusterRoleBindings`, especially those granting access to `secrets` or the `escalate` verb, which allows subjects to create resources that have higher privileges than they do.
