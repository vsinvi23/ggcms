# Securing Workloads with Kubernetes Pod Security Standards and Admission Controllers

Kubernetes workloads are highly configurable, which makes them inherently vulnerable to misconfiguration. If container parameters are left unhardened, developers can easily deploy containers that run as root, share host PID or network namespaces, or run with escalated capabilities. This creates immediate pathways for container breakout, host filesystem access, and full nodes takeover.

To prevent insecure configurations from ever entering the cluster, operators must transition from deprecated tools like `PodSecurityPolicy` to modern, native **Pod Security Standards (PSS)** and the built-in **Pod Security Admission (PSA)** controller.

---

## The Request Admission Lifecycle

When a pod deployment API request is initiated, it must undergo validation check phases before it is written to `etcd`:

```
   [ API Request ]
          │
          ▼
   [ Mutating Webhooks ] ──► (Modifies request parameters, e.g., injects sidecars)
          │
          ▼
   [ Schema Validation ]
          │
          ▼
   [ Validating Webhooks ] ──► (PSA verifies namespace labels and PSS rules)
          │
          ├──────────────────────────┐
      [ ALLOW ]                  [ REJECT ]
          │                          │
          ▼                          ▼
   [ Saved to etcd ]          [ API Server rejects deployment ]
```

The Pod Security Admission (PSA) controller acts during the validating phase, measuring the incoming pod's configuration against standard security profiles.

---

## The Three Pod Security Standards (PSS) Profiles

The PSA operates on three distinct, well-defined profiles:

1. **Privileged:** Unrestricted execution. Provides wide permissions allowing host escapes. Used for system-level daemonsets (e.g., CNI, storage controllers).
2. **Baseline:** Minimizes execution escalation paths. Prevents known privilege escalations while retaining default configurations.
3. **Restricted:** Hardened zero-trust configuration. Follows stringent pod-hardening best practices, restricting root usage, capabilities, and system namespace mounts.

---

## Declarative Production Hardening Configuration

To enforce these security standards, namespaces are labeled with the target validation level, the mode of enforcement, and version controls.

### 1. Hardening Namespace Labels
This namespace manifest configures the `restricted` standard. It blocks non-compliant pods from executing (`enforce`), alerts deployment systems (`warn`), and leaves log tracks (`audit`).

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: secured-finance-apps
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: "v1.28"
    pod-security.kubernetes.io/warn: restricted
    pod-security.kubernetes.io/warn-version: "v1.28"
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/audit-version: "v1.28"
```

### 2. A Compliant Restricted Pod Manifest
To successfully pass the validation of a `restricted` namespace, a Pod must explicitly drop privileges, run as a non-root user, and secure its root filesystem.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: compliant-api-worker
  namespace: secured-finance-apps
spec:
  securityContext:
    # Forces all container processes to run as a non-root UID
    runAsNonRoot: true
    # Use unprivileged UID/GID ranges
    runAsUser: 10005
    runAsGroup: 3000
    fsGroup: 20005
    # Enforces cryptographic sandbox separation
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: application
    image: company-api:v3.1.0
    ports:
    - containerPort: 8080
    securityContext:
      # Prevents child processes from gaining elevated privileges
      allowPrivilegeEscalation: false
      # Mounts the root filesystem as read-only to prevent runtime injection
      readOnlyRootFilesystem: true
      # Drops all kernel privileges and selectively allows only what is needed
      capabilities:
        drop:
        - ALL
    resources:
      limits:
        memory: 256Mi
        cpu: "1"
```

---

## Technical Mechanics of PSA Verification

When a resource like a `Deployment` is submitted:
1. The API server doesn't block the `Deployment` creation directly (as deployments contain templates, not raw pods).
2. Instead, PSA intercepts the **ReplicaSet** creation or the resulting **Pod** instantiation.
3. If the Pod template does not conform to the `restricted` specifications, the pod creation fails, and warning messages are surfaced in the deployment controller's event log:

```text
Error creating: pods "compliant-api-worker-xxxx" is forbidden: violates PodSecurity "restricted": non-root user enforcement violation, read-only root filesystem violation.
```

By transitioning to PSA namespace-bound labels and enforcing the Restricted security profile, you establish automated security guardrails that guarantee unhardened configurations cannot be scheduled in your cluster.
