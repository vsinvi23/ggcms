# Hardening the Docker Daemon: Securing /var/run/docker.sock and Rootless User Namespaces

The standard Docker installation runs the Docker daemon (`dockerd`) as the system `root` user. To allow developers and applications to interact with the daemon, Docker exposes a Unix domain socket at `/var/run/docker.sock`. Because anyone with write access to this socket can command the daemon to spin up privileged containers, mount the host's root filesystem, and execute commands as host `root`, this socket represents a major security vulnerability.

In this article, we analyze the risks of socket exposure, detail how to secure it, and implement a production-ready Rootless Docker setup using User Namespaces (`userns`).

---

## Technical Architecture: User Namespace Mapping

In a standard Docker setup, the container root (`UID 0`) maps directly to the host root (`UID 0`). In a rootless setup, we utilize Linux User Namespaces to map `UID 0` inside the container to a high, non-privileged UID on the host (e.g., `UID 100000`). If a process escapes a rootless container, it possesses only non-privileged user rights on the host, preventing host-level system compromise.

```text
+------------------------------------+      +------------------------------------+
|          STANDARD DOCKER           |      |          ROOTLESS DOCKER           |
+------------------------------------+      +------------------------------------+
|  CONTAINER:                        |      |  CONTAINER:                        |
|  [UID 0] (Root User)               |      |  [UID 0] (Root User)               |
|       |                            |      |       |                            |
|       | Direct Mapping             |      |       | Namespace Map (subuid)     |
|       v                            |      |       v                            |
|  HOST:                             |      |  HOST:                             |
|  [UID 0] (Privileged Root)         |      |  [UID 100000] (Non-privileged)     |
+------------------------------------+      +------------------------------------+
|  DAEMON:                           |      |  DAEMON:                           |
|  Runs as root (dockerd)            |      |  Runs as non-root user (dockerd)   |
|  Socket: /var/run/docker.sock      |      |  Socket: /run/user/1000/docker.sock|
+------------------------------------+      +------------------------------------+
```

---

## Part 1: Securing /var/run/docker.sock

### The Vulnerability: Mount Escalation
If a container mounting `/var/run/docker.sock` is compromised, an attacker can execute:
```bash
docker run -v /:/host alpine chroot /host
```
This grants full, unconstrained root access to the entire host operating system.

### Hardening Strategy
1. **Never mount `/var/run/docker.sock` inside untrusted containers.**
2. If an application (like Jenkins, GitLab runner, or Traefik) needs to interact with the Docker API, access it securely over TCP with Mutual TLS (mTLS) enabled.

### Hardening `daemon.json`
Apply this hardened base configuration to `/etc/docker/daemon.json`:

```json
{
  "icc": false,
  "no-new-privileges": true,
  "userns-remap": "default",
  "live-restore": true,
  "iptables": true,
  "tlsverify": true,
  "tlscacert": "/etc/docker/certs/ca.pem",
  "tlscert": "/etc/docker/certs/server-cert.pem",
  "tlskey": "/etc/docker/certs/server-key.pem",
  "hosts": ["tcp://0.0.0.0:2376", "unix:///var/run/docker.sock"]
}
```

---

## Part 2: Configuring Rootless Docker

Rootless mode executes the Docker daemon and containers as a non-root user, eliminating root access requirement even during initial startup.

### Step 1: Configure Sub-UID and Sub-GID Ranges
Linux kernel requires sub-UID and sub-GID mappings to allocate ranges of user IDs to the non-root user. 

Edit `/etc/subuid` and `/etc/subgid` to define the mapped range for your non-root user (e.g., `appuser` with Host UID `1000`):

```text
# /etc/subuid
appuser:100000:65536
```

```text
# /etc/subgid
appuser:100000:65536
```
This maps 65,536 UIDs starting from `100000` to `appuser`. Inside the container, `UID 0` maps to host `UID 100000`, `UID 1` maps to host `UID 100101`, and so forth.

### Step 2: Install Prerequisite Packages
Rootless mode requires `newuidmap` and `newgidmap` helper binaries (part of the `uidmap` package) to orchestrate the namespace mapping, and a user-space network driver such as `slirp4netns`.

```bash
# On Debian/Ubuntu
sudo apt-get install -y uidmap slirp4netns
```

### Step 3: Set up Rootless Docker Environment
Log in as the target non-root user (`appuser`), download and install the rootless script:

```bash
# Disable system-wide docker service first
sudo systemctl disable --now docker.service docker.socket

# Execute rootless setup script
curl -fsSL https://get.docker.com/rootless | sh
```

### Step 4: Configure User Environment Variables
The rootless daemon executes under the user's home directory. Define the socket and paths in the user's shell profile (`~/.bashrc`):

```bash
export PATH=$HOME/bin:$PATH
export DOCKER_HOST=unix:///run/user/1000/docker.sock
```

Apply the changes and start the rootless daemon:

```bash
source ~/.bashrc
systemctl --user enable --now docker.service
```

---

## Verification

To verify that the daemon is running in rootless mode and mapping UIDs correctly, execute:

```bash
# Run a test container and output the UID inside the container
docker run --rm alpine id
# Output: uid=0(root) gid=0(root) groups=0(root)

# Check the host process table for the container process
ps -ef | grep containerd-shim
# Output reveals that the shim process runs under Host UID 1000, NOT root.
```

By transitioning to a Rootless Docker architecture, you strip away the root-level privileges of the container runtime. Even in the event of a zero-day container runtime breakout, the attacker remains trapped as a low-privileged user on the host system.
