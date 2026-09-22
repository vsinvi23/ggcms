# Kubernetes Pod Security Standards (PSS) and Admission Controllers

### The Problem: Deprecation of PodSecurityPolicies

Historically, Kubernetes administrators relied on PodSecurityPolicies (PSP) to prevent insecure pods (e.g., containers running as root, mounting host paths, or requiring privileged mode) from being scheduled in the cluster. However, PSPs were notoriously complex, lacked dry-run capabilities, and caused immense confusion regarding authorization bindings. Consequently, PSPs were deprecated in Kubernetes v1.21 and entirely removed in v1.25, leaving many clusters vulnerable to privilege escalation attacks if administrators did not adopt an alternative mechanism.

### The Solution: Pod Security Admission (PSA)

To replace PSP, Kubernetes introduced the Pod Security Admission (PSA) controller as a built-in standard. PSA enforces the predefined Pod Security Standards (PSS). Instead of writing complex, custom security logic, administrators now apply standardized, tiered profiles at the namespace level using simple labels.

The three PSS profiles are:
1.  **Privileged:** Unrestricted; permits known privilege escalations (for system agents/CNIs).
2.  **Baseline:** Minimally restrictive; prevents known privilege escalations (allows default pod configs).
3.  **Restricted:** Heavily restricted; follows current Pod hardening best practices (requires dropping capabilities, non-root execution, seccomp).

### Architecture: PSA Enforcement Flow

Enforcement occurs at the API Server via an Admission Controller.

```text
+----------------+      +---------------------------+      +-------------------+
|  kubectl apply |      |    Kube API Server      |      |                   |
|  (Pod YAML)    +----->+  (Admission Controller) +----->+  etcd / Scheduler |
+----------------+      |                           |      |                   |
                        +------------+--------------+      +-------------------+
                                     |
                          +----------v-----------+
                          | Pod Security Adm.  |  <-- Checks Namespace Labels
                          | Evaluates Profile  |  <-- Validates Pod Spec
                          +----------------------+
                             (Allow or Reject)
```

### Implementation: Securing Namespaces with Labels

PSA is governed purely by setting specific labels on a `Namespace` resource. You define the *mode* (enforce, audit, or warn) and the *level* (privileged, baseline, or restricted).

#### 1. Enforcing a Restricted Profile

The `Restricted` profile represents zero-trust best practices. Let's enforce it on a production namespace.

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: strict-prod
  labels:
    # 1. Reject any pod that violates the Restricted standard
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    
    # 2. Add an audit log entry for Baseline violations (as a secondary check)
    pod-security.kubernetes.io/audit: baseline
    pod-security.kubernetes.io/audit-version: latest
```

#### 2. Writing a Compliant Pod

If a developer attempts to deploy a standard `nginx` pod into the `strict-prod` namespace, the API server will reject it because the default Nginx image runs as root.

To deploy successfully in a `Restricted` namespace, the Pod's `securityContext` must explicitly lock down execution.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-nginx
  namespace: strict-prod
spec:
  containers:
  - name: nginx
    image: nginxinc/nginx-unprivileged:latest # Must use non-root image
    securityContext:
      # Mandatory for Restricted PSS
      allowPrivilegeEscalation: false
      runAsNonRoot: true
      runAsUser: 101 # Unprivileged User ID
      seccompProfile:
        type: RuntimeDefault
      capabilities:
        drop:
        - ALL # Drop all Linux capabilities
```

### Operational Considerations

*   **Migration Strategy (Warn/Audit):** Never apply `enforce: restricted` to a running namespace without testing. First, apply the `warn` and `audit` labels. The API server will allow the pods to run but will return warnings to the CLI and write violations to the Kubernetes audit logs. Review the logs to fix `securityContexts` before switching to `enforce`.
*   **Exemptions:** Sometimes, specific controllers (like an ingress controller or a logging DaemonSet) require privileges. These must be placed in a separate namespace (e.g., `ingress-system`) labeled with `pod-security.kubernetes.io/enforce: privileged`. 
*   **Third-Party Alternatives:** While built-in PSA is excellent for baseline security, organizations needing highly granular, custom rules (e.g., "deny images from Docker Hub", "enforce specific CPU limits") should look to external admission webhooks like OPA Gatekeeper or Kyverno, which use flexible policy languages (Rego or YAML) to augment PSA.
