# Hardening the Docker Daemon: Securing /var/run/docker.sock and Rootless User Namespaces

### The Problem: The Daemon as Root and the Socket Vulnerability

By default, the Docker daemon (`dockerd`) runs as the `root` user on the host system. Furthermore, tools that require Docker access (like CI/CD runners or monitoring agents) often mount the Docker socket (`-v /var/run/docker.sock:/var/run/docker.sock`). This is a critical security flaw: anyone with write access to the Docker socket can launch a privileged container, mount the host's root filesystem, and achieve full root compromise of the host machine in seconds.

### The Solution: Rootless Mode and User Namespace Remapping

To mitigate these risks, you must apply defensive-in-depth strategies to the container engine itself:
1.  **Rootless Docker:** Run the daemon and containers entirely without `root` privileges.
2.  **User Namespace Remapping (userns-remap):** If the daemon must run as root, isolate container users by mapping the container's `root` (UID 0) to an unprivileged UID on the host.

### Architecture: User Namespace Isolation

User namespace remapping translates UID/GID ranges. A process might think it is running as `root` (UID 0) inside the container, but on the host, it is executed as a high-numbered, unprivileged user (e.g., UID 100000).

```text
+-------------------+             +-------------------+
| Container Runtime |             |    Host System    |
+-------------------+             +-------------------+
|  UID 0 (Root)     +-- mapped -> | UID 100000 (dockremap)|
|  UID 1            +-- mapped -> | UID 100001        |
|  ...              |             | ...               |
|  UID 65535        +-- mapped -> | UID 165535        |
+-------------------+             +-------------------+
```
*If a process breaks out of the container, it operates as UID 100000 on the host, having zero administrative capabilities.*

### Implementation 1: User Namespace Remapping

If you maintain standard Docker (where the daemon is root), enable `userns-remap`.

#### 1. Configure the Subordinate IDs

Define the UID/GID ranges in `/etc/subuid` and `/etc/subgid`. The Docker installation usually creates a `dockremap` user for this purpose.

```text
# /etc/subuid
dockremap:100000:65536

# /etc/subgid
dockremap:100000:65536
```

#### 2. Configure the Daemon

Modify `/etc/docker/daemon.json` to enable remapping.

```json
{
  "userns-remap": "dockremap"
}
```

Restart the daemon (`sudo systemctl restart docker`). Existing images and containers will be inaccessible in the new namespace context; Docker will create a new directory (e.g., `/var/lib/docker/100000.100000/`) to store isolated images.

### Implementation 2: Rootless Docker (The Gold Standard)

Rootless Docker runs the daemon itself as a non-root user. It leverages `slirp4netns` for networking and requires no root privileges after initial setup.

#### 1. Installation

Run the provided installation script as your unprivileged user (e.g., `devuser`).

```bash
curl -fsSL https://get.docker.com/rootless | sh
```

#### 2. Environment Configuration

Export the necessary environment variables so the Docker CLI knows where to find the user-specific socket.

```bash
# Add to ~/.bashrc or ~/.zshrc
export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/docker.sock
```

Now, the daemon runs entirely in userspace. There is no `/var/run/docker.sock`.

### Handling the Socket in CI/CD

If you absolutely must build images inside containers (Docker-in-Docker or CI/CD), **never mount `/var/run/docker.sock`**.

**Instead, use alternative, socket-less build tools:**
*   **Kaniko:** Builds images inside a container without requiring a Docker daemon.
*   **Buildah:** Daemonless image building tool compatible with OCI standards.

```yaml
# Example CI step using Kaniko instead of mounted docker.sock
steps:
  - name: Build and Push
    image: gcr.io/kaniko-project/executor:latest
    args:
      - "--context=dir://$(pwd)"
      - "--dockerfile=$(pwd)/Dockerfile"
      - "--destination=registry.example.com/myapp:latest"
```

### Operational Considerations

*   **Port Binding Limitations (Rootless):** A rootless Docker daemon cannot bind to privileged host ports (ports below 1024) natively. You must bind containers to higher ports (e.g., 8080) and use a host-level reverse proxy (like Nginx) or modify kernel parameters (`net.ipv4.ip_unprivileged_port_start=80`) to route traffic.
*   **Resource Limits:** Rootless mode requires cgroups v2 to enforce CPU and memory limits reliably.
*   **Volume Mount Permissions:** With `userns-remap`, host-mounted volumes (`-v /host/path:/container/path`) will fail if the host path is owned by root, because the container processes access it as UID 100000. You must `chown` the host directories to the remapped UID.
