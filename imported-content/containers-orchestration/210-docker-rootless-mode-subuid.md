# Rootless Docker: Hardening Daemons with User Namespaces and subuid/subgid Mapping

## The Problem: The Daemon Privilege Escalation Vector

Historically, the Docker daemon (`dockerd`) has required `root` privileges to operate. It needs these high-level permissions to interact with the Linux kernel to create network interfaces, mount filesystems, and manage cgroups. However, this architectural design introduces a massive security vulnerability.

If a malicious actor manages to exploit a vulnerability within a container, or if a container is misconfigured (e.g., exposing the docker socket `/var/run/docker.sock`), the attacker can easily break out of the container and execute arbitrary commands on the host system as the `root` user. This privilege escalation vector makes traditional Docker deployments inherently risky in multi-tenant or highly secure environments.

## The Solution: Rootless Mode and User Namespaces

Rootless Docker addresses this fundamental flaw by allowing both the Docker daemon and the containers it manages to run entirely as an unprivileged user. It achieves this by heavily relying on a Linux kernel feature known as **User Namespaces**.

User namespaces allow a process to have a different set of privileges inside the namespace compared to outside of it. A process can run as `root` inside the container (allowing it to manage container-internal resources like packages and configurations) while simultaneously being mapped to a completely unprivileged, standard user on the host system.

### The Mental Model: Identity Translation

Imagine a translation layer sitting between the container and the host kernel. When the container thinks it is executing a command as `root` (UID 0), the kernel silently translates that operation and executes it as a regular user (e.g., UID 1000) on the host.

```text
[ Container Environment ]               [ Host Environment ]
   Virtual UID 0 (root)    ======>    Actual UID 1000 (alice)
   Virtual UID 1 (daemon)  ======>    Actual UID 100000
   Virtual UID 2 (bin)     ======>    Actual UID 100001
```

If an attacker breaks out of the container running as virtual `root`, they land on the host machine possessing only the limited permissions of the user `alice`. They cannot modify system files, install host packages, or compromise other users' data.

## Implementation: How subuid and subgid Mapping Works

To make this translation possible, the Linux system must allocate a block of subordinate UIDs (User IDs) and GIDs (Group IDs) to the unprivileged user. This is governed by two critical files: `/etc/subuid` and `/etc/subgid`.

When you configure Rootless Docker for a user named `alice`, the system allocates a large, continuous range of UIDs that `alice` is allowed to use as subordinate identities.

### Examining the Mapping Configuration

Let's look at a typical entry in `/etc/subuid`:

```text
alice:100000:65536
```

This configuration string contains three fields:
1. **`alice`**: The name of the host user.
2. **`100000`**: The starting UID of the allocated subordinate range.
3. **`65536`**: The size of the allocation block (the number of UIDs available).

This means that the user `alice` is granted control over UIDs `100000` through `165535`. 

When Rootless Docker starts a container, it maps the container's UIDs to this allocated range:
- Container UID `0` (root) is mapped to the host user's actual UID (e.g., `1000`).
- Container UID `1` is mapped to the first subordinate UID (`100000`).
- Container UID `2` is mapped to the second subordinate UID (`100001`), and so on.

### Verifying the Namespaces in Action

We can verify this identity translation empirically. If we run a container using Rootless Docker and execute a sleep command:

```bash
# Executed as unprivileged user 'alice'
docker run -d alpine sleep infinity
```

Inside the container, the process believes it is running as `root`:
```bash
docker exec <container_id> ps aux | grep sleep
# Output: root         1  0.0  0.0   1300     4 ?        Ss   12:00   0:00 sleep infinity
```

However, if we inspect the process from the host operating system, we see the actual execution context:
```bash
ps aux | grep sleep
# Output: alice    12345  0.0  0.0   1300     4 ?        Ss   12:00   0:00 sleep infinity
```

The kernel has seamlessly handled the translation, ensuring that the host remains protected from the containerized payload.

## Limitations and Trade-offs

While Rootless Docker vastly improves security, it introduces certain architectural limitations:
- **Privileged Ports:** Rootless containers cannot bind to ports below `1024` (like 80 or 443) without additional host configuration (like setting `net.ipv4.ip_unprivileged_port_start=80`).
- **Cgroups v2 Requirement:** Proper resource limitation (CPU, memory limits) in rootless mode strictly requires cgroups v2 enabled on the host kernel.
- **Overlay Networks:** Certain advanced networking topologies and specific storage drivers (like `overlay2` without proper kernel patches) can exhibit performance overhead or require FUSE-based alternatives like `fuse-overlayfs`.

## Conclusion

By leveraging Linux User Namespaces and `subuid/subgid` mappings, Rootless Docker shifts the container execution paradigm from absolute host authority to strict least privilege. It represents a critical hardening step for modern infrastructure, effectively mitigating the most severe container escape vulnerabilities and ensuring safe multi-tenancy on shared compute nodes.