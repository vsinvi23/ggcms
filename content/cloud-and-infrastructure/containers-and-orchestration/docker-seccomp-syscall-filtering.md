---
title: "Docker Seccomp Profiles: Restricting Syscalls to Shrink the Kernel Attack Surface"
description: "How Seccomp filters the syscall interface between containers and the shared host kernel, what Docker's default profile actually blocks, and how to author a custom least-privilege syscall whitelist."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "DEEP_DIVE"
tags:
  - "docker"
  - "seccomp"
  - "syscalls"
  - "container-security"
  - "linux-kernel"
---

# Docker Seccomp Profiles: Restricting Syscalls to Shrink the Kernel Attack Surface

Containers share one kernel across every workload on a host. Every "privileged" thing a containerized process does — read a file, open a socket, allocate memory — is ultimately a **system call** into that shared kernel. The Linux kernel exposes over 300 of these syscalls, and a meaningful fraction are obscure, rarely used by ordinary applications, and disproportionately represented in real container-escape and privilege-escalation exploits: `mount`, `ptrace`, `bpf`, `unshare`, `clone` with certain flags.

A compromised container that can freely call any of these has a much larger toolkit for escalating beyond "arbitrary code execution in this one container" into "kernel memory corruption" or "escape the container boundary." **Seccomp (Secure Computing Mode)** closes that gap by turning the syscall interface into an explicit whitelist.

---

## The mental model

```text
[ Malicious Container ]
        |
        |---> attempts mount() syscall
        |
    [ Seccomp Filter ]  <--- checks profile: mount() is DENIED
        |
    (SIGKILL / EPERM)
        |
[ Shared Host Linux Kernel ]
```

Seccomp sits between the container process and the kernel's syscall table. If a syscall isn't on the allowed list, the kernel either kills the calling process outright (`SCMP_ACT_KILL`) or returns a permission error (`SCMP_ACT_ERRNO`) — the syscall never actually executes, so a vulnerable kernel code path behind that syscall is simply unreachable.

---

## Docker's default profile

Docker applies Seccomp by default on every container (when the host kernel supports it), and the default profile blocks roughly 44 of the 300+ available syscalls — specifically the ones almost never needed by ordinary applications but heavily represented in known escape techniques:

- **`mount`, `umount2`** — prevents mounting host filesystems from inside the container.
- **`ptrace`** — prevents tracing or inspecting the memory of other processes (used in many privilege-escalation chains).
- **`unshare`, `clone`** (with namespace-creating flags) — prevents spawning new namespaces from within an already-running container.
- **`bpf`** — prevents loading eBPF programs into the kernel.
- **`reboot`** — prevents a container from rebooting the host.

Verify whether Seccomp is active on a running container:

```bash
docker inspect my_container --format '{{.HostConfig.SecurityOpt}}'
# [] means the default profile is applied; [seccomp=unconfined] means it's disabled
```

---

## Writing a custom, least-privilege profile

The default profile is a broad, application-agnostic baseline. A specific service — say, a stateless Node.js API doing nothing but `read`/`write`/`accept` on sockets — needs far fewer than the ~260 syscalls the default profile still permits. A custom profile lets you whitelist only what that specific workload uses.

```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "architectures": [
    "SCMP_ARCH_X86_64",
    "SCMP_ARCH_X86"
  ],
  "syscalls": [
    {
      "names": [
        "read",
        "write",
        "exit",
        "rt_sigreturn"
      ],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}
```

`defaultAction: SCMP_ACT_ERRNO` means anything not explicitly listed is denied by default — a deny-by-default posture, not an allow-by-default one with a blocklist. Apply it at container startup:

```bash
docker run --rm -it --security-opt seccomp=/path/to/custom/seccomp.json alpine sh
```

With only `read`/`write`/`exit`/`rt_sigreturn` allowed, even `ls` fails immediately — it needs `open`/`getdents`, neither of which is whitelisted:

```text
Operation not permitted
```

In practice, building a real production profile means running the application under a syscall tracer (`strace -c`, or Docker's own `--security-opt seccomp=unconfined` combined with an auditing tool) to enumerate the actual syscalls it uses in normal operation, then whitelisting exactly that set — not hand-guessing.

---

## The one flag that disables all of this: `--privileged`

```bash
# This disables Seccomp entirely — along with AppArmor and all capability drops
docker run --rm -it --privileged ubuntu bash
```

A `--privileged` container has access to the host kernel nearly indistinguishable from a root process running directly on the host. Every mitigation covered above — Seccomp filtering, capability restrictions, AppArmor/SELinux profiles — is bypassed simultaneously. This flag has essentially no legitimate use case in production and should be treated as equivalent to disabling container security entirely.

---

## Key takeaways

1. Seccomp filters the *syscall interface*, not files or network — it closes off kernel code paths a compromised container could otherwise reach, independent of what capabilities or namespaces it has.
2. Docker's default profile blocks ~44 high-risk syscalls (`mount`, `ptrace`, `bpf`, `unshare`, `reboot`) and is a reasonable baseline — but it still allows far more than most single-purpose services need.
3. A least-privilege custom profile should default-deny (`SCMP_ACT_ERRNO`) and whitelist only the syscalls the specific workload actually issues, derived empirically rather than assumed.
4. `--privileged` disables Seccomp (and every other container security mechanism) simultaneously — never use it in production.
