---
title: "Google Cloud Andromeda SDN Internals: Kernel Bypass and Virtual Switches"
description: "Why the Linux kernel networking stack cannot keep up with 100 Gbps cloud line rates, and how Google's Andromeda SDN uses kernel bypass, polling-mode drivers, and gVNIC to eliminate interrupts and memory copies."
type: "ARTICLE"
categorySlug: "cloud-platforms"
articleType: "DEEP_DIVE"
tags:
  - "gcp"
  - "andromeda"
  - "sdn"
  - "kernel-bypass"
  - "dpdk"
  - "gvnic"
  - "networking"
---

# Google Cloud Andromeda SDN Internals: Kernel Bypass and Virtual Switches

## What We Are Going to Learn

In this deep dive, we step beneath simple VPC configurations to explore the physical and software-defined forwarding engines of Google Cloud Platform (GCP). Specifically:

1. **Andromeda SDN architecture**: the multi-layered control and data planes that power GCP networking.
2. **The Linux kernel bottleneck**: why the traditional Linux networking stack is too slow for modern high-performance cloud environments.
3. **On-host packet processing**: how Google's virtual switches (vswitches) manage traffic directly on physical hypervisor hosts.
4. **Kernel bypass & DPDK**: how Google uses Data Plane Development Kit (DPDK) principles and user-space packet processing to eliminate context switching and interrupt overhead.

## The Problem: Linux Kernel Network Stack Overhead

In traditional virtualized infrastructure, when a virtual machine (VM) wants to send or receive network packets, the packet must travel through multiple layers of the operating system.

When a packet arrives at a physical Network Interface Card (NIC):

1. The NIC triggers a hardware interrupt (IRQ) to the CPU.
2. The CPU halts its current task, context-switches into **kernel space**, and runs the NIC's interrupt handler.
3. The kernel copies the packet payload from the ring buffer of the NIC into kernel memory (`sk_buff` structure).
4. The packet is processed by the Linux TCP/IP stack (routing, iptables firewalling, NAT).
5. The kernel context-switches again to copy the packet into the guest VM's **user space** application memory.

These continuous interrupts, context switches, and CPU-intensive memory copies (between physical NIC, host kernel, hypervisor, and guest OS) create a massive bottleneck. At 100 Gbps line rates, a CPU core has less than 10 nanoseconds to process a packet — yet a single context switch or cache miss can take hundreds of nanoseconds.

## Why the Problem Is Hard: Non-Intrusive, Scalable Cloud Hypervisors

To scale public cloud networks, hypervisors must route traffic for thousands of isolated tenant VMs on a single physical rack without:

- Allowing tenant traffic to leak or bypass firewall security.
- Wasting precious host CPU cores on network processing instead of tenant workloads.
- Introducing latency or jitter that degrades real-time applications, databases, or distributed training workloads.

Designing an on-host network stack that executes complex routing, encapsulation (e.g., Geneve/GRE), load balancing, and access control lists (ACLs) at tens of millions of packets per second (Mpps) requires redesigning how hardware and software communicate.

## A Simple Mental Model: The Fast-Path Highway

Think of traditional network forwarding as a local city road with traffic lights and stop signs (interrupts and context switches). Every car (packet) must stop and be inspected by a police officer (the kernel).

Kernel bypass transforms this into a high-speed express highway (fast-path) that routes cars directly from their origin to their destination without stopping or switching lanes.

```text
 Traditional Path (Slow-Path)                Kernel Bypass (Fast-Path)
=============================               ===========================
 [ Physical NIC ]                            [ Physical NIC ]
       |                                           |
       v (Interrupt/IRQ)                           v (Direct Memory Access via PCIe)
 [ Host Linux Kernel ]                       [ Shared Memory Ring Buffer ]
       |                                           |
       v (Context Switch)                          v (Polling - No Interrupts)
 [ Virtual Switch (vswitch) ]                [ User-Space FastPath / DPDK ]
       |                                           |
       v (Copy to Guest)                           v (Zero-Copy)
 [ Guest VM vNIC ]                           [ Guest VM vNIC (gVNIC) ]
```

## Under the Hood: Andromeda Architecture & On-Host Processing

Andromeda is Google's software-defined network (SDN). It is split into a centralized control plane and a highly distributed data plane:

- **The control plane**: A hierarchical controller cluster that programs network topologies, routing tables, and security policies, pushing them down to physical hosts.
- **The data plane**: Runs directly on physical hypervisor hosts, consisting of virtual switches (vswitches) and high-speed packet-forwarding engines.

```text
       +-----------------------------------------------------------+
       |               Andromeda Central Controller                |
       +----------------------------+--------------------------------+
                                    | (Pushes Routing/ACL Rules)
                                    v
       +-----------------------------------------------------------+
       |                Physical Hypervisor Host                   |
       |                                                           |
       |  +-------------------+           +-------------------+    |
       |  |    Guest VM A     |           |    Guest VM B     |    |
       |  |  (User Space App) |           |  (User Space App) |    |
       |  +---------+---------+           +---------+---------+    |
       |            | (gVNIC / Shared Memory)        |              |
       |            v                                v              |
       |  +-------------------------------------------------------+ |
       |  |             User-Space Virtual Switch                | |
       |  |        [ Andromeda FastPath Engine ]                 | |
       |  +-------------------------+-------------------------- + |
       |                            | (Kernel Bypass / DPDK)       |
       |                            v                              |
       |                 [ Physical NIC Hardware ]                 |
       +-----------------------------------------------------------+
```

### On-Host Packet Processing

Every physical host running Google Compute Engine runs a high-performance vswitch. The vswitch is responsible for:

1. **Packet encapsulation**: Encapsulating guest packets into internal Google-routable physical packets (using custom routing headers or standard Geneve tunnels).
2. **Access control (ACLs)**: Enforcing VPC firewall rules immediately as the packet leaves the guest VM.
3. **Load balancing**: Directing traffic to backend instances or Cloud NAT gateways.

## The Solution: Andromeda FastPath and Kernel Bypass

To achieve massive throughput, Andromeda implements **FastPath** packet processing via kernel bypass principles similar to DPDK.

### 1. Polling Mode Drivers (PMD)

Instead of relying on hardware interrupts which halt CPU execution, Andromeda dedicates specific CPU threads to constantly scan (poll) the physical NIC and guest VM ring buffers for incoming and outgoing packets.

- **Pros**: This eliminates IRQ overhead, context-switch latency, and cache invalidation.
- **Cons**: Polling consumes 100% of the assigned CPU core's cycles, even when there is no traffic. Andromeda dynamically scales the number of polling cores based on traffic volume.

### 2. Zero-Copy Shared Memory

Andromeda structures packet buffers in a region of physical RAM shared directly between the physical host NIC, the virtual switch, and the guest VM vNIC (e.g., using **gVNIC** — Google Virtual NIC). Using Direct Memory Access (DMA), the NIC deposits packets directly into this shared memory space. The virtual switch processes and encapsulates the packet in-place, and the guest VM reads it directly. No intermediate copying of data buffers occurs within the host OS.

## Hands-On Configuration: Optimizing GCP VM Network Performance

When launching high-throughput microservices or database clusters on GCP, configure your VMs to use Google Virtual NIC (gVNIC) and enable multi-queue support.

### 1. Create a VM with gVNIC Enabled

```bash
gcloud compute instances create database-node-01 \
    --zone=us-central1-a \
    --machine-type=n2-standard-16 \
    --network-interface=nic-type=GVNIC,network=default \
    --image-family=rocky-linux-9 \
    --image-project=rocky-linux-cloud
```

### 2. Enable Multi-Queue on Guest Linux

Multi-queue networking allows your guest operating system to distribute packet-processing loads across multiple CPU cores rather than bottlenecking on CPU 0.

```bash
# Check the number of queues/channels active on eth0
ethtool -l eth0
```

```bash
# Set eth0 to use maximum available combined queues
sudo ethtool -L eth0 combined 16
```

## Common Misconceptions

**"Kernel bypass is insecure because VMs write directly to host hardware memory."**
Reality: the guest VM does not write directly to the physical NIC's raw register space. Instead, the hypervisor maps specific, isolated shared-memory rings to the guest VM (the gVNIC ring). The host virtual switch acts as an intermediary, verifying packet integrity, enforcing security policies, and applying encapsulated headers before forwarding to the physical network.

**"Enabling high-performance gVNIC always increases VM host cost."**
Reality: gVNIC is a software-defined driver and does not incur direct license fees. While polling drivers can consume higher host CPU cycles, the resulting drop in latency and increase in network throughput often allows clusters to process workloads with fewer VM instances, reducing overall infrastructure costs.

## Pause and Think

**Critical question**: if Andromeda's FastPath utilizes polling to achieve sub-microsecond latencies, what happens when a packet triggers a complex security routing or NAT translation that is not stored in the fast-path cache?

**Answer**: the packet falls back to the slow-path (control-plane redirection, sometimes called Hoverboard). The virtual switch forwards the un-routable packet to an off-host cluster of controllers, which evaluate the complex VPC rule, apply the necessary translation, update the host's local FastPath forwarding cache, and inject the packet back into the data plane. Subsequent packets matching that signature will bypass the slow-path entirely.

## Key Takeaways

- Traditional Linux kernel TCP/IP stacks introduce high latency due to interrupts and memory-copy operations.
- Andromeda SDN bypasses the host kernel using shared-memory ring buffers and polling-mode drivers.
- gVNIC is Google's purpose-built virtual network interface that connects guest VMs directly to the host's FastPath vswitch.
- Polling eliminates hardware interrupts, but dedicates CPU threads to continuous network scanning.
- Enable multi-queue networking on guest operating systems to scale database and API traffic across multiple host CPUs.
