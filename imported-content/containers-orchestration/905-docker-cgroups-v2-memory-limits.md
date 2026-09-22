# Docker Resource Constraints: Enforcing cgroups v2 Memory and CPU CFS Slices

## The Problem: The Noisy Neighbor and the OOM Reaper
A container is simply an isolated Linux process. Without explicit resource constraints, a container has unrestricted access to the host machine's total CPU cycles and RAM. 

In a multi-tenant environment, this leads to the "noisy neighbor" problem. A memory leak or a computationally intensive query in a single container will monopolize the host system. When the host runs out of memory, the Linux kernel invokes the Out-Of-Memory (OOM) Killer. The OOM Killer relies on heuristics to terminate processes and free memory, which often results in the sudden, ungraceful death of critical infrastructure components or unrelated, innocent containers.

## The Architecture: Control Groups (cgroups v2)
To prevent resource monopolization, container runtimes leverage a Linux kernel feature called **cgroups** (Control Groups). Cgroups meter, limit, and isolate resource usage (CPU, memory, disk I/O, network) of a collection of processes.

Modern Linux distributions employ **cgroups v2**, which provides a unified, hierarchical tree structure, offering cleaner delegation and safer resource tracking than v1.

```text
/sys/fs/cgroup/
 ├── system.slice/ (Host system services)
 └── docker/
      ├── container_A/ 
      │    ├── cpu.max (CFS Quota)
      │    └── memory.max (Hard limit)
      └── container_B/
           ├── cpu.weight (CPU Shares)
           └── memory.high (Soft throttling)
```

## CPU Restraints: Quotas vs. Shares
CPU isolation can be handled in two ways: hard limits (CFS Quota) and relative weighting (CPU Shares).

### 1. Completely Fair Scheduler (CFS) Quotas
CFS is the default Linux CPU scheduler. When you limit CPU usage in Docker, you are manipulating CFS periods and quotas. This sets a hard ceiling on CPU consumption, even if the host CPU is sitting idle.

Setting `--cpus="1.5"` guarantees the container can consume at most one and a half CPU cores. Under the hood, this translates to setting `cpu.max` in the cgroup.

```bash
docker run -d --name intensive-app \
  --cpus="1.5" \
  my-app:latest
```

### 2. CPU Shares (Relative Weighting)
Shares dictate priority during CPU contention. If the host has idle CPU, the container can use all of it. But if multiple containers fight for CPU, shares dictate the proportional division. The default weight is 1024.

```bash
# App A gets twice the CPU time of App B ONLY during contention
docker run -d --name app-a --cpu-shares 2048 my-app
docker run -d --name app-b --cpu-shares 1024 my-app
```

## Memory Restraints: Hard vs. Soft Limits
Memory is largely incompressible; if a process needs it and it isn't there, it crashes. 

### Hard Limits (`memory.max`)
Setting `-m` or `--memory` enforces a strict ceiling. If the container process attempts to allocate memory beyond this limit, the kernel's cgroup-specific OOM Killer terminates the process *inside* the container, protecting the host and other containers.

```bash
docker run -d --name web-server \
  --memory="512m" \
  nginx:alpine
```

### Soft Limits and Swap (`memory.high`)
To prevent instant OOM kills during brief spikes, you can configure memory reservations (soft limits). You should also severely restrict or disable swap to ensure predictable performance and prevent disk I/O thrashing.

```bash
docker run -d --name web-server \
  --memory="512m" \
  --memory-reservation="256m" \
  --memory-swap="512m" \ 
  nginx:alpine
```
*Note: Setting `--memory-swap` equal to `--memory` effectively disables swap for that container.*

## Implementation in Docker Compose
In modern `docker-compose.yml` specs (following the Compose Specification), these cgroup constraints map to the `deploy.resources` block:

```yaml
services:
  backend:
    image: api:v1
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

## Conclusion
Failing to implement CPU and memory limits is architectural negligence. By mapping application resource requirements tightly to cgroups v2 constraints, engineers protect the stability of the host node, ensure fair resource distribution among tenants, and guarantee predictable, deterministic failure domains when applications misbehave.
