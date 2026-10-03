---
title: "Rootless Docker Internals: How subuid/subgid Mapping Neutralizes Container Escapes"
description: "A deep look at the UID translation layer behind Rootless Docker: how /etc/subuid allocates subordinate UID ranges, how container root maps to an unprivileged host user, and what breaks (ports, cgroups v2, overlay networks) as a result."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "DEEP_DIVE"
tags:
  - "docker"
  - "rootless-docker"
  - "user-namespaces"
  - "subuid"
  - "subgid"
  - "container-escape"
---

# Rootless Docker Internals: How subuid/subgid Mapping Neutralizes Container Escapes

A container running as root gets compromised through an application-level RCE. In a standard Docker install, that container's root maps directly to the host's real root — the attacker escapes and owns the machine. In a Rootless Docker install, the exact same exploit lands the attacker as an unprivileged host user with no path to modify system files, install packages, or touch other users' data.

The mechanism that makes this possible is a UID translation layer implemented through Linux **user namespaces**, configured via two unglamorous text files: `/etc/subuid` and `/etc/subgid`.

---

## Why the daemon needing root is the underlying problem

`dockerd` has historically required root to create network interfaces, mount filesystems, and manage cgroups. That's a reasonable set of kernel operations to gate behind privilege — but it means every container's root maps 1:1 onto the host's actual root unless something intervenes. A container escape via socket mount, kernel exploit, or misconfiguration then hands the attacker full host control, which is disproportionate to what most workloads actually need.

Rootless Docker removes that assumption at the source: the daemon and its containers run entirely as an unprivileged user, using user namespaces to let a process be "root" *inside* its namespace while being an ordinary user *outside* it.

---

## The mental model: identity translation

```text
[ Container Environment ]               [ Host Environment ]
   Virtual UID 0 (root)     ======>    Actual UID 1000 (alice)
   Virtual UID 1 (daemon)   ======>    Actual UID 100000
   Virtual UID 2 (bin)      ======>    Actual UID 100001
```

If an attacker breaks out of the container while operating as virtual root, they land on the host as `alice` — a regular, unprivileged account. No system files, no other users' data, no privileged binaries are reachable.

---

## How `/etc/subuid` and `/etc/subgid` actually implement this

Rootless Docker needs a block of UIDs it can translate container-internal identities into. That block is allocated per host user in `/etc/subuid`:

```text
alice:100000:65536
```

Three fields:

1. `alice` — the host user rootless Docker runs as.
2. `100000` — the first UID in the allocated subordinate range.
3. `65536` — how many UIDs are allocated (so the range covers `100000`-`165535`).

When a container starts, the mapping is:

- Container UID `0` (root) → the actual host UID running the daemon (e.g., `1000`, `alice`'s real UID).
- Container UID `1` → first subordinate UID (`100000`).
- Container UID `2` → second subordinate UID (`100001`), and so on through the allocated range.

`/etc/subgid` follows the identical format for group IDs.

---

## Verifying the translation empirically

Run a container as the unprivileged user `alice` (rootless mode active):

```bash
docker run -d alpine sleep infinity
```

From *inside* the container, the process believes it's root:

```bash
docker exec <container_id> ps aux | grep sleep
# root         1  0.0  0.0   1300     4 ?        Ss   12:00   0:00 sleep infinity
```

From the *host*, the same process shows its real, unprivileged identity:

```bash
ps aux | grep sleep
# alice    12345  0.0  0.0   1300     4 ?        Ss   12:00   0:00 sleep infinity
```

The kernel performed the UID translation transparently at the namespace boundary — the container's view and the host's view of "who owns this process" are simply different projections of the same process, governed by the `/etc/subuid` allocation.

---

## Setting it up

```bash
# 1. System packages required for rootless networking and UID mapping
sudo apt-get install -y uidmap slirp4netns

# 2. Run the installer as the target unprivileged user (not root)
curl -fsSL https://get.docker.com/rootless | sh

# 3. Point the Docker CLI at the user-owned socket
export DOCKER_HOST=unix:///run/user/1000/docker.sock
```

The `dockerd-rootless-setuptool.sh` installer verifies `/etc/subuid`/`/etc/subgid` entries exist for the target user (most modern distros populate these automatically on user creation via `useradd`'s defaults) and configures `slirp4netns` for user-space network namespace bridging, since a rootless process can't create host-level network interfaces directly.

---

## Limitations and trade-offs

- **Privileged ports** — rootless containers cannot bind to ports below 1024 without extra host configuration (`net.ipv4.ip_unprivileged_port_start=80`, or fronting with a host-level reverse proxy). Design services to listen on high ports and let a proxy handle 80/443.
- **cgroups v2 requirement** — reliable CPU/memory limiting in rootless mode needs cgroups v2 on the host kernel; cgroups v1 support for unprivileged delegation is far less complete.
- **Networking overhead** — `slirp4netns`-based networking and some overlay/storage-driver combinations can carry a measurable performance cost versus root-mode networking; FUSE-based storage alternatives (`fuse-overlayfs`) may be needed depending on kernel version.

---

## Key takeaways

1. The translation is enforced by the kernel's user namespace feature, not by Docker policy — it holds even against a fully compromised container process.
2. `/etc/subuid`/`/etc/subgid` are the actual source of truth for the mapping; verify them directly (`grep <user> /etc/subuid`) when diagnosing "why does this UID look wrong" issues.
3. A container's "root" is real root *only within its own namespace view* — the host-side identity is whatever `/etc/subuid` allocated.
4. Expect to redesign around unprivileged ports and confirm cgroups v2 before relying on rootless mode for resource-constrained production workloads.
