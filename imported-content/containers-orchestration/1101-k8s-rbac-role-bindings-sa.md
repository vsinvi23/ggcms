# Kubernetes RBAC: Hardening Cluster Roles, Roles, and Service Account Tokens

Kubernetes Role-Based Access Control (RBAC) is the primary line of defense for securing the cluster control plane. Despite this, over-privileged Roles, wildcard resource access (`*`), and exposed Service Account (SA) tokens remain among the most exploited attack vectors in Kubernetes environments.

If an attacker compromises a Pod running with a highly privileged Service Account, they can execute commands against the Kubernetes API Server, download secrets, list other pods, and potentially achieve complete cluster takeover (privilege escalation). Securing RBAC requires a meticulous adherence to the principle of least privilege.

---

## Technical Architecture: RBAC Hierarchy and Pod Integration

Kubernetes RBAC decouples the *identity* (User, Group, or ServiceAccount) from the *permissions* (Roles and ClusterRoles) using *bindings* (RoleBindings and ClusterRoleBindings).

```text
       +-----------------------+              +------------------------+
       |   ClusterRoleBinding  |              |      RoleBinding       |
       +-----------+-----------+              +-----------+------------+
                   |                                      |
                   | (Applies cluster-wide)               | (Applies to namespace)
                   v                                      v
       +-----------------------+              +------------------------+
       |      ClusterRole      |              |          Role          |
       +-----------------------+              +------------------------+
                   |                                      |
                   +------------------+-------------------+
                                      |
                                      v
                       +-----------------------------+
                       |       ServiceAccount        | (Identity assigned to Pod)
                       +--------------+--------------+
                                      |
                                      | (Mounts token into)
                                      v
                       +-----------------------------+
                       |          Target Pod         | (e.g., /var/run/secrets/...)
                       +-----------------------------+
```

To limit the blast radius:
1. **Roles / RoleBindings** should always be preferred over ClusterRoles / ClusterRoleBindings unless cluster-wide scope is strictly required (e.g., custom resource definitions or node metrics).
2. **Service Accounts** should have `automountServiceAccountToken` set to `false` by default, unless the pod explicitly needs to interact with the API Server.

---

## Step 1: Default Service Account Hardening

By default, every namespace in Kubernetes contains a Service Account named `default`. Whenever a Pod is created without explicitly specifying a Service Account, it is automatically assigned this `default` account, and its credential token is mounted inside the container at `/var/run/secrets/kubernetes.io/serviceaccount/token`.

To mitigate this automated exposure, disable auto-mounting globally for the `default` Service Account in all namespaces:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: default
  namespace: secure-apps
automountServiceAccountToken: false
```

---

## Step 2: Creating a Secure Namespace-Scoped Role

When an application requires API Server access, create a dedicated, isolated Service Account and define a highly specific `Role` specifying exact resources and allowed API verbs (e.g., GET, LIST). Avoid wildcards (`*`).

### Service Account Manifest
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: pod-lister-sa
  namespace: secure-apps
automountServiceAccountToken: true  # Mount token only for this dedicated SA
```

### Least-Privileged Role Manifest
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: secure-apps
rules:
- apiGroups: [""] # "" indicates the core API group
  resources: ["pods"]
  verbs: ["get", "list", "watch"]
# Hardened: No write verbs (create, update, delete, patch) allowed.
# Hardened: Cannot read "secrets" or "configmaps".
```

### Role Binding Manifest
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods-binding
  namespace: secure-apps
subjects:
- kind: ServiceAccount
  name: pod-lister-sa
  namespace: secure-apps
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

---

## Step 3: Hardening ClusterRoles and Avoiding Escalation

A `ClusterRole` has non-namespaced scope. It is commonly used for cluster administrators, operators, and monitoring daemons. If a Service Account with a `ClusterRoleBinding` is compromised, the entire cluster is at risk.

Below is an example of an audit/view-only ClusterRole that prevents privilege escalation:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: cluster-viewer
rules:
- apiGroups: [""]
  resources: ["nodes", "namespaces", "persistentvolumes"]
  verbs: ["get", "list", "watch"]
# Prevent security policy changes by excluding clusterrolebindings/roles from view.
- apiGroups: ["apps"]
  resources: ["deployments", "statefulsets"]
  verbs: ["get", "list"]
```

---

## Best Practices for RBAC Auditing

1. **Audit for Wildcards (`*`):** 
   Regularly scan the cluster for RBAC rules containing wildcards. Use the following command to detect highly privileged cluster roles:
   ```bash
   kubectl get clusterroles -o json | jq '.items[] | select(.rules[].verbs[] == "*") | .metadata.name'
   ```

2. **Temporal Token Projections:**
   Instead of relying on long-lived Service Account secret tokens, leverage Projected Volumes to mount short-lived tokens that auto-rotate:
   ```yaml
   spec:
     containers:
     - name: app
       image: alpine
       volumeMounts:
       - mountPath: /var/run/secrets/tokens
         name: vault-token
     volumes:
     - name: vault-token
       projected:
         sources:
         - serviceAccountToken:
             path: vault-token
             expirationSeconds: 3600
             audience: vault
   ```

By restricting auto-mounting, enforcing namespace limits with Roles instead of ClusterRoles, and eliminating wildcard privileges, you establish a resilient defense against control plane exploits.
