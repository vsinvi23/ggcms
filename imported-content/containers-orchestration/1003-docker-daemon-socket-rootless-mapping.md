# Hardening the Docker Daemon: Securing /var/run/docker.sock and rootless user namespaces

### The Problem: The Root Equivalent Daemon
Historically, the Docker daemon (`dockerd`) runs as the `root` user on the host system. It listens for API requests on a Unix socket, typically located at `/var/run/docker.sock`. 

The fundamental security issue is this: anyone with access to this socket possesses the equivalent of root access on the host. If a containerized application is compromised and the socket is bind-mounted into that container (a common anti-pattern in CI/CD runners or monitoring tools), the attacker can execute `docker run --privileged -v /:/host ubuntu chroot /host` and instantly assume total control of the underlying node.

### The Solution: Rootless Docker and User Namespaces
To mitigate daemon-level attacks, the industry has shifted towards two primary strategies: isolating the daemon entirely through Rootless mode, or strictly utilizing Linux User Namespaces (user namespace remapping) to ensure that `root` inside the container maps to an unprivileged user on the host.

### Architecture: Rootless vs. User Namespace Remapping

```text
User Namespace Remapping (dockerd runs as root):
  Host User (UID 100000) <===== Maps to =====> Container Root (UID 0)
  (Daemon is root, but container processes are isolated)

Rootless Docker (dockerd runs as unprivileged user):
  Host User (UID 1000)   ====== Runs =====> `dockerd`
  Host User (UID 1000)   <===== Maps to =====> Container Root (UID 0)
  (Daemon and containers lack host root privileges)
```

### Securing the Docker Socket
**Rule 1: Never mount `/var/run/docker.sock` into an untrusted container.**
If a container needs to build images (e.g., Jenkins, GitLab runner), use alternatives like Kaniko or BuildKit in daemonless mode instead of Docker-in-Docker (DinD) with a socket mount.

If you *must* expose the Docker API remotely, never bind it to an unprotected TCP port (`-H tcp://0.0.0.0:2375`). Always use TLS with mutual authentication (mTLS) to verify client certificates.

### Implementing User Namespace Remapping
User namespace remapping assigns a block of subordinate UIDs/GIDs to a user on the host. When a container runs as `root` (UID 0), the kernel translates that UID to an unprivileged UID (e.g., 100000) on the host filesystem.

1.  Define the subuid/subgid ranges for a dedicated user (e.g., `dockremap`):
    ```bash
    echo "dockremap:100000:65536" >> /etc/subuid
    echo "dockremap:100000:65536" >> /etc/subgid
    ```
2.  Configure `/etc/docker/daemon.json` to enable remapping:
    ```json
    {
      "userns-remap": "dockremap"
    }
    ```
3.  Restart the daemon. Now, processes running as `root` inside the container will lack permissions to modify host files owned by the real root if a volume is mounted.

### The Ultimate Defense: Rootless Docker
User namespace remapping still leaves `dockerd` running as root. Rootless Docker executes the daemon and the containers within a user namespace entirely as an unprivileged user. If `dockerd` is compromised, the attacker only gains the privileges of the standard host user.

**Installation (Ubuntu/Debian):**
1.  Install dependencies: `apt-get install uidmap dbus-user-session`
2.  Run the installation script as a non-root user:
    ```bash
    dockerd-rootless-setuptool.sh install
    ```
3.  Set the environment variables so the Docker CLI knows where the user's socket is:
    ```bash
    export DOCKER_HOST=unix:///run/user/1000/docker.sock
    ```

**Limitations of Rootless Mode:**
While highly secure, Rootless Docker has some architectural limitations:
*   **Privileged Ports**: By default, it cannot bind to host ports below 1024 (e.g., 80, 443) unless `CAP_NET_BIND_SERVICE` is granted to the rootless binary or sysctl `net.ipv4.ip_unprivileged_port_start=0` is set.
*   **Cgroups**: Managing resource constraints (cgroups v2) requires systemd delegation.
*   **Storage Drivers**: Overlay2 is supported, but depending on the kernel, it might require `fuse-overlayfs`.

### Operational Considerations
For CI/CD and developer workstations, Rootless Docker is the gold standard for preventing privilege escalation. For production Kubernetes environments, this concept is implemented at the runtime level (containerd/CRI-O) and orchestrated via Pod Security Admission, ensuring containers never run as root, effectively removing the attack vector before it reaches the daemon layer.