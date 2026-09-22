# Docker Container Security: Hardening Images, Rootless Execution, and Linux Namespaces

> Unpack the underlying Linux Kernel primitives (Namespaces, Cgroups, and Capabilities) that define container boundaries, and learn how to engineer hardened, non-root, minimal image architectures in production.

---

## What We Are Going to Learn

In this deep-dive guide, we will step beneath the Docker CLI to understand the containerization model from a Linux Systems Engineering and Security perspective.

Specifically, we will cover:
1. **The Linux Kernel primitives** (Namespaces and Control Groups) that isolate processes on a shared host.
2. **The security risks of Container Escapes** caused by running containerized processes as `root`.
3. **Image Hardening patterns**, comparing standard base images with Alpine and "Distroless" architectures.
4. **Hands-on Docker configurations** demonstrating how to restrict system capabilities, enforce non-root execution, and mount read-only filesystems.

---

## The Problem: The "Container Isolation" Illusion

Many developers think of a Docker container as a lightweight Virtual Machine (VM). This is a dangerous mental model.

A Virtual Machine runs on top of a Hypervisor (like ESXi, Hyper-V, or KVM). It contains its own **entire guest operating system kernel**. The boundary between the VM and the host is a hard hardware-virtualization barrier managed by the CPU.

A Container, however, is merely a **standard Linux process** running directly on the **host's shared kernel**.

```
    [ VM 1 (Guest Kernel) ]  [ VM 2 (Guest Kernel) ]      [ Container 1 ]  [ Container 2 ]
    ------------------------------------------------      ---------------------------------
             [ Hypervisor / Hardware ]                        [ Shared Host Kernel ]
    ------------------------------------------------      ---------------------------------
                  [ Physical Host ]                               [ Physical Host ]
```

### The Security Risk
Because containers share the same host kernel, any process inside a container that executes with administrative (`root`) privileges has the exact same user ID (`UID 0`) as the host's root user. 

If an attacker compromises a containerized application running as root and discovers a kernel exploit (like Dirty COW) or a configuration leak (like mounting the host's `/var/run/docker.sock`), they can instantly execute a **Container Escape**, gaining full root execution on the physical host machine, compromising all other sibling containers.

---

## Why the Problem Is Hard: Balancing Operational Capabilities with Least Privilege

By default, Docker containers run processes as the `root` user and grant a generous set of default Linux **Capabilities** (such as raw network socket access or system clock readings).

Restricting these permissions is hard because:
* Many open-source container images (like official Node, Python, or Java images) default to running as root inside the container, forcing developers to actively configure security overrides.
* Restricting capabilities can break applications in silent ways. For example, dropping `CAP_NET_BIND_SERVICE` prevents a web server from binding to ports lower than 1024 (like port 80 or 443), causing the container to crash on start.

---

## A Simple Mental Model: The Shared Office Building

Think of container security like renting space in a shared office building:

```
                            OFFICE BUILDING (Host Server)
                                         |
                ===================================================
                |                                                 |
         [ Virtual Machines ]                            [ Containers ]
                |                                                 |
   Each business has their own separate           Businesses rent rooms on the same floor.
   building with private security, plumbing,      They share the same air conditioning,
   and electrical grids (High isolation,          hallways, and foundation (Low overhead,
   heavy cost).                                   requires strong lockable doors).
```

* **Namespaces** are the walls of the rented office rooms: they keep you from seeing other businesses' desks, files, and employees.
* **Control Groups (cgroups)** are the utility limits: they prevent one business from consuming all the building's water or electricity, starving everyone else.
* **Root Execution** is like giving a tenant a master master-keycard: if they turn malicious or get compromised, they can walk into any other office on the floor.

---

## Under the Hood: The Linux Kernel Primitives

Containers are not first-class physical entities in Linux. They are constructed dynamically using three kernel isolation features:

### 1. Namespaces (Who can see what)
Namespaces wrap a global system resource in an abstraction that makes it appear private to the processes inside the namespace. There are 6 main namespaces:

| Namespace | CLONE Flag | Isolates | Security Benefit |
| :--- | :--- | :--- | :--- |
| **PID** | `CLONE_NEWPID` | Process IDs | Processes inside the container cannot see or kill processes running on the host or in other containers. |
| **NET** | `CLONE_NEWNET` | Network devices, ports, routing | Each container gets its own loopback device and private IP address space, preventing unauthorized sniffing of adjacent network traffic. |
| **MNT** | `CLONE_NEWNS` | File system mount points | Restricts the container's view of the disk to its own root filesystem, hiding the host's operating system files. |
| **IPC** | `CLONE_NEWIPC` | System V IPC, POSIX message queues | Prevents container processes from using shared memory segments to read/write data in other containers. |
| **UTS** | `CLONE_NEWUTS` | Hostnames and NIS domain names | Allows each container to have its own hostname. |
| **USER** | `CLONE_NEWUSER`| User and Group IDs | Maps a non-privileged host user (e.g., UID 10001) to UID 0 (root) inside the container, neutralizing host attacks if a container escape occurs. |

### 2. Control Groups / cgroups (Who can consume how much)
Cgroups enforce physical resource limits on a process group:
* **Memory Limits:** Restricts the RAM the container can consume. If a container exceeds its limit, it is terminated by the kernel's Out-Of-Memory (OOM) killer, preventing a single compromised container from crashing the host.
* **CPU Shares:** Restricts the CPU cycles allocated to the container, preventing Denial of Service (DoS) CPU-exhaustion attacks.

### 3. Linux Capabilities (What actions can they perform)
Instead of an all-or-nothing root model, Linux divides superuser privileges into discrete units called **Capabilities**. 
By default, Docker drops dangerous capabilities (like `CAP_SYS_ADMIN` which allows mounting filesystems or bypassing security checks) but retains others (like `CAP_CHOWN` or `CAP_SETUID`). A hardened container should drop all default capabilities and explicitly add back only what is required.

---

## Hands-On Dockerfiles: From Vulnerable Root to Hardened Distroless

Let's walk through an insecure Dockerfile and transform it into an elite, secure, production-hardened configuration.

### The Insecure Vulnerable Approach
This Dockerfile runs a simple Python API. It runs as `root`, installs developer packages in production, and uses a bloated base image containing compilers, debuggers, and curl—giving an attacker a fully stocked toolkit if they gain remote execution.

```dockerfile
# VULNERABLE DOCKERFILE
FROM python:3.11  # Bloated base image (approx. 900MB) containing compilers and utilities

WORKDIR /app

# Copy all source files (including unnecessary test suites or secrets)
COPY . /app

# Install dependencies as root
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 80

# Starts the process as ROOT inside the container!
CMD ["python", "app.py"]
```

---

### The Hardened Production-Ready Approach
This Dockerfile implements absolute best practices:
1. **Multi-Stage Build:** Uses a builder stage with compilers to build dependencies, then copies only the compiled runtime files to the final minimal stage, eliminating compile-time tools from the production image.
2. **Minimal Base Image:** Uses a **Distroless** or minimal Alpine runtime, which contains no shell (`/bin/sh` or `/bin/bash`), package managers, or debuggers, drastically reducing the image's attack surface.
3. **Non-Root Execution:** Explicitly creates and switches to a system user with a high UID (`UID 10001`), ensuring that the process does not run as root.

```dockerfile
# --- STAGE 1: BUILDER ---
FROM python:3.11-slim AS builder

WORKDIR /build

COPY requirements.txt .
# Install dependencies into a localized wheelhouse directory
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /build/wheels -r requirements.txt


# --- STAGE 2: RUNTIME (Hardened) ---
# We use a distroless python base image (No shell, no package managers, extremely secure)
FROM gcr.io/distroless/python3:nonroot

WORKDIR /app

# Copy compiled dependencies from the builder stage
COPY --from=builder /build/wheels /wheels
COPY --from=builder /build/wheels/requirements.txt .
# Copy only application files
COPY app.py .

# Configure python path to find our pre-built dependencies
ENV PYTHONPATH=/wheels

# The distroless python image automatically runs under a 'nonroot' system user (UID 65532).
# This guarantees that even if an attacker executes code, they lack superuser privileges.

EXPOSE 8080

ENTRYPOINT ["/usr/bin/python3", "app.py"]
```

---

## Securing Containers at Runtime: Dropping Capabilities and Read-Only Files

Even with a hardened Dockerfile, you should enforce strict security constraints when starting your container via the Docker CLI or Kubernetes Pod manifests.

### Enforcing Least Privilege via CLI
When running your container, use these flags to strip privileges:

```bash
docker run -d \
  --name secure_api \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid \
  --cap-drop=ALL \
  --cap-add=NET_BIND_SERVICE \
  --security-opt=no-new-privileges:true \
  -p 8080:8080 \
  my-secure-app:latest
```

### Flag Breakdown

* **`--read-only`**: Mounts the container's entire root filesystem as **read-only**. If an attacker attempts to download a malicious payload (like a reverse shell binary) or overwrite system files, the OS blocks the write operation.
* **`--tmpfs /tmp:rw,noexec,nosuid`**: Because the filesystem is read-only, we mount a small in-memory `/tmp` folder for application caching. We configure it with `noexec` (preventing any files inside `/tmp` from being executed) and `nosuid` (preventing privilege-escalation binaries).
* **`--cap-drop=ALL`**: Drops **every single** Linux capability, stripping the superuser of all raw kernel privileges.
* **`--cap-add=NET_BIND_SERVICE`**: Explicitly adds back *only* the single capability needed to bind to network ports.
* **`--security-opt=no-new-privileges:true`**: Prevents processes inside the container from gaining new privileges (e.g., using `setuid` binaries or execution overrides).

---

## Common Misconceptions

### Misconception 1: "Docker container escape is impossible if my kernel is up-to-date."
**Reality:** While keeping the host kernel patched mitigates zero-day exploits, most container escapes are caused by **misconfigurations**. For example, mounting the host's docker socket (`-v /var/run/docker.sock:/var/run/docker.sock`) inside a container allows any process inside that container to send commands to the host's Docker daemon, enabling them to spin up a new privileged container that mounts the host's entire root disk, escaping instantly.

### Misconception 2: "Alpine Linux is always the most secure base image."
**Reality:** Alpine is excellent because of its small size (5MB). However, Alpine uses `musl libc` instead of the standard `glibc` used by Debian/Ubuntu. This can cause subtle, hard-to-detect memory bugs or performance regressions in Python, Java, or C++ binaries compiled for `glibc`. For enterprise production, **Distroless slim** images compiled with `glibc` represent a more compatible and secure choice.

---

## Pause and Think

> **Critical Question:** If your Docker container runs as a non-root user (`UID 10001`), but you mount a host directory using `-v /host/data:/container/data`, who owns the newly created files on the host system?

### Answer
The host files will be owned by **UID 10001**. 

Because containers share the same kernel, UIDs are mapped directly. If the host system does not have a user with UID 10001, the files on the host will display the raw owner ID `10001` instead of a username. This can cause permission denied errors when other host processes attempt to access them.

---

## Key Takeaways

* **Containers are standard Linux processes** isolated by Kernel Namespaces, Cgroups, and Capabilities.
* **Running as root inside a container represents a massive escape risk**, as it shares the superuser UID 0 with the host.
* **Hardened multi-stage builds** combined with **Distroless** base images reduce the image's attack surface to the bare minimum.
* Enforce **read-only filesystems** and **drop all capabilities** at the runtime level to block payload execution.

---

## What to Learn Next

To expand your container orchestration and DevSecOps engineering expertise, explore:
* **Kubernetes Pod Security Standards (PSS) and Admission Controllers (OPA/Gatekeeper).**
* **Container runtime sandboxing using gVisor (Google's user-space kernel shim) or Kata Containers.**
* **Implementing automated container vulnerability scanning in your CI/CD pipelines (Trivy, Grype).**
