# Docker Resource Constraints: Enforcing cgroups v2 Memory and CPU CFS Slices

### The Problem: The "Noisy Neighbor" and OOM Kills
When multiple containers run on a single host without resource limits, they compete for the same pool of CPU and RAM. A poorly written application with a memory leak, or a CPU-intensive background job, can monopolize the host's resources. This starves other critical containers, leading to unpredictable latency, system instability, and ultimately the Linux Out-Of-Memory (OOM) killer terminating random processes (often the wrong ones) to save the kernel. 

### The Solution: Control Groups (cgroups v2)
Linux cgroups (Control Groups) provide the kernel mechanism to limit, account for, and isolate resource usage (CPU, memory, disk I/O, network) for collections of processes. Docker leverages cgroups to enforce these limits on containers. Modern Linux distributions (Ubuntu 22.04+, Fedora, Debian 11+) use **cgroups v2**, which provides a unified hierarchy and significantly improved memory management compared to v1, particularly regarding memory swapping and OOM behavior.

### Architecture: The Unified Hierarchy

```text
 [ Host System: 32GB RAM, 8 Cores ]
               |
      (cgroups v2 Unified Tree)
               |
  +------------+------------+
  |                         |
[ system.slice ]      [ docker.slice ] (Limits enforced here)
(OS Processes)              |
                      +-----+-----+
                      |           |
               [ Container A ]  [ Container B ]
                 Mem: 512M       Mem: 2GB
                 CPU: 0.5        CPU: 2.0
```

### Enforcing Memory Limits
Memory limits define the maximum amount of RAM a container can allocate. 

```bash
docker run -d \
  --name web-app \
  --memory="512m" \
  --memory-swap="1g" \
  --oom-kill-disable \
  nginx:alpine
```
*   `--memory` (or `-m`): The hard limit. If the container tries to consume more than 512 Megabytes, the OOM killer is invoked *specifically for that container's cgroup*.
*   `--memory-swap`: The total amount of memory + swap. Here, the container gets 512M of RAM and 512M of swap (1G total). Setting this equal to `--memory` disables swap for the container.
*   `--oom-kill-disable`: (Optional/Advanced) Instructs the kernel *not* to kill the container if it hits the limit, but instead to pause its processes until memory is freed. This can lock up the container, so it should be used cautiously.

**cgroups v2 Memory QoS:**
With cgroups v2, Docker supports memory Quality of Service (QoS) using `--memory-reservation`. This sets a soft limit. When the host experiences memory pressure, the kernel will attempt to reclaim memory from containers operating above their reservation before looking elsewhere.

### Enforcing CPU Constraints
Docker manages CPU via the Completely Fair Scheduler (CFS). You can limit CPU in two ways: absolute quotas or relative shares.

**1. Absolute Limits (CFS Quota)**
To ensure a container never uses more than a specific fraction of CPU capacity, use `--cpus`.

```bash
# Limit the container to exactly 1.5 CPU cores
docker run -d \
  --name data-processor \
  --cpus="1.5" \
  python:3.9-slim python process.py
```
Under the hood, Docker translates `--cpus="1.5"` to a CFS quota (`--cpu-quota=150000`) and a CFS period (`--cpu-period=100000`). The container gets 150,000 microseconds of CPU time every 100,000 microseconds.

**2. Relative Limits (CPU Shares)**
Shares define priority when the host is under contention. If the host has idle CPU, a container can use it all. If the host is maxed out, shares dictate the slice of the pie. The default is 1024.

```bash
docker run -d --name low-priority-job --cpu-shares=512 batch-image
docker run -d --name high-priority-api --cpu-shares=2048 api-image
```
If CPU is 100% utilized, `high-priority-api` will get 4x more CPU cycles than `low-priority-job` (2048 vs 512).

### Verifying Limits
To verify the limits have been applied to the cgroup in a v2 environment, you can inspect the filesystem on the host:

```bash
# Find the container ID
docker ps -q -f name=web-app
# Check the cgroup memory limit (values are in bytes)
cat /sys/fs/cgroup/system.slice/docker-<CONTAINER_ID>.scope/memory.max
```

### Operational Considerations
1.  **Application Awareness**: Applications like the Java Virtual Machine (JVM) historically struggled with container memory limits, reading the host's total RAM instead of the cgroup limit and causing OOM kills. Ensure you use Java 11+ or explicitly set `-XX:+UseContainerSupport` so the JVM sizes its heap appropriately based on cgroup v2 metrics.
2.  **Monitoring**: Use `docker stats` or Prometheus Node Exporter to monitor containers that frequently approach their `--memory` limits, as they are at high risk of sudden termination.

Explicit resource constraints are mandatory for stable container infrastructure. They transform unpredictable noisy neighbors into isolated, predictable workloads.