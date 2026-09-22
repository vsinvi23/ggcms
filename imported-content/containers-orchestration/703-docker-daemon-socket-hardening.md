# Hardening the Docker Daemon: Securing docker.sock and Rootless Execution

The standard Docker installation runs as a highly privileged system service. To manage containers, Docker exposes an unauthenticated Unix domain socket at `/var/run/docker.sock`. Because the Docker daemon executes commands with root privileges, any process that can write to this socket possesses effective root access to the entire host. Mounting `/var/run/docker.sock` inside a container—a common practice in monitoring and CI/CD tools—represents a massive security risk, permitting simple host-escape and total server compromise.

This article details how to secure the Docker daemon socket, restrict user access, and configure a fully rootless execution environment.

---

## The Socket Mount Escape Attack Vector

When `/var/run/docker.sock` is mounted into a container, an attacker can send API calls directly to the host’s Docker daemon.

```
┌─────────────────────────────────┐
│ Compromised Container           │
│   (docker.sock mounted)         │
└────────────────┬────────────────┘
                 │
                 ├─► Sends API request: "Run new container, mount host root / to /mnt"
                 │
                 ▼
┌─────────────────────────────────┐
│ Host Docker Daemon (Runs as root)│
└────────────────┬────────────────┘
                 │
                 ▼ (Mounts Host / into new container)
┌─────────────────────────────────┐
│ Attacker obtains host root /    │
│ shell via the spawned container │
└─────────────────────────────────┘
```

By executing `docker run -v /:/host alpine chroot /host`, the containerized attacker instantly gains write access to host configurations, systemd services, and SSH keys.

---

## Architecture: Rootless Docker Security Boundary

Rootless mode mitigates this risk by running the Docker daemon and containers inside a user namespace (`user_namespaces`). This maps the root user (UID 0) inside the container to an unprivileged user (e.g., UID 1001) on the host.

```
┌────────────────────────────────────────────────────────┐
│ Host Namespace (User: appuser, UID: 1001)              │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ User Namespace (mapped via subuid/subgid)        │  │
│  │                                                  │  │
│  │  ┌────────────────────────┐                      │  │
│  │  │ Rootless Docker Daemon │ (Executes as unpriv) │  │
│  │  └───────────┬────────────┘                      │  │
│  │              │                                   │  │
│  │              ▼                                   │  │
│  │  ┌────────────────────────┐                      │  │
│  │  │ Container (Root UID 0)  │ (Maps to Host 1001) │  │
│  │  └────────────────────────┘                      │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

Even if an attacker gains root access inside the container, they remain an unprivileged user on the host, preventing host takeover.

---

## Step-by-Step Hardening and Rootless Setup

### 1. Hardening daemon.json (For Rooted Installations)
If you must run Docker in standard root mode, limit daemon capabilities and secure the socket through `/etc/docker/daemon.json`:

```json
{
  "icc": false,
  "no-new-privileges": true,
  "userns-remap": "default",
  "live-restore": true,
  "userland-proxy": false,
  "seccomp-profile": "/etc/docker/seccomp-default.json"
}
```

*Key Directives:*
- `"icc": false`: Disables inter-container communication on the default bridge network, preventing raw network sniffing.
- `"no-new-privileges": true`: Prevents containers from acquiring new privileges via `setuid` or `setgid` binaries.
- `"userns-remap": "default"`: Activates standard user namespace mapping.

### 2. Transitioning to Rootless Execution

Follow this configuration to install and run Docker without root privileges.

#### A. Configure Sub-UID and Sub-GID Ranges
Define the allocated user and group ID ranges for namespace mapping in `/etc/subuid` and `/etc/subgid`:

```text
# /etc/subuid
appuser:100000:65536

# /etc/subgid
appuser:100000:65536
```

This allocates 65,536 subordinate user IDs (starting from 100,000) to the user `appuser`.

#### B. Install Rootless Packages
Install the required utilities for rootless networking (`slirp4netns`) and namespace management (`uidmap`):

```bash
sudo apt-get install -y uidmap slirp4netns
```

#### C. Run the Rootless Setup Script
As the unprivileged target user (`appuser`), execute the official Docker rootless installation script:

```bash
curl -fsSL https://get.docker.com/rootless | sh
```

#### D. Configure Environment Variables
Add the following system environment paths to `~/.bashrc` to point user processes to the rootless daemon socket:

```bash
export PATH=/home/appuser/bin:$PATH
export DOCKER_HOST=unix:///run/user/1001/docker.sock
```

#### E. Enable Systemd Service Persistence
Ensure the service starts automatically at boot without requiring user login:

```bash
systemctl --user enable docker
loginctl enable-linger appuser
```

---

## Safe socket-less Alternatives

For tasks such as building images inside CI/CD pipelines, completely avoid mounting `docker.sock`. Instead, deploy daemonless image builders:
- **Kaniko:** Executes Dockerfile commands inside a user-space container without daemon dependencies, pushing built layers directly to registries.
- **Buildah:** A daemonless CLI tool that interacts directly with OCI container registries and local storage, minimizing structural risks.

By implementing rootless execution and socket isolation, you eliminate the single most dangerous security vulnerability in containerized environments.
