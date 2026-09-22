# Kubernetes Pod Security Standards (PSS) and Admission Controllers

### The Problem: PodSecurityPolicies (PSP) Deprecation
For years, Kubernetes administrators relied on `PodSecurityPolicy` (PSP) to prevent developers from running privileged containers, mounting host filesystems, or running as root. However, PSPs were notoriously complex, lacked a dry-run capability (leading to unexpected production breakages), and applied authorization in a confusing, non-deterministic way. As a result, PSP was deprecated in Kubernetes 1.21 and fully removed in 1.25.

### The Solution: Pod Security Admission (PSA) and Standards (PSS)
Kubernetes introduced the Pod Security Admission (PSA) controller as the built-in replacement. Instead of complex RBAC-bound policies, PSA operates entirely at the Namespace level using simple labels. 

It enforces the official **Pod Security Standards (PSS)**, which define three distinct profiles:
1.  **Privileged**: Unrestricted, open-by-default (use only for system daemons).
2.  **Baseline**: Prevents known privilege escalations (no `privileged: true`, no host network namespaces).
3.  **Restricted**: Highly restrictive, enforcing hardening best practices (must run as non-root, must drop all capabilities, seccomp profiles required).

### Architecture: Namespace-Level Enforcement

```text
                             [ Kubernetes API Server ]
                                        |
                            (Pod Creation Request)
                                        |
                          [ Pod Security Admission ]
                          (Reads Namespace Labels)
                                        |
         +------------------------------+------------------------------+
         |                              |                              |
[ Namespace: kube-system ]     [ Namespace: apps ]            [ Namespace: finance ]
Label: enforce=privileged      Label: enforce=baseline        Label: enforce=restricted
(Allows CSI/CNI agents)        (Blocks hostNetwork)           (Blocks root users)
```

### Implementing Pod Security Admission
To secure a namespace, you apply standard Kubernetes labels. PSA supports three modes of operation per profile:
*   **enforce**: Rejects the Pod if it violates the standard.
*   **audit**: Allows the Pod but logs an event to the API server audit log.
*   **warn**: Allows the Pod but returns a warning message directly to the user (e.g., via `kubectl`).

**Example: Hardening a namespace**
Let's configure the `finance` namespace to strictly enforce the `restricted` profile, while emitting warnings if the deployment doesn't meet next year's standard.

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: finance
  labels:
    # Reject Pods violating the restricted standard for k8s 1.28
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: v1.28
    
    # Audit and Warn on baseline violations (useful during migration)
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

### Developing for the 'Restricted' Profile
When a namespace enforces the `restricted` standard, developers must explicitly define their `securityContext`. A standard NGINX container will fail to start because it attempts to run as root and binds to port 80.

To pass the `restricted` PSS, the Pod YAML must explicitly drop capabilities and run as a non-root user:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: secure-app
  namespace: finance
spec:
  template:
    spec:
      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault
      containers:
      - name: app
        image: myapp:1.0 # Must be configured to run as a non-root user
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop:
              - ALL
```
If `allowPrivilegeEscalation: false` or the capability drops are omitted, the PSA controller will intercept the API request and return a 403 Forbidden error to the developer.

### External Admission Controllers (Kyverno / OPA Gatekeeper)
While the built-in PSA is excellent for enforcing the standard PSS profiles, it lacks the granularity to enforce custom business logic (e.g., "All images must come from `registry.company.com`" or "All Deployments must have a `cost-center` label").

For advanced use cases, architectures often pair the built-in PSA (for baseline security) with a mutating/validating webhook like **Kyverno** or **OPA Gatekeeper**. 

```yaml
# Example Kyverno ClusterPolicy for custom business logic
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-labels
spec:
  rules:
  - name: check-for-labels
    match:
      any:
      - resources:
          kinds:
          - Pod
    validate:
      message: "The label `team-owner` is required."
      pattern:
        metadata:
          labels:
            team-owner: "?*"
```

### Operational Considerations
1.  **Migration Strategy**: When migrating a cluster, apply the `audit` and `warn` labels first. Monitor the logs for a few weeks to identify which applications violate the standard before switching to `enforce`.
2.  **Controller Bypass**: Cluster administrators (or controllers like ReplicaSets created by them) can sometimes bypass standard admission webhooks if configured incorrectly. PSA evaluates the Pod spec directly, ensuring strong enforcement regardless of who creates the Pod.

Pod Security Admission provides a native, low-friction, and predictable method to ensure containers cannot escalate their privileges, effectively rendering a vast class of container breakouts obsolete.