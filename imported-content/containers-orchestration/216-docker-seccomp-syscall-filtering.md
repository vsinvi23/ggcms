# Docker Seccomp Profiles: Filtering Linux System Calls to Prevent Container Escapes

## The Problem: The Attack Surface of the Linux Kernel

Containers are not virtual machines. They do not have their own isolated guest operating system or kernel. Instead, all containers running on a host share the exact same underlying Linux kernel. 

When a process inside a container needs to perform a privileged operation—such as reading a file, opening a network socket, changing permissions, or allocating memory—it must ask the shared host kernel to perform the action on its behalf. It does this by executing a **System Call (syscall)**.

The Linux kernel supports over 300 different syscalls. Many of these are obscure, highly privileged, or poorly tested legacy functions (like `bpf`, `ptrace`, `unshare`, or `mount`). If a vulnerability exists in how the kernel handles one of these obscure syscalls, an attacker who compromises a container can execute that syscall to crash the host kernel, manipulate host memory, or escape the container boundary entirely. The massive number of available syscalls creates a dangerously large attack surface.

## The Solution: Seccomp (Secure Computing Mode)

**Seccomp** is a Linux kernel security feature that acts as a strict syscall firewall. It allows administrators to define a profile that explicitly dictates exactly which system calls a process is allowed to make. If a process attempts to execute a syscall that is not permitted by the profile, the kernel intercepts the request and instantly kills the process (via `SIGKILL`) or returns a permission denied error.

By applying Seccomp profiles to Docker containers, we drastically reduce the attack surface. Instead of having access to 300+ syscalls, a containerized web application can be restricted to the bare minimum required to function (e.g., `read`, `write`, `socket`, `bind`), completely neutralizing classes of kernel vulnerabilities.

### The Mental Model: The Syscall Whitelist

Imagine the kernel as a highly secure vault, and syscalls as the individual transaction windows.

```text
[ Malicious Container ] 
        |
        |---> Attempts `mount()` syscall
        |
    [ Seccomp Filter ]  <--- (Checks Profile: `mount` is DENIED)
        |
    (DENIED / SIGKILL)
        |
[ Shared Host Linux Kernel ]
```

By default, the container cannot reach the `mount` function inside the kernel because the Seccomp filter blocks the path.

## The Default Docker Seccomp Profile

Docker enables Seccomp by default on all containers (provided the host kernel supports it). Out of the box, Docker applies a highly researched default profile that strikes a balance between robust security and broad application compatibility.

The default Docker profile blocks approximately 44 of the 300+ syscalls. 
Critically, it blocks syscalls that are almost never needed by standard applications but are heavily utilized in container escape exploits:
- **`mount`, `umount2`**: Prevents the container from mounting host filesystems.
- **`ptrace`**: Prevents processes from tracing and inspecting the memory of other processes.
- **`unshare`, `clone`**: Prevents the creation of new namespaces.
- **`bpf`**: Prevents the loading of eBPF programs.
- **`reboot`**: Prevents the container from rebooting the host.

You can verify that Seccomp is running by inspecting a container:

```bash
docker inspect my_container --format '{{.HostConfig.SecurityOpt}}'
# Output: [seccomp=unconfined] (If disabled) or standard output if default is applied.
```

## Creating Custom Seccomp Profiles

While the default profile is excellent, highly secure environments require **Least Privilege**. A Node.js API does not need 250 syscalls; it might only need 50. 

You can create a custom Seccomp profile using a JSON file. A profile consists of a default action (usually `SCMP_ACT_ERRNO` to deny by default) and a whitelist of allowed syscalls.

### Example: A Highly Restrictive Profile

Below is a conceptual snippet of a custom `seccomp.json` profile that blocks everything by default, explicitly allowing only `read`, `write`, `exit`, and `sigreturn`:

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

To apply this custom profile to a container, you use the `--security-opt` flag when launching the container:

```bash
docker run --rm -it --security-opt seccomp=/path/to/custom/seccomp.json alpine sh
```

If you try to execute a command that requires a blocked syscall (like `ls` which requires `open` and `getdents`), the kernel will immediately kill the command with an `Operation not permitted` error.

## Bypassing Seccomp (The Danger of `--privileged`)

It is crucial to understand that running a container with the `--privileged` flag entirely disables the Seccomp profile (along with AppArmor and dropping capability restrictions). 

```bash
# This disables the Seccomp firewall!
docker run --rm -it --privileged ubuntu bash
```

A `--privileged` container has nearly identical access to the kernel as a root process on the host. This flag should be strictly prohibited in production environments.

## Conclusion

Seccomp is a foundational pillar of container security. By filtering the communication channel between the container and the shared host kernel, Seccomp profiles limit the blast radius of a compromised application. While Docker's default profile provides excellent baseline protection, mastering custom Seccomp profiles allows architects to implement true least-privilege computing, rendering entire categories of zero-day kernel exploits useless against your infrastructure.