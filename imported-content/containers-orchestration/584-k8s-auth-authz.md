# Kubernetes Authentication and Authorization: Gating the API

### The Problem

The Kubernetes API server (`kube-apiserver`) is the brain of the cluster. It manages the state of all nodes, Pods, secrets, and configurations. If an attacker gains unrestricted access to the API server, they own the cluster. They can spin up crypto-miners, read sensitive secrets, or delete entire namespaces.

Therefore, every request hitting the API server must explicitly answer two questions:
1. **Authentication (Authn):** Who are you?
2. **Authorization (Authz):** Are you allowed to do this?

### The Kubernetes Access Control Chain

Every API request passes through a sequence of gates. If a request fails at any gate, it is rejected with a `401 Unauthorized` or `403 Forbidden`.

```text
[ Client Request ]
       |
       V
+------------------------+
| 1. Authentication      |  (Validates identity: Users/ServiceAccounts)
+------------------------+
       |
       V
+------------------------+
| 2. Authorization       |  (Validates permissions: RBAC/ABAC)
+------------------------+
       |
       V
+------------------------+
| 3. Admission Control   |  (Validates/Mutates payload: PodSecurity, MutatingWebhooks)
+------------------------+
       |
       V
   [ etcd (State) ]
```

### Authentication: Who are you?

Kubernetes differentiates between two types of identities:
- **Normal Users:** Humans or external systems. Kubernetes does *not* have an internal database of users. It relies on external identity providers (OIDC, OAuth2, Active Directory) or client certificates.
- **Service Accounts:** Identities for Pods running inside the cluster. Kubernetes *does* manage Service Accounts internally.

#### Service Accounts in Action

When an application inside a Pod needs to talk to the API server (e.g., a CI/CD runner deploying a new app, or a monitoring tool reading node metrics), it uses a Service Account.

Every namespace has a `default` Service Account. By default, Kubernetes automatically mounts a Bearer token associated with this Service Account into every Pod at `/var/run/secrets/kubernetes.io/serviceaccount`.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-api-client
spec:
  serviceAccountName: backend-sa
  containers:
  - name: client
    image: curl-image
```

The application can read this token and send it in the `Authorization: Bearer <token>` header to the API server. 

### Authorization: Are you allowed to do this?

Once identity is established, Kubernetes must determine if the request is permitted. While Kubernetes supports Node and ABAC authorization modes, **RBAC (Role-Based Access Control)** is the industry standard.

The API server evaluates the request attributes:
- **User:** The identity established in the Authn phase.
- **Action:** The HTTP verb mapped to a CRUD operation (`get`, `list`, `create`, `update`, `delete`).
- **Resource:** The API object being targeted (e.g., `pods`, `secrets`, `services`).
- **Namespace:** The logical partition of the resource.

If an explicit RBAC binding grants the user permission to perform the action on the resource, the request proceeds. If no explicit permission exists, Kubernetes fails closed (Deny by default).

### Admission Control: The Final Check

Authentication and Authorization happen at the REST level. They do not look at the *contents* of the JSON payload you are submitting. 

Admission Controllers are interceptors that analyze and potentially modify the payload before it is written to `etcd`.

- **Validating Admission Controllers:** Inspect the payload and can reject it. For example, the `PodSecurity` controller ensures your Pod doesn't request root privileges.
- **Mutating Admission Controllers:** Modify the payload. For example, a mutating webhook might automatically inject a sidecar container (like Istio or Linkerd) into every Pod specification before it is saved.

### Security Best Practices

1. **Disable Auto-mounting:** If a Pod doesn't need to talk to the API server, explicitly disable the token mount:
   ```yaml
   automountServiceAccountToken: false
   ```
2. **Principle of Least Privilege:** Never grant `cluster-admin` privileges to Service Accounts unless absolutely necessary. Scope roles tightly to specific namespaces and specific verbs.
3. **Use OIDC for Humans:** Do not distribute static `kubeconfig` files with long-lived client certificates. Integrate `kube-apiserver` with your corporate SSO (Okta, Google Workspace) via OIDC.
