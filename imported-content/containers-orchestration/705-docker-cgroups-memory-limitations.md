# Docker Resource Constraints: Hardening Host Stability with cgroups Resource Boundaries

When containers run without resource limits, they pose a significant threat to host stability. By default, a container has unrestricted access to the host's physical memory and CPU scheduling cycles. If an application encounters a memory leak or a thread deadlock, it can consume all available RAM and CPU. This triggers a "Noisy Neighbor" crisis, starving adjacent services of execution power and forcing the Linux host's Out-Of-Memory (OOM) killer to terminate vital system daemons, rendering the entire host unresponsive.

To secure workloads, operators must enforce strict hardware-level execution boundaries using Control Groups (cgroups).

---

## Memory Allocation and the OOM-Killer Lifecycle

When host memory runs low, the kernel evaluates process priority scores (`oom_score`) to determine which process to terminate. The score is calculated based on current memory usage relative to limits and an adjustable offset (`oom_score_adj`).

```
[ Container RAM Usage increases ]
               │
               ▼
[ Exceeds configured --memory Limit? ]
       ├──► YES ──► [ Exceeds Swap Limit? ]
       │                   ├──► YES ──► [ Trigger container OOM-Killer ]
       │                   └──► NO  ──► [ Swap to Disk (Thrashes Disk IO) ]
       │
       └──► NO (Unbounded Container)
               │
               ▼
[ Exceeds PHYSICAL Host RAM Limit ]
               │
               ▼
[ Linux Kernel OOM-Killer triggers ] ──► [ Evaluates oom_score ] ──► [ Terminates Host Daemon / Services ]
```

By configuring rigid container memory boundaries, we confine the OOM action strictly inside the container's control group boundary, protecting the physical host.

---

## Production Resource Enforcement Configurations

Resource enforcement should be defined declaratively. Below are configurations for direct command execution, Docker Compose environments, and verification of cgroups limits.

### 1. Strict Limits via Docker CLI
Execute the container with explicit allocations for memory, swap, and execution shares:

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

*Key Parameters:*
- `--memory="512m"`: Confines the container to 512 Megabytes of physical RAM.
- `--memory-swap="512m"`: Setting swap identical to memory disables swapping to disk, protecting storage IO.
- `--cpus="1.5"`: Restricts the container to a maximum of 1.5 CPU cores of computing power.
- `--cpu-shares=1024`: Allocates baseline CPU priority weights during contention.

### 2. Multi-Container Enforcement (Docker Compose)
Define these constraints in your declarative Compose configurations:

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

*Note: For runtime environments like Node.js or the JVM, always ensure internal heap limits (e.g., `--max-old-space-size` or `-Xmx`) are set slightly below (10-20%) the container's physical limit to allow native memory overhead without triggering an immediate container OOM.*

---

## Technical Nuances: cgroups v1 vs cgroups v2

The Linux kernel segments resource grouping into cgroups. Understanding the changes in cgroups v2 is vital for modern deployments:

### 1. Unified Hierarchy
In cgroups v1, each controller (CPU, Memory, Block IO) operated in an isolated, independent tree structure, leading to resource correlation issues (e.g., inability to throttle IO based on memory page cache allocations). cgroups v2 introduces a unified hierarchy where process grouping is shared across all controllers.

### 2. Memory Controller Improvements
- **cgroups v1 (`memory.limit_in_bytes`):** Triggers immediate OOM when reached.
- **cgroups v2 (`memory.max` and `memory.high`):** `memory.high` acts as a soft threshold, gradually throttling container processes and prioritizing memory reclaiming before `memory.max` forces termination.

### 3. CPU Quotas and Completely Fair Scheduler (CFS)
CPU limiting does not pin a container to a specific core. Instead, it regulates time slices. The CFS algorithm calculates execution slices using:
- **CFS Period (`cpu.cfs_period_us`):** Default duration is 100,000 microseconds (100ms).
- **CFS Quota (`cpu.cfs_quota_us`):** If you allocate 1.5 CPUs, the scheduler assigns $150,000$ microseconds of run-time within every period block, suspending processes if the limit is exceeded.

Enforcing these strict cgroup boundaries ensures absolute resource isolation, preventing noisy neighbors and preserving cluster infrastructure health.
