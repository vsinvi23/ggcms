# Kubernetes Security from Scratch: Pod Security Admission

### The Problem

Docker containers are not virtual machines. They share the same kernel as the underlying host. If a process inside a container runs as `root`, and it manages to break out of the container (via a kernel vulnerability or misconfiguration), it possesses `root` access on the host node. From there, the attacker can compromise the kubelet, steal credentials, and pivot across the cluster.

By default, Kubernetes prioritizes ease of use over security. Out of the box, Kubernetes allows you to run privileged, root-access containers that mount the host's filesystem. 

### The Solution: Pod Security Admission (PSA)

To lock down a cluster, we need a mechanism to intercept Pod creation requests and reject them if they violate security standards. 

Historically, this was done via Pod Security Policies (PSP). However, PSP was overly complex and deprecated in Kubernetes v1.21. It has been replaced by **Pod Security Admission (PSA)**.

PSA is a built-in admission controller that evaluates Pods against predefined Pod Security Standards (PSS).

### The Three Pod Security Standards

The PSS defines three distinct profiles:

1. **Privileged:** Unrestricted. Allows known privilege escalations. Use only for system-level daemonsets (like CNI or CSI plugins).
2. **Baseline:** Minimally restrictive policy that prevents known privilege escalations but allows the default (and relatively insecure) Pod configurations.
3. **Restricted:** Heavily restricted policy following current best practices. Requires dropping capabilities and running as non-root.

### Enforcing Policies via Namespaces

PSA is enforced at the Namespace level using specific labels.

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: backend-apps
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    pod-security.kubernetes.io/warn: restricted
```

When this label is applied, the API server will explicitly reject any Pod created in the `backend-apps` namespace that does not conform to the `restricted` profile.

### Building a Restricted Pod

To pass a `restricted` PSA namespace, your Pod specification must contain a robust `securityContext`.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-app
spec:
  securityContext:
    runAsNonRoot: true
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: app
    image: my-app:latest
    securityContext:
      allowPrivilegeEscalation: false
      runAsUser: 10001
      capabilities:
        drop:
        - ALL
```

Let's break down these critical directives:

1. **`runAsNonRoot: true`**: The kubelet will inspect the container image. If the image specifies `USER 0` (root) in its Dockerfile, or if `runAsUser` is not set, the Pod will fail to start.
2. **`runAsUser: 10001`**: Explicitly forces the container process to run as UID 10001.
3. **`allowPrivilegeEscalation: false`**: Prevents child processes from gaining more privileges than their parent (disables `setuid` binaries).
4. **`capabilities.drop: ["ALL"]`**: Linux divides root privileges into modular "capabilities" (e.g., `CAP_CHOWN`, `CAP_NET_BIND_SERVICE`). Dropping `ALL` removes these kernel bypasses entirely.
5. **`seccompProfile: RuntimeDefault`**: Restricts the system calls (syscalls) the container can make to the Linux kernel, minimizing the attack surface for zero-day vulnerabilities.

### The Developer Experience

Enforcing the `restricted` profile abruptly will break existing workloads. PSA provides `warn` and `audit` modes. 

Before switching `enforce: restricted`, apply `pod-security.kubernetes.io/warn: restricted`. Pods will still be created, but developers will receive a warning in their CLI, and cluster administrators can parse the audit logs to identify which deployments need their `securityContext` hardened.
