# GCP Cloud Run Internals: Sandboxing Containers with gVisor

## The Problem: The Shared-Kernel Vulnerability of Multi-Tenant Containers

Standard container deployment models (such as Docker, native Kubernetes, or ECS) rely on the host Linux kernel to enforce process isolation via namespaces and cgroups. While highly efficient, this shared-kernel architecture represents a catastrophic security vulnerability in multi-tenant environments:

1. **Kernel Privilege Escalation (Container Escape)**: If an attacker compromises a containerized application (e.g., via a remote code execution exploit) and executes a kernel-level vulnerability (such as *Dirty COW*, *Dirty Pipe*, or a zero-day system call exploit), they can compromise the host kernel. Once the host kernel is compromised, the attacker can break out of the container boundary, access host resources, and intercept data from adjacent tenant containers running on the same physical server.
2. **Unrestricted Syscall Surface**: The Linux kernel supports over 300 system calls (syscalls). Many of these syscalls are complex, infrequently used, and historically prone to security bugs. Allowing arbitrary untrusted code to directly invoke these syscalls on the host hypervisor host presents an unacceptably large attack surface.
3. **Compromised Shared Resources**: Standard isolation mechanisms (cgroups) do not fully isolate virtual filesystems like `/proc` or `/sys`. An attacker can gather detailed system information about the underlying node, paving the way for targeted side-channel or denial-of-service attacks.

---

## Technical Architecture: The gVisor Sandboxing Model

To provide safe, multi-tenant container execution at scale without the heavy overhead of spinning up dedicated hardware virtual machines for every container, Google Cloud Run executes all workloads inside **gVisor**.

gVisor is an open-source, userspace container sandbox that implements a secure, intermediate kernel interface. Instead of passing system calls directly to the host kernel, gVisor intercepts them in user space.

### The gVisor Architecture Components

```
+--------------------------------------------------------------+
|                    SANDBOX (USER SPACE)                      |
|                                                              |
|   +------------------------------------------------------+   |
|   |             Untrusted Container Application          |   |
|   +--------------------------+---------------------------+   |
|                              |                               |
|                              | System Call (e.g., sys_open)  |
|                              v                               |
|   +------------------------------------------------------+   |
|   |                       SENTRY                         |   |
|   |      (Userspace Kernel - written in safe Go)         |   |
|   |      Implements 300+ Linux syscalls internally        |   |
|   +--------------------------+---------------------------+   |
|                              |                               |
|                              | Filtered / Proxied I/O        |
|                              v                               |
|   +------------------------------------------------------+   |
|   |                       GOFER                          |   |
|   |      (Secure File System Proxy - No Host Access)     |   |
|   +--------------------------+---------------------------+   |
+------------------------------|-------------------------------+
                               |
                               | Highly Restricted Syscalls (via ptrace / KVM)
                               v
+--------------------------------------------------------------+
|                     HOST KERNEL (Borg Host)                  |
+--------------------------------------------------------------+
```

### Core Architecture Components

1. **The Sentry**: The core component of gVisor. Sentry acts as a userspace kernel, written entirely in memory-safe Go. It implements the vast majority of the Linux kernel API (including file systems, network stacks, and memory management) directly in userspace. When the container executes `sys_open` or `sys_socket`, Sentry intercepts and processes the call locally, returning the result to the application without ever consulting the host kernel.
2. **The Gofer**: Sentry is completely isolated and has no filesystem access. When the application must perform actual file I/O, Sentry requests the file from the **Gofer**, a separate companion process. Gofer uses a highly restricted protocol (similar to 9P) to safely fetch files, ensuring the container cannot write directly to host disks.
3. **The Host Kernel Boundary**: Only a tiny, heavily audited subset of system calls (less than 20) are passed from the Sentry to the actual host kernel, utilizing secure virtualization interfaces (such as `ptrace` or `KVM`).

---

## Implementation: Containerd Runtime Integration

To run sandboxed containers locally or within your Kubernetes cluster exactly like GCP Cloud Run, configure **containerd** to utilize the gVisor `runsc` container runtime engine.

The following configuration segment shows the exact `config.toml` modifications required to declare the gVisor runtime handler within containerd.

```toml
# /etc/containerd/config.toml
version = 2

[plugins]
  [plugins."io.containerd.grpc.v1.cri"]
    [plugins."io.containerd.grpc.v1.cri".containerd]
      default_runtime_name = "runc"

      # Register the gVisor (runsc) runtime handler
      [plugins."io.containerd.grpc.v1.cri".containerd.runtimes]
        [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc]
          runtime_type = "io.containerd.runc.v2"

        [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runsc]
          runtime_type = "io.containerd.runc.v2"
          [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runsc.options]
            BinaryName = "/usr/local/bin/runsc"
```

Once configured, deploy Pods inside Kubernetes utilizing this secure runtime by defining a `RuntimeClass` and referencing it within your Pod specifications:

```yaml
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: gvisor
handler: runsc # Maps directly to the containerd config handler above
---
apiVersion: v1
kind: Pod
metadata:
  name: secure-untrusted-app
spec:
  runtimeClassName: gvisor # Forces execution within the gVisor sandbox
  containers:
  - name: web-app
    image: nginx:alpine
```

---

## Operational Best Practices

* **Audit Syscall Performance Overheads**: Because gVisor intercepts system calls in user space, applications that execute high-frequency system calls (such as rapid, small disk reads or constant network socket binding) will experience a performance overhead (10–30% increase in CPU latency). Optimize applications by batching reads or utilizing in-memory caches.
* **Specify Execution Environments in Cloud Run**: If your application does not require raw kernel system-call performance but processes highly sensitive external data (such as processing third-party CSV/PDF uploads), use the standard Cloud Run generation runtime to automatically leverage gVisor security.
* **Isolate Unused Endpoints**: Pair gVisor sandboxing with strict network egress controls in your Cloud Run settings to prevent a sandboxed, but compromised, application from executing network scans against other private endpoints within your Shared VPC network.
