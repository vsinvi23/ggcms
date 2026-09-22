# GCP Cloud Run Internals: Sandboxing Container Runtimes with gVisor

## The Problem: The Shared Kernel Vulnerability
Containers (like Docker) are not virtual machines; they are merely isolated processes running on a shared Linux kernel. They utilize kernel features like `cgroups` for resource limits and `namespaces` for isolation. 
However, if a malicious payload inside a container finds an unpatched zero-day vulnerability in the host Linux kernel (e.g., a privilege escalation bug in the network stack or filesystem drivers), the attacker can break out of the container, compromise the host, and potentially access data belonging to other tenants running containers on that same physical machine. In a serverless, multi-tenant environment like GCP Cloud Run, this shared-kernel risk is unacceptable.

## The Solution: gVisor Sandboxing
To provide VM-level security with container-level speed and efficiency, Google developed **gVisor**. When you deploy a container to Cloud Run, it does not run directly on the host's Linux kernel. Instead, it runs inside a gVisor sandbox. 
gVisor acts as a user-space kernel. It intercepts system calls made by the containerized application and implements them safely in user space, heavily restricting the container's access to the actual host kernel.

### Architecture Breakdown

```text
+-----------------------------------------------------------------+
|                         Physical Host                           |
|                                                                 |
|  +-----------------------+           +-----------------------+  |
|  |       Tenant A        |           |       Tenant B        |  |
|  |  +-----------------+  |           |  +-----------------+  |  |
|  |  | App Container   |  |           |  | App Container   |  |  |
|  |  | (Node.js/Python)|  |           |  | (Go/Java)       |  |  |
|  |  +--------|--------+  |           |  +--------|--------+  |  |
|  |           v Syscalls  |           |           v Syscalls  |  |
|  |  +-----------------+  |           |  +-----------------+  |  |
|  |  |     gVisor      |  |           |  |     gVisor      |  |  |
|  |  |    (Sentry)     |  |           |  |    (Sentry)     |  |  |
|  |  | User-Space OS   |  |           |  | User-Space OS   |  |  |
|  |  +--------|--------+  |           |  +--------|--------+  |  |
|  +-----------|-----------+           +-----------|-----------+  |
|              | Limited, Filtered Syscalls        |              |
|              v                                   v              |
|  +-----------------------------------------------------------+  |
|  |                    Host Linux Kernel                      |  |
|  +-----------------------------------------------------------+  |
+-----------------------------------------------------------------+
```

### Technical Implementation

gVisor consists of two primary components designed to provide defense-in-depth:

#### 1. The Sentry (The User-Space Kernel)
When the application inside the container attempts to make a system call (e.g., `open()`, `read()`, `socket()`), it is trapped by the Sentry. 
The Sentry is written in Go (providing memory safety) and implements a substantial portion of the Linux system call API entirely in user space. For example, if the app wants to allocate memory or manage a TCP connection, the Sentry's internal user-space network stack (Netstack) handles it without ever bothering the host kernel. 
To the application, the Sentry *is* the Linux kernel. It is largely completely unaware that it is being sandboxed.

#### 2. The Gofer (Secure File System Access)
File system operations are particularly dangerous. To mitigate this, gVisor uses a separate process called the Gofer. The Sentry does not have direct access to the host file system. When the app needs to read a file, the Sentry communicates with the Gofer via a 9P protocol connection. The Gofer, which runs with heavily restricted privileges, performs the actual file read and passes the data back to the Sentry.

### Security Impact and Trade-offs

#### The Security Win: Seccomp Filtering
Because the Sentry handles most syscalls internally, the surface area exposed to the actual Host Linux Kernel is drastically reduced. gVisor applies strict `seccomp` (secure computing mode) filters to the Sentry itself. While a normal container might have access to hundreds of Linux system calls, the Sentry is restricted to a few dozen highly scrutinized calls necessary for its operation. 
If an attacker compromises the Sentry, they are still trapped; they cannot easily pivot to compromise the host kernel because the Sentry's own access to the host kernel is mathematically bounded.

#### The Performance Trade-off
Intercepting and emulating system calls in user space introduces latency. Applications that are highly syscall-intensive (e.g., heavily relying on I/O or rapid file system access) will experience a performance penalty in Cloud Run compared to running on a bare-metal kernel. However, for most web APIs, microservices, and event-driven workloads, this overhead is negligible, and the resulting multi-tenant security isolation is what makes serverless platforms like Cloud Run viable for enterprise adoption.
