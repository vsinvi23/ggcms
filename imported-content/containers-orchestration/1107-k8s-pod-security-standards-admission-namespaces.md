# Kubernetes Pod Security Standards (PSS) and Admission Controllers

With the deprecation and eventual removal of PodSecurityPolicy (PSP) in Kubernetes v1.25, many clusters were left without a native mechanism to enforce runtime container security limits. Without security admission controllers in place, users can deploy pods that run as `root`, share host namespaces, execute in privileged mode, or mount dangerous host directories.

The official replacement is **Pod Security Standards (PSS)**, integrated natively into the Kubernetes Admission Controller as the **Pod Security Admission (PSA)** webhook. 

In this article, we analyze the architectural security profiles, explore the three validation modes, and implement a production-hardened PSS configuration.

---

## Technical Architecture: PSS Profiles and Admission Modes

Pod Security Standards classify pod configurations into three distinct levels:
1. **Privileged:** Unrestricted policy. Allows container breakouts, host namespace access, and system root permissions. (Useful for system level daemons like CNI, kube-proxy, logging agents).
2. **Baseline:** Minimally restrictive. Prevents known privilege escalations, restricts host ports, blocks host paths, and disallows privileged execution.
3. **Restricted:** Highly restrictive. Enforces modern hardening best practices. Requires pods to run as non-root, blocks privilege escalation, drops Linux capabilities, and forces read-only root filesystems.

These profiles are applied to **Namespaces** using labels. Within each namespace, we configure three different execution **modes**:
* **Enforce:** Pods violating the profile are immediately rejected by the API Server.
* **Warn:** Violations trigger a warning returned to the user, but the pod is still admitted.
* **Audit:** Violations do not block the pod, but are logged as events in the cluster audit logs.

```text
                               +-----------------------------+
                               |     Kubernetes API Server   |
                               +--------------+--------------+
                                              |
                                              | Evaluates Pod YAML
                                              v
                               +-----------------------------+
                               |  Pod Security Admission     |
                               |  (PSA Webhook Controller)   |
                               +--------------+--------------+
                                              |
                  +---------------------------+---------------------------+
                  | (Enforce Level)           | (Warn Level)              | (Audit Level)
                  v                           v                           v
        +-------------------+       +-------------------+       +-------------------+
        | Block Deployment  |       | Warning to User   |       | Log to Audit Trail|
        | if PSS violated   |       | (Pod Allowed)     |       | (Pod Allowed)     |
        +-------------------+       +-------------------+       +-------------------+
```

---

## Part 1: Configuring Namespace-Level Labels

Let's apply Pod Security Admission labels to a production namespace. We will enforce the `restricted` profile, but provide warnings and audit logs against the `restricted` profile as well (ensuring that any future changes to the specification are captured).

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: hardened-apps
  labels:
    # 1. Enforce mode set to Restricted
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    
    # 2. Warn mode set to Restricted (useful during upgrades)
    pod-security.kubernetes.io/warn: restricted
    pod-security.kubernetes.io/warn-version: latest
    
    # 3. Audit mode set to Restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/audit-version: latest
```

---

## Part 2: Deploying a Non-Compliant Pod (Rejection Test)

If we attempt to deploy a standard, unhardened pod into our newly restricted namespace, the Admission Controller will block it. Let's look at a manifest that violates several PSS Restricted requirements (running as root, missing securityContext limits):

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: vulnerable-pod
  namespace: hardened-apps
spec:
  containers:
  - name: nginx
    image: nginx:alpine
    # VIOLATION: No securityContext defined!
    # By default, this container runs as root (UID 0), allows privilege escalation,
    # and mounts a read-write root filesystem.
```

### The API Server Rejection Error
Attempting to apply the above pod yields an immediate, hard rejection:
```text
Error from server (Forbidden): error creating "vulnerable-pod.yaml": pods "vulnerable-pod" is forbidden: violates PodSecurity "restricted:latest": allowPrivilegeEscalation != false (container "nginx" must set securityContext.allowPrivilegeEscalation=false), runAsNonRoot != true (pod or container "nginx" must set securityContext.runAsNonRoot=true), seccompProfile (pod or container "nginx" must set seccompProfile.type to "RuntimeDefault" or "Localhost")
```

---

## Part 3: Deploying a Hardened Compliant Pod

To satisfy the `restricted` PSS profile, we must explicitly declare our security contexts, force a non-root execution path, drop standard kernel capabilities, and utilize the default system seccomp profile.

Here is the fully compliant, hardened manifest:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: hardened-nginx-pod
  namespace: hardened-apps
spec:
  # Pod-level Security Settings
  securityContext:
    runAsNonRoot: true
    runAsUser: 10001
    runAsGroup: 10001
    fsGroup: 10001
    seccompProfile:
      type: RuntimeDefault  # Leverages Linux Seccomp default syscall filter
  containers:
  - name: nginx
    image: nginxinc/nginx-unprivileged:alpine # Non-root base image
    ports:
    - containerPort: 8080 # Unprivileged port (cannot use <1024)
    # Container-level Security Settings
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true  # Blocks disk mutations
      runAsNonRoot: true
      runAsUser: 10001
      capabilities:
        drop:
        - ALL  # Discards all default root-level kernel capabilities
    # Mounting tmpfs for dynamic directories since filesystem is Read-Only
    volumeMounts:
    - mountPath: /tmp
      name: tmp-volume
    - mountPath: /var/cache/nginx
      name: nginx-cache
  volumes:
  - name: tmp-volume
    emptyDir: {}
  - name: nginx-cache
    emptyDir: {}
```

This pod passes validation easily, achieving maximum runtime isolation without relying on heavy third-party admission tools. By establishing a multi-layered PSA strategy (`warn` on dev, `enforce` on prod), you ensure your runtime environments are resilient against container escape vectors.
