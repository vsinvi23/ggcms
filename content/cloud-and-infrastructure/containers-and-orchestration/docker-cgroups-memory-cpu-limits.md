---
title: "Docker Resource Limits: cgroups, OOM Killer, and CFS CPU Quotas"
description: "How Docker enforces memory and CPU boundaries through Linux cgroups, why unbounded containers cause host-wide OOM incidents, and how to configure production-safe limits under cgroups v1 and v2."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "DEEP_DIVE"
tags:
  - "docker"
  - "cgroups"
  - "cgroups-v2"
  - "oom-killer"
  - "cfs-scheduler"
  - "resource-limits"
  - "docker-compose"
---

# Docker Resource Limits: cgroups, OOM Killer, and CFS CPU Quotas

A payment-gateway service ships a subtle memory leak in a background reconciliation job. In staging it's invisible — the container restarts nightly and nobody notices the slow climb in RSS. In production, that same container runs for eleven days straight. On day eleven it finally exhausts the host's physical RAM. The Linux kernel's Out-Of-Memory killer wakes up, scans every process on the box by `oom_score`, and — because the leaking container has no memory ceiling and looks no worse than anything else — kills the node's `containerd` shim instead. Every other container on that host goes down with it.

This is the default behavior of an unconstrained container: it has no ceiling on RAM, swap, or CPU time unless you impose one. The fix isn't "watch memory more carefully" — it's making the kernel enforce a hard boundary per container so a single runaway process can only ever kill itself.

---

## Why unbounded containers are a host-stability risk

By default, a container can consume as much CPU, memory, and swap as the kernel will give it. Docker (and every container runtime) delegates that enforcement to the Linux kernel's **Control Groups (cgroups)** subsystem — cgroups don't control *what a process can see* (that's namespaces' job), they control *how much of the host's hardware a process group is allowed to consume*.

```text
                      +-----------------------------+
                      |       Host Hardware         |
                      +-----------------------------+
                                     |
                       +-------------+-------------+
                       |                           |
                       v                           v
         +---------------------------+ +---------------------------+
         |     cgroup: CPU Limit     | |    cgroup: Memory Limit   |
         |  (CFS Quota / CPU Shares) | |  (RAM quota & Swap limit) |
         +---------------------------+ +---------------------------+
                       |                           |
                       +-------------+-------------+
                                     |
                                     v
                       +---------------------------+
                       |   Isolated Container       |
                       +---------------------------+
```

Without a memory ceiling, the escalation path to a host-wide outage looks like this:

```text
[ Container RAM usage increases ]
               |
               v
[ Exceeds configured --memory limit? ]
       +--- YES --> [ Exceeds --memory-swap limit? ]
       |                   +--- YES --> [ Container's cgroup OOM killer fires ]
       |                   +--- NO  --> [ Swaps to disk (thrashes I/O) ]
       |
       +--- NO (unbounded container)
               |
               v
[ Consumes physical host RAM without bound ]
               |
               v
[ Kernel-wide OOM killer fires ] --> [ Scores every process by oom_score ] --> [ May kill unrelated host daemons ]
```

The whole point of setting a `--memory` limit is to confine the blast radius: when the limit is hit, the kernel kills processes **inside that container's cgroup only**, never touching the rest of the host.

---

## Setting hard limits in production

### 1. `docker run` — direct enforcement

```bash
docker run -d \
  --name payment-gateway \
  --memory="512m" \
  --memory-swap="512m" \
  --cpus="1.5" \
  --cpu-shares=1024 \
  --oom-kill-disable=false \
  payment-service:v2.1
```

- **`--memory="512m"`** — hard ceiling on physical RAM the container's cgroup may use.
- **`--memory-swap="512m"`** — this is the *total* (RAM + swap) ceiling, not an additional swap allowance. Setting it **equal** to `--memory` disables swap entirely for the container, which is almost always what you want: swapping under memory pressure trades an OOM kill for unpredictable multi-second I/O stalls, which is usually worse for a latency-sensitive service.
- **`--cpus="1.5"`** — a hard CPU ceiling expressed in whole cores, enforced via the CFS bandwidth controller (below).
- **`--cpu-shares=1024`** — a *relative* weight used only during contention; it does nothing when the host has spare CPU.

### 2. Docker Compose — declarative limits + reservations

```yaml
version: '3.8'
services:
  payment-gateway:
    image: payment-service:v2.1
    deploy:
      resources:
        limits:
          cpus: '1.50'
          memory: 512M
        reservations:
          cpus: '0.50'
          memory: 256M
    restart: on-failure
    environment:
      - NODE_OPTIONS=--max-old-space-size=450
```

`limits` are the hard ceiling enforced by cgroups; `reservations` are a soft guarantee used by the scheduler (Swarm/Kubernetes-equivalent placement logic) to avoid over-packing a node, and map to `memory.low`/`cpu.weight` under cgroups v2.

**Runtime-aware sizing matters as much as the container limit.** A JVM or Node.js process that doesn't know it's containerized will size its heap against the *host's* total RAM, not the container's 512MB ceiling, and get OOM-killed the moment it grows past the cgroup limit even though it thinks it has headroom. Always set the runtime's own heap ceiling 10-20% below the container limit (`NODE_OPTIONS=--max-old-space-size=450` for a 512M container, or `-Xmx400m` / Java 11+'s `-XX:+UseContainerSupport`, which reads cgroup limits automatically) so the runtime GCs proactively instead of relying on the kernel to kill it.

---

## cgroups v1 vs cgroups v2: what actually changed

### Unified hierarchy

Under cgroups v1, each controller (CPU, memory, blkio) had its own independent tree — a process could be under different, uncoordinated hierarchies for CPU vs. memory, which made cross-controller decisions (like throttling I/O based on memory page-cache pressure) impossible to express cleanly. cgroups v2 puts every controller under a single unified hierarchy per process group.

```text
/sys/fs/cgroup/
|-- system.slice/
|   `-- docker.service/
|       |-- docker-<container_id>.scope/   <-- limits applied here
|       |   |-- memory.max                 <-- hard limit (OOM trigger)
|       |   |-- memory.high                <-- soft throttling threshold
|       |   |-- cpu.max                    <-- CFS quota / period
|       |   `-- cpu.weight                 <-- relative CPU shares
|       `-- docker-<other_container>.scope/
```

### Memory controller: a hard wall vs. a graduated response

- **cgroups v1 (`memory.limit_in_bytes`)** — a single hard number. Cross it, and the OOM killer fires immediately with no warning.
- **cgroups v2 (`memory.max` + `memory.high`)** — `memory.max` is still the hard OOM trigger, but `memory.high` is a new *soft* threshold: crossing it doesn't kill anything, it aggressively throttles the cgroup's processes and forces reclaim, giving the application a chance to shed memory (or the orchestrator a chance to notice and act) before the hard wall is hit.

Verify the effective limit from inside a running container:

```bash
# cgroups v2
cat /sys/fs/cgroup/memory.max
cat /sys/fs/cgroup/memory.high

# Live usage vs. limit from the host
docker stats payment-gateway
```

When a container does get OOM-killed, Docker reports it with a distinctive exit status:

```bash
docker inspect payment-gateway --format '{{.State.OOMKilled}} {{.State.ExitCode}}'
# true 137
```

Exit code `137` is `128 + SIGKILL(9)` — treat any recurring `137`/`OOMKilled: true` as a sizing bug, not a transient blip.

### CPU: quotas are time-slices, not core pinning

`--cpus` does **not** pin a container to a fixed number of physical cores — it regulates the container's share of *scheduling time* using the Completely Fair Scheduler's bandwidth controller:

- **CFS period (`cpu.cfs_period_us`)** — the recurring time window, default 100,000 microseconds (100ms).
- **CFS quota (`cpu.cfs_quota_us`)** — how much of each period the cgroup may run for. `--cpus="1.5"` sets a quota of 150,000 microseconds — the container may run for a cumulative 150ms of CPU time within every 100ms window, spread across however many cores the scheduler chooses.

If the container's processes (across all their threads) burn through that 150ms budget before the period resets, the scheduler throttles them until the next period — visible as periodic latency spikes rather than a crash, which is why CPU-bound services under aggressive quotas often show sawtooth latency graphs.

`--cpu-shares` (v1) / `cpu.weight` (v2) is a different mechanism entirely: it's a **relative** priority that only matters when the host is CPU-contended. A quota is an absolute ceiling enforced at all times; shares/weight do nothing when there's spare capacity. Use quotas (`--cpus`) when you need a predictable, hard ceiling; use shares only to express relative priority during contention.

---

## Key takeaways

1. Always set an explicit `--memory` (and matching `--memory-swap`) on any production container — the default is unlimited, and an unlimited container can take down the whole host's OOM killer with it.
2. Runtime heap ceilings (JVM `-Xmx`, Node `--max-old-space-size`) must sit *below* the container's cgroup memory limit, not the host's total RAM.
3. On cgroups v2, use `memory.high` as an early-warning throttle and `memory.max` as the hard OOM boundary — they solve different problems.
4. `--cpus` is a hard CFS quota enforced every 100ms period; `--cpu-shares`/`cpu.weight` only matters during contention. Don't confuse the two when diagnosing latency.
