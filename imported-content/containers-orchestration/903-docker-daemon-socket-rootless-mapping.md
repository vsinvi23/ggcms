# Hardening the Docker Daemon: Securing /var/run/docker.sock and Rootless Mode

## The Problem: The Root Equivalent Daemon
Docker architecture relies on a client-server model. The Docker CLI (the client) communicates with the `dockerd` daemon via a local UNIX socket, typically located at `/var/run/docker.sock`. 

The fundamental security flaw in standard Docker deployments is that the `dockerd` daemon runs as `root`. Consequently, anyone who has read/write access to `docker.sock` has full root access to the host machine. If an attacker compromises a container where the Docker socket has been bind-mounted (a common anti-pattern in CI/CD pipelines like Jenkins or GitLab), they can simply run `docker run -v /:/host -it ubuntu chroot /host` to take complete ownership of the underlying host operating system.

Furthermore, processes running as `root` *inside* a standard container are exactly the same `root` user *outside* the container (UID 0), separated only by namespaces and cgroups. If a container breakout vulnerability occurs, the attacker lands on the host as UID 0.

## The Architecture: User Namespaces and Rootless Docker
To harden the Docker engine, we must separate the privileges of the container root user from the host root user. There are two primary architectural approaches:

1. **User Namespace Remapping (userns-remap):** The daemon runs as host root, but maps the container's UID 0 to an unprivileged high-number UID on the host.
2. **Rootless Docker:** The daemon *itself* runs entirely as an unprivileged user, and leverages user namespaces for the containers.

```text
Standard Docker:
Container (UID 0) ====== Maps to =====> Host (UID 0: root)

User Namespace Remapping / Rootless:
Container (UID 0) ====== Maps to =====> Host (UID 100000: unprivileged)
Container (UID 1) ====== Maps to =====> Host (UID 100001)
```

## Solution 1: Implementing User Namespace Remapping
If you must run the Docker daemon as root, enable `userns-remap` to mitigate container breakout risks.

### 1. Configure the subuid and subgid mappings
Edit `/etc/subuid` and `/etc/subgid` to allocate a range of IDs to a dedicated user, e.g., `dockremap`:
```text
# /etc/subuid and /etc/subgid
dockremap:165536:65536
```
This means UID 0 in the container maps to UID 165536 on the host.

### 2. Configure the Docker Daemon
Edit `/etc/docker/daemon.json`:
```json
{
  "userns-remap": "dockremap"
}
```
Restart the daemon. Now, even if a process runs as root inside the container, if it breaks out, the kernel sees it as UID 165536, preventing it from reading sensitive host files like `/etc/shadow`.

## Solution 2: The Ultimate Hardening - Rootless Docker
Rootless mode is the gold standard. It executes the Docker daemon and containers inside a user namespace. The daemon is started by a normal user, completely eliminating the need for host root privileges.

### 1. Prerequisites
Ensure the host kernel supports user namespaces and that `newuidmap` and `newgidmap` are installed.

### 2. Installation
Do not install docker via standard root packages. Run the rootless installation script as your unprivileged user:
```bash
curl -fsSL https://get.docker.com/rootless | sh
```

### 3. Environment Configuration
The rootless daemon listens on a socket in the user's home directory, not `/var/run`. Export the context so the CLI client can find it:
```bash
export DOCKER_HOST=unix:///run/user/1000/docker.sock
```

### 4. Systemd Integration
Enable the daemon to start on boot for the unprivileged user:
```bash
systemctl --user enable --now docker.service
```

## Protecting the Socket
If you cannot use Rootless mode, you must fiercely protect `/var/run/docker.sock`. 
- **Never** expose the socket over TCP (`-H tcp://0.0.0.0:2375`) without Mutual TLS (mTLS).
- **Never** bind-mount `/var/run/docker.sock` into a container unless it is an explicitly trusted administrative container (and even then, prefer tools like Kaniko or Buildah for CI/CD builds which don't require daemon access).

## Conclusion
Relying on default Docker daemon configurations exposes infrastructure to critical privilege escalation vectors. By shifting away from root-dependent architectures—either through `userns-remap` or full Rootless mode—and zealously guarding the Docker UNIX socket, security architects can ensure that a compromised container remains an isolated incident rather than a host-level catastrophe.
