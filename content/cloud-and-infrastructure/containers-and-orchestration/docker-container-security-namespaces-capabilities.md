---
title: "Docker Container Security: Namespaces, Capabilities, and Hardened Images"
description: "Why containers are just processes sharing the host kernel, how Linux namespaces and capabilities create the isolation boundary, and how to build non-root, distroless, capability-dropped production images."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "DEEP_DIVE"
tags:
  - "docker"
  - "container-security"
  - "linux-namespaces"
  - "linux-capabilities"
  - "distroless"
  - "non-root"
  - "container-escape"
---

# Docker Container Security: Namespaces, Capabilities, and Hardened Images

A common mental model treats a Docker container like a lightweight virtual machine. That model is wrong in a way that has real security consequences.

A VM runs its own guest kernel on top of a hypervisor; the isolation boundary is enforced by CPU-level hardware virtualization. A container is a **standard Linux process** running directly on the host's shared kernel — nothing more.

```text
    [ VM 1 (Guest Kernel) ]  [ VM 2 (Guest Kernel) ]      [ Container 1 ]  [ Container 2 ]
    ------------------------------------------------      ---------------------------------
             [ Hypervisor / Hardware ]                        [ Shared Host Kernel ]
    ------------------------------------------------      ---------------------------------
                  [ Physical Host ]                               [ Physical Host ]
```

Because every container on a host shares one kernel, a process inside a container that runs as `root` (UID 0) has the *same UID 0* the host's real root user has. If that process is compromised — via a code execution bug, a kernel exploit, or a misconfiguration like a mounted Docker socket — the attacker is one step from full host compromise, not just "container" compromise. This is the difference between defense-in-depth done right and a single point of failure.

---

## The kernel primitives that create the container boundary

Containers don't exist as a first-class kernel object. They're assembled at runtime from three separate Linux features:

### 1. Namespaces — what a process can see

| Namespace | Clone flag | Isolates | Security benefit |
|---|---|---|---|
| PID | `CLONE_NEWPID` | Process IDs | Container processes can't see or signal host/sibling-container processes |
| NET | `CLONE_NEWNET` | Interfaces, ports, routing | Private loopback and IP space, no sniffing adjacent container traffic |
| MNT | `CLONE_NEWNS` | Mount points | Container's filesystem view is limited to its own root fs |
| IPC | `CLONE_NEWIPC` | SysV IPC, POSIX queues | Prevents shared-memory reads/writes across containers |
| UTS | `CLONE_NEWUTS` | Hostname, NIS domain | Each container gets its own hostname |
| USER | `CLONE_NEWUSER` | UID/GID mapping | Maps an unprivileged host UID to root (UID 0) inside the container |

### 2. Cgroups — how much a process can consume

Cgroups bound CPU and memory so one compromised or leaking container can't starve or crash the host (covered in depth in the companion article on Docker resource limits). A container that hits its memory ceiling is killed inside its own cgroup boundary — the host stays up.

### 3. Capabilities — which privileged actions are allowed

Rather than an all-or-nothing root model, Linux splits superuser power into ~40 discrete **capabilities** (`CAP_NET_BIND_SERVICE`, `CAP_SYS_ADMIN`, `CAP_CHOWN`, etc.). Docker drops the most dangerous ones by default (notably `CAP_SYS_ADMIN`, which allows mounting filesystems and bypassing many kernel security checks) but retains a broader default set than most production workloads actually need.

```text
                            OFFICE BUILDING (Host Server)
                                         |
                ===================================================
                |                                                 |
         [ Virtual Machines ]                            [ Containers ]
                |                                                 |
   Separate buildings: own plumbing,               Rooms on the same floor, sharing
   electrical, security (high isolation,            hallways and foundation (low
   heavy cost).                                     overhead, needs strong locks).
```

Namespaces are the walls of the rented office. Cgroups are the utility limits. Root execution is handing every tenant a master keycard — if one tenant is compromised, they can walk into anyone else's office.

---

## From vulnerable to hardened: a real Dockerfile transformation

### The vulnerable baseline

```dockerfile
# VULNERABLE DOCKERFILE
FROM python:3.11  # ~900MB base: compilers, shells, package managers included

WORKDIR /app
COPY . /app                              # copies test suites, .git, secrets indiscriminately
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 80
CMD ["python", "app.py"]                 # runs as root by default
```

Everything an attacker needs to pivot after a code-execution bug — a shell, `curl`, a compiler — ships in the production image for free.

### The hardened production image

```dockerfile
# --- STAGE 1: BUILDER ---
FROM python:3.11-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /build/wheels -r requirements.txt

# --- STAGE 2: RUNTIME (hardened) ---
FROM gcr.io/distroless/python3:nonroot
WORKDIR /app
COPY --from=builder /build/wheels /wheels
COPY --from=builder /build/wheels/requirements.txt .
COPY app.py .
ENV PYTHONPATH=/wheels

# distroless/python3:nonroot runs as UID 65532 automatically — no USER directive needed
EXPOSE 8080
ENTRYPOINT ["/usr/bin/python3", "app.py"]
```

Three structural changes did the work:

1. **Multi-stage build** — compilers and build tooling never leave the `builder` stage; only compiled wheels and application code cross into the runtime image.
2. **Distroless base** — no shell, no package manager, no debugger binaries. Even a full RCE gives an attacker no interactive foothold to escalate from.
3. **Non-root execution** — the distroless `nonroot` variant runs as a fixed high UID by default, so even without a shell, the process never holds the host's root UID.

---

## Runtime hardening flags

Hardening the Dockerfile isn't sufficient on its own — the runtime invocation matters just as much:

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

- **`--read-only`** — mounts the entire root filesystem read-only. A dropped reverse-shell binary or overwritten config file simply fails to write.
- **`--tmpfs /tmp:rw,noexec,nosuid`** — provides the writable scratch space most apps still need, but `noexec` blocks anything written there from being executed, and `nosuid` blocks setuid-based privilege escalation from that mount.
- **`--cap-drop=ALL` + `--cap-add=NET_BIND_SERVICE`** — start from zero privileges and add back only what's actually required (here, just the ability to bind a low port).
- **`--security-opt=no-new-privileges:true`** — blocks any privilege escalation via `setuid`/`setgid` binaries even if one is present.

---

## Two misconceptions worth correcting

**"An up-to-date kernel means container escape is impossible."** Patched kernels close zero-days, but the overwhelming majority of real-world escapes are *configuration* failures, not kernel exploits — most commonly mounting `/var/run/docker.sock` into a container. Since the Docker daemon runs as root, socket access is equivalent to host root: `docker run -v /:/host_root -it ubuntu bash` from inside that container reaches straight past the isolation boundary.

**"Alpine is always the more secure base."** Alpine's 5MB footprint is real, but it swaps `glibc` for `musl libc`, which has caused subtle memory and performance regressions in compiled Python/Java/C++ binaries that assume glibc semantics. For enterprise workloads, a glibc-based **distroless** image is often the better security/compatibility trade-off, not Alpine by default.

---

## Pause and think

If a non-root container (`UID 10001`) writes files into a host bind-mount (`-v /host/data:/container/data`), who owns those files on the host?

**Answer:** the host files are owned by raw UID `10001`. Container UIDs map directly onto host UIDs — there's no automatic translation. If the host has no user with that UID, the files show up owned by a bare numeric ID, which can break host-side tooling that expects a named owner. (User namespace remapping, covered in the companion rootless-Docker article, is what actually decouples container UIDs from host UIDs.)

---

## Key takeaways

- A container is a normal Linux process; the isolation boundary is namespaces + cgroups + capabilities, not a hardware hypervisor.
- Root inside a container is UID 0 on the host's kernel — treat any root-running container as a live host-root exposure.
- Multi-stage builds into a distroless, non-root final stage eliminate the shell and toolchain an attacker needs post-exploitation.
- `--cap-drop=ALL` plus an explicit, minimal `--cap-add` list, `--read-only`, and `--security-opt=no-new-privileges` should be the default runtime posture, not an opt-in.
- Never mount `/var/run/docker.sock` into an application container — it is functionally equivalent to handing that container root on the host.
