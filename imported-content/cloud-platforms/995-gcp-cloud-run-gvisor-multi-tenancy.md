# GCP Cloud Run Internals: Sandboxing Container Runtimes with gVisor

## The Problem: The Inherent Vulnerability of Shared-Kernel Containers

Serverless containers running in multi-tenant environments (such as GCP Cloud Run) must execute arbitrary, untrusted customer code on shared physical hosts. 

In traditional containerization engines like Docker or standard Kubernetes (utilizing `runc`), containers are not true virtual machines. They are simply isolated namespaces (namespaces, cgroups, chroot) running directly on the **host Linux kernel**. 

```
Shared-Kernel Container Vulnerability:
+-------------------------------------------------------------+
| Untrusted Container A       | Untrusted Container B         |
|                             |                               |
|  * Executes sys_ptrace()    |  * Thinks it is isolated      |
|  * Exploits Host Kernel CVE |                               |
+-----------------------------+-------------------------------+
|                        Shared Host Kernel                   |
|                        (Compromised via Kernel Panic/Exploit) |
+-------------------------------------------------------------+
|                        Physical Hardware                    |
+-------------------------------------------------------------+
```

This architecture is fundamentally flawed for serverless multi-tenancy:
1. **Host Kernel Attack Surface:** The Linux kernel exposes over 300 system calls (`syscalls`). If a containerized application exploits a zero-day vulnerability in the host kernel, it can break out of its namespace container boundary, gain host root access, and intercept memory or secrets belonging to other tenants.
2. **Resource Exhaustion:** A rogue process can execute loops of complex kernel operations (such as deep network socket allocations), locking up kernel threads and denying service to other workloads sharing the physical CPU.

---

## The Solution: GCP Cloud Run Sandboxing with gVisor

To eliminate this threat, GCP Cloud Run executes every container instance inside **gVisor**, a security-hardened, user-space sandbox container runtime.

gVisor replaces the shared host kernel model with a secure user-space kernel (called the **Sentry**) and an isolated filesystem proxy (called the **Gofer**).

```
gVisor Sandboxed Container Architecture:
+-------------------------------------------------------------+
| App Container (User Space Process)                          |
+-------------------------------------------------------------+
         | (Attempts syscall: e.g., open(), socket())
         v
+-------------------------------------------------------------+
| gVisor SENTRY (User-Space Kernel)                           |
|                                                             |
| * Intercepts 100% of syscalls in User-Space                 |
| * Emulates Linux kernel behavior in memory-safe Go          |
| * Does NOT forward raw syscalls to host                     |
+-------------------------------------------------------------+
       /                                         \
      / (Requires File I/O)                       \ (Allowed: Minimal Host Syscalls)
     v                                             v
+-------------------------+               +------------------+
| gVisor GOFER            |               | Host Kernel      |
| (Secure FS Proxy)       |               | (Only 20-30      |
| * Sanitizes reads/writes|               |  syscalls exposed|
+-------------------------+               +------------------+
```

### The Sentry: The Core Sandbox
The **Sentry** is a complete, lightweight operating system kernel written in Go. It runs in user-space, intercepting and emulating all system calls made by the application container. 

For example, when an application calls `socket()`, the Sentry interceptor catches it, manages the network state-machine entirely in memory-safe Go, and prevents the request from directly calling the host kernel's networking stack.

### The Gofer: Filesystem Isolation
The **Gofer** is an independent process that provides filesystem access to the Sentry using the 9P transport protocol. Sentry cannot read or write to the host filesystem directly; it must send structured messages to Gofer, which strictly validates, filters, and logs all path traversals.

---

## Technical Concept: Implementing a Syscall Interceptor via ptrace

gVisor intercepts syscalls using various platforms under the hood, such as KVM or `ptrace`. 

To understand how system call interception works at a low level, we can write a C program that utilizes the Linux `ptrace` system call with the `PTRACE_SYSCALL` flag. This program launches a child process (the "untrusted container app") and intercepts every system call it attempts, letting a monitor inspect or block the call before it ever touches the OS kernel.

```c
#include <stdio.h>
#include <stdlib.h>
#include <sys/ptrace.h>
#include <sys/syscall.h>
#include <sys/user.h>
#include <sys/wait.h>
#include <unistd.h>

int main() {
    pid_t child = fork();

    if (child == 0) {
        // --- CHILD PROCESS (Simulating Untrusted Container App) ---
        ptrace(PTRACE_TRACEME, 0, NULL, 0);
        // Trigger a system call (write)
        printf("Container execution: Hello from isolated application!\n");
        exit(0);
    } else {
        // --- PARENT PROCESS (Simulating gVisor Sentry Monitor) ---
        int status;
        struct user_regs_struct regs;

        waitpid(child, &status, 0);
        if (WIFEXITED(status)) return 0;

        // Trace child system calls
        while (1) {
            // Wait for system call entry
            ptrace(PTRACE_SYSCALL, child, NULL, NULL);
            waitpid(child, &status, 0);
            if (WIFEXITED(status)) break;

            // Extract registers containing the system call number and parameters
            ptrace(PTRACE_GETREGS, child, NULL, &regs);

            // On x86_64: orig_rax holds the system call ID
            long syscall_num = regs.orig_rax;

            if (syscall_num == SYS_write) {
                printf("[gVisor Sentry] INTERCEPTED: Write System Call Detected. Inspecting payload safety...\n");
            } else if (syscall_num == SYS_ptrace || syscall_num == SYS_keyctl) {
                // BLOCK unsafe system calls by rewriting register to invalid syscall ID
                printf("[gVisor Sentry] SECURITY ALERT: Unsafe system call %ld blocked!\n", syscall_num);
                regs.orig_rax = -1; // Set to invalid syscall number
                ptrace(PTRACE_SETREGS, child, NULL, &regs);
            }

            // Wait for system call exit
            ptrace(PTRACE_SYSCALL, child, NULL, NULL);
            waitpid(child, &status, 0);
            if (WIFEXITED(status)) break;
        }
    }
    return 0;
}
```

---

## Architectural Performance Profile

While gVisor introduces a tiny latency overhead for system-call heavy operations (since syscall emulation runs in user space rather than directly on host CPU microcode), it provides unparalleled isolation:

* **Minimal Host Attack Surface:** Sentry only utilizes roughly 20 core host system calls to manage its memory and execution pools, compared to the 300+ standard calls exposed by a container running `runc`.
* **Zero Host Impact on Escape Exploits:** Even if an attacker finds a vulnerability in the emulated user-space kernel (Sentry), they only escape into the Sentry process space itself, which is further jailed by native Linux namespaces, cgroups, and a strict Seccomp filter. The underlying host kernel remains completely unexposed.
