---
title: "GCP Cloud Run Internals: Sandboxing Container Runtimes with gVisor"
description: "How gVisor's Sentry and Gofer user-space processes give Cloud Run VM-grade multi-tenant isolation without the overhead of a full hypervisor, and how to run the same runsc sandbox yourself in Docker and Kubernetes."
type: "ARTICLE"
categorySlug: "cloud-platforms"
articleType: "DEEP_DIVE"
tags:
  - "gcp"
  - "cloud-run"
  - "gvisor"
  - "sandboxing"
  - "kubernetes"
  - "multi-tenancy"
  - "container-security"
---

# GCP Cloud Run Internals: Sandboxing Container Runtimes with gVisor

## The Problem: The Shared Kernel Vulnerability of Standard Containers

In standard Linux container environments (such as Docker or traditional Kubernetes using the default `runc` container runtime), containers are not virtual machines. They are simply isolated groups of host processes constrained by kernel namespaces (network, PID, mount) and cgroups (control groups for CPU, memory limits).

Crucially, every container on a physical host **shares the same Linux kernel**.

This shared-kernel model presents a critical security risk for multi-tenant cloud architectures:

1. **Privilege escalation & container breakout**: If an application container is compromised, an attacker can exploit a zero-day vulnerability in the host Linux kernel (e.g., Dirty COW, a zero-day local privilege escalation). Once they gain root execution on the host kernel, they can break out of namespaces, inspect memory, and access other tenants' data.
2. **Infinite attack surface**: The Linux kernel exposes over 300 system calls (syscalls). Hardening this vast attack surface with standard profiles (like seccomp or AppArmor) is complex, brittle, and often leads to broken application dependencies.

In fully managed, serverless platforms like GCP Cloud Run, where millions of containers from different untrusted tenants run on the same physical infrastructure, standard `runc` containment is unacceptable.

## The Solution: gVisor Sandboxing

Google Cloud Run solves the multi-tenancy isolation problem by running all containers inside **gVisor**.

gVisor is an application kernel written in Go that acts as a secure, sandboxed container runtime (called `runsc`). It intercepts system calls made by containerized applications and implements them entirely in **user space**. The sandboxed application has no direct access to the host machine's kernel.

### gVisor Architecture: Sentry and Gofer

gVisor splits containment duties between two primary user-space processes:

1. **The Sentry**: This is the core guest kernel running in user space. Sentry intercepts all syscalls (e.g., `sys_clone`, `sys_read`) using low-level hooks (such as `ptrace` or virtualized KVM). Sentry implements the state machine of the Linux kernel in Go, satisfying syscalls locally without passing them down to the host OS.
2. **The Gofer**: This is a dedicated file-system proxy. To prevent a compromised container from traversing or corrupting the host's physical filesystems, Sentry is not allowed to make file-related system calls. Instead, it communicates with the Gofer process using the structured **9P protocol** over a secure UNIX socket. Gofer executes the physical file operations on behalf of the container and streams the bytes back.

### Standard Container (runc) vs. Sandboxed Container (gVisor)

```text
STANDARD CONTAINER (runc)                 SANDBOXED CONTAINER (gVisor)
+-----------------------------------+   +-----------------------------------+
| Container A  | Container B (Att)  |   | Container A  | Container B (Att)  |
+-----------------------------------+   +-----------------------------------+
| Namespaces / cgroups (Isolation)  |   | User-Space Sentry (Go Kernel)     |
+===================================+   +===================================+
| Shared Host Linux Kernel (VULN)   |             | (9P Protocol Socket)
|  - Over 300 direct syscall paths  |   +---------v-------------------------+
+-----------------------------------+   | User-Space Gofer File Proxy       |
|          Physical Hardware        |   +===================================+
+-----------------------------------+   | Strict Host Seccomp Filter (Deny) |
                                        +-----------------------------------+
                                        | Shared Host Linux Kernel (Secure) |
                                        +-----------------------------------+
```

The key structural difference: in `runc`, a container's syscalls reach the real host kernel directly, protected only by namespaces and cgroups. In gVisor, a container's syscalls terminate at Sentry — a Go program, not the kernel — and only a small, heavily filtered subset ever reaches the actual host kernel, through a seccomp filter that denies almost everything by default.

## Technical Configuration: Registering gVisor in Kubernetes and Docker

While Google Cloud Run abstracts this configuration automatically, engineers running self-managed Kubernetes or Docker clusters can run the gVisor runtime (`runsc`) to achieve Cloud Run-equivalent multi-tenant security.

### Docker Daemon Configuration: `/etc/docker/daemon.json`

To make Docker aware of the gVisor sandbox runtime, register `runsc` within the daemon configuration file:

```json
{
  "runtimes": {
    "runsc": {
      "path": "/usr/local/bin/runsc",
      "runtimeArgs": [
        "--debug",
        "--overlay2=true"
      ]
    }
  }
}
```

Apply this configuration and restart the Docker engine:

```bash
sudo systemctl restart docker
```

Now you can launch any Docker container wrapped in a secure user-space sandbox:

```bash
# Run container using the gVisor runtime
docker run --runtime=runsc -d -p 8080:8080 my-web-app
```

### Kubernetes Configuration: `RuntimeClass` and Pod Specs

In Kubernetes, you define a `RuntimeClass` resource that maps to the `runsc` handler, allowing developer workloads to selectively request sandboxing.

### `gvisor-runtime.yaml`

```yaml
# gvisor-runtime.yaml - Configures gVisor sandboxing for production clusters
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: gvisor
handler: runsc # Maps to the container runtime handler configured in containerd
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: secured-api-gateway
  namespace: security-zone
spec:
  replicas: 3
  selector:
    matchLabels:
      app: secured-api
  template:
    metadata:
      labels:
        app: secured-api
    spec:
      # CRITICAL: Enforce sandboxing by requesting the gvisor RuntimeClass
      runtimeClassName: gvisor
      containers:
      - name: untrusted-plugin-runner
        image: python:3.11-slim
        command: ["python", "-m", "http.server", "8080"]
        resources:
          limits:
            cpu: "1"
            memory: "512Mi"
          requests:
            cpu: "200m"
            memory: "128Mi"
```

By requesting the `gvisor` runtime class, containment shifts from basic Linux namespaces to a user-space kernel boundary, bringing Cloud Run's defense-in-depth isolation directly to enterprise clusters.

## Operational Best Practices

- **Audit syscall-heavy workloads**: Because gVisor intercepts system calls in user space, applications that execute high-frequency syscalls (rapid small disk reads, constant socket binding) will experience a measurable overhead (roughly 10-30% increase in CPU latency for syscall-bound code paths). Batch reads and use in-memory caches where possible.
- **Reserve `RuntimeClass: gvisor` for genuinely untrusted or multi-tenant workloads** (e.g., running third-party plugin code, processing untrusted uploads) — first-party, trusted services on a single-tenant cluster may not need the syscall-interception overhead.
- **Pair gVisor with network egress controls**: sandboxing constrains what a compromised container can do to the host kernel, but it does not by itself stop a compromised-but-sandboxed application from scanning your internal network — combine it with strict Shared VPC firewall rules.

## Key Takeaways

1. **`runc` isolates with namespaces and cgroups but still shares one kernel** — a kernel zero-day is a tenant-to-tenant breakout vector.
2. **gVisor's Sentry reimplements the Linux syscall surface in memory-safe Go, in user space** — the real host kernel only ever sees a small, filtered slice of syscalls.
3. **The Gofer isolates file I/O behind a 9P protocol socket**, so a compromised Sentry still cannot touch the host filesystem directly.
4. **You can get the same isolation model outside Cloud Run** by registering `runsc` with containerd/Docker and using a Kubernetes `RuntimeClass`, at the cost of roughly 10-30% syscall overhead.
