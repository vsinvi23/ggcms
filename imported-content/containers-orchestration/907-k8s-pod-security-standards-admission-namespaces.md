# Kubernetes Pod Security Standards (PSS) and Admission Controllers

## The Problem: The Death of PodSecurityPolicies (PSP)
Historically, Kubernetes administrators relied on `PodSecurityPolicy` (PSP) to prevent developers from deploying highly privileged, dangerous pods. PSPs could block containers from running as root, mounting host filesystems, or acquiring escalated capabilities.

However, PSPs were structurally flawed. Their authorization model was deeply confusing, relying on complex RBAC bindings to the ServiceAccount executing the pod, resulting in unpredictable behavior and silent failures. Acknowledging these severe architectural defects, Kubernetes deprecated PSP in v1.21 and completely removed it in v1.25. 

Clusters upgrading to v1.25+ without a replacement strategy were suddenly left completely exposed, allowing any user with pod creation rights to deploy a privileged container and take over the underlying node.

## The Architecture: Pod Security Admission (PSA)
To replace PSP, Kubernetes introduced the **Pod Security Admission (PSA)** controller, built upon the **Pod Security Standards (PSS)**.

Instead of complex RBAC logic, PSA evaluates pods directly against three standardized, immutable profiles defined by PSS:
1. **Privileged:** Unrestricted. (For system agents/CNIs).
2. **Baseline:** Minimally restrictive. Prevents known privilege escalations (e.g., host mounts).
3. **Restricted:** Highly restrictive. Enforces current best practices (must run as non-root, must drop all capabilities, strict seccomp profiles).

### The Webhook Interception
PSA operates as a built-in Admission Controller.

```text
[ Developer (kubectl apply) ] 
            |
            v
     [ K8s API Server ]
            | (Intercepts Request)
 [ Pod Security Admission ] 
  (Checks Namespace Labels)
            |
    [ Allow / Deny / Warn ]
            |
       [ etcd / Kubelet ]
```

## Implementation: Enforcing PSS via Namespace Labels
The brilliance of PSA is its simplicity. Enforcement is applied directly via metadata labels on the `Namespace`. You do not need to create complex policy objects; you simply label the namespace.

### Enforcing the Restricted Profile
To lock down an application namespace to the highest security standard, apply the `enforce` label:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: frontend-app
  labels:
    # Reject any pod that violates the 'restricted' standard
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
```

With this label in place, if a developer attempts to deploy this Pod:
```yaml
# This deployment will be REJECTED
apiVersion: v1
kind: Pod
metadata:
  name: bad-pod
spec:
  containers:
  - name: app
    image: nginx
    securityContext:
      privileged: true # Violation!
```
The API server will synchronously reject the request, returning an error detailing exactly which PSS rule was violated.

### The Phased Rollout: Audit and Warn Modes
Applying strict enforcement immediately to a brownfield cluster will break production workloads. PSA allows for graceful, phased rollouts using `audit` and `warn` modes.

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: legacy-app
  labels:
    # Enforce baseline (block the worst offenses)
    pod-security.kubernetes.io/enforce: baseline
    
    # Warn developers in their CLI if they violate restricted
    pod-security.kubernetes.io/warn: restricted
    
    # Send violations to the API audit log for SecOps tracking
    pod-security.kubernetes.io/audit: restricted
```

When a developer deploys a pod that passes `baseline` but fails `restricted`, the pod is allowed to run, but `kubectl` will print a bright warning to the developer's terminal, and an event will be logged for the security team to investigate.

## Beyond PSS: OPA Gatekeeper and Kyverno
While PSA is the native, out-of-the-box solution, its profiles (Baseline, Restricted) are immutable. You cannot create a custom rule (e.g., "All pods must use images from our internal harbor registry"). 

For advanced, custom policy enforcement, architects must deploy validating admission webhooks like **OPA Gatekeeper** or **Kyverno**. However, for fundamental pod hardening—blocking root, host networking, and privilege escalation—PSA is the mandatory, foundational layer for every modern cluster.

## Conclusion
The removal of PodSecurityPolicies forced a paradigm shift in Kubernetes security. By leveraging the Pod Security Admission controller and mapping strict Pod Security Standards directly to namespaces via labels, administrators can easily enforce baseline isolation without the brittle complexity of legacy RBAC-driven policies.
