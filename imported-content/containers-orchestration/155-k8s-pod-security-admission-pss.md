# Kubernetes Pod Security Standards (PSS) and Admission Controllers

## The Problem: The Danger of Privileged Pod Defaults

By default, Kubernetes pods run with highly permissive security settings. If a pod’s configuration is left unhardened, a compromised container can serve as a launchpad for an attacker to compromise the entire host node and cluster. 

For instance, without strict enforcement, developers can deploy pods that mount the host’s root file system (`hostPath`), run processes as the root user (UID 0), use the host's network namespace (`hostNetwork: true`), or request elevated Linux capabilities (like `CAP_SYS_ADMIN`). 

```
Attack Vector (Unrestricted Pod):
[ Attacker Compromises Container App ] 
                | (Uses hostPath mount or CAP_SYS_ADMIN)
                v
[ Escalates Privileges to Worker Node Root ]
                | (Accesses kubelet token, local disk, neighboring secrets)
                v
[ Full Cluster Compromise! ]
```

With the deprecation and final removal of PodSecurityPolicy (PSP) in Kubernetes v1.25, clusters require a robust, built-in mechanism to enforce guardrails on workload creation without relying on complex, external third-party tools.

---

## The Mental Model: Standards (PSS) and Admission (PSA)

To secure workloads natively, Kubernetes splits security enforcement into two complementary components: **Pod Security Standards (PSS)** and **Pod Security Admission (PSA)**.

```
+-------------------------------------------------------+
|  1. Pod Security Standards (PSS) - Three Profiles     |
|     - Privileged: Zero restrictions (system pods)     |
|     - Baseline: Prevents known privilege escalations  |
|     - Restricted: Hardened against container escape   |
+-------------------------------------------------------+
                           |
                           v Evaluated by
+-------------------------------------------------------+
|  2. Pod Security Admission (PSA) - Three Modes        |
|     - Enforce: Rejects violating pods immediately     |
|     - Warn: Allows pod but returns client warning     |
|     - Audit: Allows pod but records in audit log      |
+-------------------------------------------------------+
```

### The Three Standards Profiles
1. **Privileged:** Unrestricted policy. Designed for system-level infra (like CoreDNS or CNI plug-ins) requiring raw node access.
2. **Baseline:** Default policy preventing known privilege escalations. Restricts features like host namespaces, host ports, custom capabilities, and hostPath volumes.
3. **Restricted:** Heavily hardened policy targeting multi-tenant application workloads. It forces containers to run as non-root, drop all default Linux capabilities (allowing only `NET_BIND_SERVICE`), and enforce read-only root filesystems.

---

## Technical Configuration: Enforcing PSS on Namespace

The native Pod Security Admission controller is configured at the Namespace level using specific annotations. 

The following manifest defines a production namespace configured to enforce the `restricted` profile, while warning operators if a deployment violates the upcoming Kubernetes version's schema. It also includes a hardened, compliant application pod.

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: billing-prod
  annotations:
    # Enforce the "restricted" standard for any pod created in this namespace
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    
    # Send warnings to developers if they submit pods violating "restricted"
    pod-security.kubernetes.io/warn: restricted
    pod-security.kubernetes.io/warn-version: latest
---
apiVersion: v1
kind: Pod
metadata:
  name: secured-api
  namespace: billing-prod
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 10001
    runAsGroup: 10001
    fsGroup: 10001
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: web
    image: nginx:alpine
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      runAsNonRoot: true
      capabilities:
        drop:
        - ALL
    ports:
    - containerPort: 8080
```

### Explaining the Hardened Pod Configuration

1. **`runAsNonRoot: true`**: The kubelet validates the container image at runtime to ensure it does not run as root (UID 0), preventing container breakout attacks that rely on root-level system exploits.
2. **`seccompProfile.type: RuntimeDefault`**: Restricts the available system calls the container can make to the operating system kernel, using the runtime’s (e.g., containerd) secure default profile.
3. **`allowPrivilegeEscalation: false`**: Ensures a child process cannot gain more privileges than its parent process, blocking binaries with SUID flags from executing with elevated permissions.
4. **`capabilities.drop: ["ALL"]`**: Drops all standard Linux capabilities. If the container application is compromised, the attacker has no capability to manipulate network routing, modify mount namespaces, or load kernel modules.

By enforcing the `restricted` PSS profile using Namespace-level PSA annotations, platform operators can guarantee that all application workloads are secure-by-default.
