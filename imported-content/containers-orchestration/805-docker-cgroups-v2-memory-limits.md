# Docker Resource Constraints: Enforcing cgroups v2 Memory and CPU CFS Slices

### The Problem: The Noisy Neighbor and OOM Panics

Containers, by default, have unrestricted access to the host's memory and CPU resources. If an application within a container experiences a memory leak or a sudden spike in computational demand, it can consume all available RAM and CPU cycles. This creates a "noisy neighbor" scenario, starving other critical containers on the same node and potentially causing the Linux Out-Of-Memory (OOM) Killer to abruptly terminate arbitrary processes, leading to system instability and unpredictable downtime.

### The Solution: cgroups v2 and Resource Slicing

To guarantee stability, you must strictly bound the resources a container can consume. Docker interacts with the Linux kernel's Control Groups (cgroups) to enforce these limits. With the adoption of cgroups v2 (unified hierarchy) in modern Linux distributions, managing and enforcing CPU Completely Fair Scheduler (CFS) quotas and memory limits is more robust and predictable.

### Architecture: The cgroups v2 Hierarchy

In cgroups v2, a container is placed within a specific path in the unified hierarchy (e.g., under `system.slice/docker.service/`). Resource limits are written to specific files within that directory.

```text
/sys/fs/cgroup/
├── system.slice/
│   └── docker.service/
│       ├── docker-container_ABC.scope/  <-- Container Limits applied here
│       │   ├── memory.max               <-- Hard memory limit (OOM trigger)
│       │   ├── memory.high              <-- Throttling threshold
│       │   ├── cpu.max                  <-- CPU CFS quota / period
│       │   └── cpu.weight               <-- Relative CPU shares
│       └── docker-container_XYZ.scope/
```

### Implementation: Setting Hard Constraints

Resource constraints should be defined during container creation. We must establish a maximum memory footprint, prevent excessive swapping, and limit CPU utilization to prevent CPU exhaustion.

#### 1. Command-Line Execution (docker run)

When running a container manually, use the appropriate flags to interface with cgroups.

```bash
docker run -d \
  --name web-app \
  --memory="512m" \
  --memory-swap="512m" \
  --cpus="1.5" \
  nginx:latest
```

*   `--memory="512m"`: Sets `memory.max`. The container cannot exceed 512 Megabytes. If it tries to allocate more, the kernel will OOM kill the processes inside the container.
*   `--memory-swap="512m"`: The *total* memory (RAM + swap) limit. By setting it equal to `--memory`, you **disable swapping** for this container entirely. This ensures performance predictability (swapping to disk causes severe latency).
*   `--cpus="1.5"`: Configures the CFS quota (`cpu.max`). The container is guaranteed a maximum of 1.5 CPU cores per scheduling period, regardless of how many physical cores exist on the host.

#### 2. Declarative Execution (docker-compose)

In production or structured environments, constraints must be defined declaratively in your `docker-compose.yml` (version 3+ spec utilizes the `deploy` key for constraints).

```yaml
version: '3.9'
services:
  data-processor:
    image: python-processor:v2
    deploy:
      resources:
        limits:
          # Hard limits (OOM/Throttling trigger)
          cpus: '2.0'
          memory: 1G
        reservations:
          # Soft limits (guarantees)
          cpus: '0.5'
          memory: 256M
```

*Note: The `reservations` block maps to `memory.low` and `cpu.weight` in cgroups v2, ensuring the container receives minimum resources during host contention.*

### Operational Considerations

*   **JVM and Node.js Awareness:** Historically, runtimes like the Java Virtual Machine (JVM) or Node.js V8 engine were unaware of cgroup limits and would allocate heaps based on total host RAM, leading to immediate OOM kills. Ensure you use modern versions (Java 11+ with `UseContainerSupport`, Node.js 12+) that respect cgroups, or explicitly set heap sizes (e.g., `-Xmx400m` or `--max-old-space-size=400`) slightly below the container's hard limit.
*   **OOM Kill Behavior:** When a container hits its memory limit, the Linux kernel terminates the offending process. Docker registers this exit with status code `137`. Always monitor for `OOMKilled` metrics to identify improperly sized containers or memory leaks.
*   **CPU Shares vs. Quotas:** `--cpu-shares` (relative weighting) only applies during CPU contention. `--cpus` (CFS quota) is a hard ceiling applied at all times. CFS quotas are preferred for predictable latency.
