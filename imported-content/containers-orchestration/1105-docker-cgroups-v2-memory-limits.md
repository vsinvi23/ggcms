# Docker Resource Constraints: Enforcing cgroups v2 Memory and CPU CFS Slices

When running containerized workloads on a shared Linux host, a single poorly optimized or malicious container can consume all available CPU cycles or memory. This "noisy neighbor" effect causes performance degradation, application lag, and system-wide instability. If memory consumption goes unchecked, the Linux kernel Out-Of-Memory (OOM) killer will trigger, terminated critical system processes.

To isolate workloads and ensure host stability, you must enforce strict resource boundaries. This is managed by the Linux kernel **Control Groups (cgroups)** subsystem. In this article, we explore how cgroups v2 manages memory and CPU CFS (Completely Fair Scheduler) allocations and how to apply these limits in Docker.

---

## Technical Architecture: cgroups v2 Unified Hierarchy

Cgroups v2 represents a major architectural overhaul from cgroups v1. In cgroups v1, each resource controller (CPU, Memory, I/O) operated under a separate, disjointed directory hierarchy. In cgroups v2, a **Unified Hierarchy** is enforced: every process belongs to exactly one cgroup, and controllers are managed in a single, structured tree.

This unified model allows for realistic resource tracking—such as writing memory limits directly affecting writeback-cache page allocations.

```text
                        +----------------------+
                        |   cgroup v2 (Root)   |
                        +----------+-----------+
                                   |
                  +----------------+----------------+
                  |                                 |
                  v                                 v
        +-------------------+             +-------------------+
        |  System Services  |             | Docker Containers |  (/sys/fs/cgroup/docker)
        +-------------------+             +---------+---------+
                                                    |
                                    +---------------+---------------+
                                    |                               |
                                    v                               v
                          +-------------------+           +-------------------+
                          |  Container 1      |           |  Container 2      |
                          |  (cpu.max)        |           |  (cpu.max)        |
                          |  (memory.max)     |           |  (memory.max)     |
                          +-------------------+           +-------------------+
```

---

## CPU Isolation: Linux CFS Slices

Docker uses the Linux Completely Fair Scheduler (CFS) to allocate CPU cycles. CFS operates using a time-slice period.
* **Period (`cpu.cfs_period_us`):** The scheduling window duration (typically defaults to 100ms or 100000 microseconds).
* **Quota (`cpu.cfs_quota_us`):** The total CPU execution time allowed for the container within that period.

If you allocate exactly 2 CPU cores to a container, the cgroups controller sets:
* `cfs_period_us = 100000` (100ms)
* `cfs_quota_us  = 200000` (200ms)

Within any 100ms window, the container's threads can run for a total combined duration of 200ms. Once that quota is exhausted, the container's processes are throttled until the next period begins.

---

## Memory Isolation in cgroups v2

In cgroups v2, memory management is split into distinct thresholds:
1. `memory.min`: Hard-guaranteed memory protection. Pages in this range cannot be reclaimed by the kernel.
2. `memory.low`: Best-effort memory protection. Pages will only be reclaimed under high memory pressure.
3. `memory.high`: The soft throttle limit. When crossed, the container's processes are slowed down to perform background memory reclaim.
4. `memory.max`: The hard absolute ceiling. If a container exceeds this, its processes are terminated by the OOM killer.

---

## Part 1: Enforcing Constraints in `docker-compose`

Here is a highly defensive `docker-compose.yml` demonstrating robust cgroups v2 resource limits for a production microservice:

```yaml
version: '3.8'

services:
  payment-processor:
    image: payment-service:v1.2.0
    restart: on-failure
    security_opt:
      - no-new-privileges:true
    # cgroups v2 resource limit constraints
    deploy:
      resources:
        limits:
          cpus: '2.5'                     # Maps to cpu.max (quota=250000, period=100000)
          memory: 512M                    # Maps to memory.max (Hard limit)
        reservations:
          cpus: '1.0'                     # Best-effort guaranteed share
          memory: 256M                    # Maps to memory.low (Soft guaranteed limit)
    # Additional memory swap constraint
    memswap_limit: 512M                   # Prevents container from swapping to disk
    oom_score_adj: 500                    # Tells kernel to kill this container before critical host processes
```

---

## Part 2: Enforcing Constraints via Docker CLI

To achieve the exact same limits directly via the command-line interface, execute the following container command:

```bash
docker run -d \
  --name payment-processor-cli \
  --cpus="2.5" \
  --memory="512m" \
  --memory-reservation="256m" \
  --memory-swap="512m" \
  --oom-score-adj=500 \
  payment-service:v1.2.0
```

---

## Step 3: Verifying cgroups v2 Enforcement on the Host

You can verify that Docker has correctly written these configuration limits directly to the Linux host kernel virtual filesystem (`sysfs`).

```bash
# Get the full container ID of your running container
CONTAINER_ID=$(docker inspect --format='{{.Id}}' payment-processor-cli)

# Inspect CPU limits under cgroups v2 directory
cat /sys/fs/cgroup/docker/${CONTAINER_ID}/cpu.max
# Expected output: 250000 100000 (representing 2.5 cores)

# Inspect Memory limits
cat /sys/fs/cgroup/docker/${CONTAINER_ID}/memory.max
# Expected output: 536870912 (512MB in bytes)
```

Additionally, monitor the real-time resource utilization and throttling metrics using `docker stats`:

```bash
docker stats payment-processor-cli
```

To see if your container is experiencing CPU throttling, query the cgroups stats file:

```bash
cat /sys/fs/cgroup/docker/${CONTAINER_ID}/cpu.stat
# Focus on nr_throttled and throttled_usec
```

By enforcing strict cgroups v2 memory and CPU allocations, you guarantee host stability, eliminate unpredictable OOM outages, and prevent runaway workloads from hijacking shared cluster node compute.
