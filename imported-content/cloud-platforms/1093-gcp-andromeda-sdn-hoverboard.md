# GCP Andromeda SDN: Kernel Bypass and Virtual Switch Packet Processing

## The Problem: The CPU Cost of Software-Defined Networking
In cloud environments, physical networks are abstracted away by Software-Defined Networking (SDN). Every packet leaving a Virtual Machine (VM) must be intercepted, encapsulated (e.g., into VXLAN or GRE), routed, and subjected to distributed firewall rules before hitting the physical wire. 
Historically, this packet processing happened within the Linux kernel of the host operating system (the hypervisor). As network speeds scaled from 1 Gbps to 100 Gbps, traversing the kernel's network stack (context switches, memory copies, interrupt handling) became a massive bottleneck, consuming unacceptable amounts of CPU just to process packets.

## The Solution: Andromeda and Hoverboard
Google's Andromeda is the SDN stack underpinning Google Cloud Platform (GCP). To achieve high throughput and low latency without monopolizing host CPUs, Andromeda employs a layered architecture that aggressively pushes packet processing down the stack, bypassing the kernel entirely whenever possible using a component known as Hoverboard.

### Architecture Breakdown
Andromeda operates across multiple tiers: the VM boundary, the hypervisor, the Top of Rack (ToR) switch, and the cluster fabric.

```text
+-------------------------------------------------------------+
|                       Physical Host                         |
|                                                             |
|  +---------------------+                                    |
|  |     Tenant VM       |                                    |
|  |  +---------------+  |                                    |
|  |  |  Virtio-Net   |  |                                    |
|  |  +---------------+  |                                    |
|  +--------|------------+                                    |
|           | (Shared Memory Ring Ring)                       |
|           v                                                 |
|  +-------------------------------------------------------+  |
|  |                   Hypervisor / VMM                    |  |
|  |                                                       |  |
|  |  +-------------------------------------------------+  |  |
|  |  |      Hoverboard (User-Space Packet Engine)      |  |  |
|  |  |  [ Fast Path ]  [ Flow Cache ]  [ Encap/Decap ] |  |  |
|  |  +-------------------------------------------------+  |  |
|  |           |                                 ^         |  |
|  |           v (Kernel Bypass)                 |         |  |
|  |  +---------------------------------------+  |         |  |
|  |  | Linux Kernel (Slow Path / Exceptions) |--+         |  |
|  |  +---------------------------------------+            |  |
|  +-------------------|-----------------------------------+  |
|                      | (Physical NIC via DPDK/SR-IOV)       |
+----------------------|--------------------------------------+
                       v
            +---------------------+
            | Top of Rack Switch  | (Hardware Offload)
            +---------------------+
```

### Technical Implementation: The Hoverboard Fast Path

#### 1. Kernel Bypass (User-Space Networking)
Andromeda's local packet processor, codenamed *Hoverboard*, runs entirely in user-space. It communicates directly with the VM's virtual NIC (using Virtio shared memory rings) and the physical NIC (using techniques similar to DPDK - Data Plane Development Kit). 
By avoiding the Linux kernel, Hoverboard eliminates costly system calls and context switches. It polls the network interfaces continuously (busy-polling) rather than relying on hardware interrupts, drastically reducing latency jitter.

#### 2. The Flow Cache and the Slow Path
Not every packet needs deep inspection. Hoverboard maintains a highly optimized Flow Cache.
- **First Packet (Slow Path):** When a new connection is initiated, Hoverboard doesn't know what to do. It punts the packet to the "Slow Path" (often involving the control plane or the Linux kernel) to evaluate routing tables, Cloud IAM rules, and VPC firewall configurations.
- **Subsequent Packets (Fast Path):** Once the routing and security policy are validated, the decision is compiled into an exact-match rule and inserted into Hoverboard's Flow Cache. All subsequent packets for that connection match the cache and are instantly encapsulated and forwarded in user-space without kernel intervention.

#### 3. Hardware Offloading
Andromeda isn't strictly confined to the host. If a flow is particularly heavy, Andromeda's control plane can program the physical Top of Rack (ToR) switch or specialized NIC hardware (like Google's custom Titanium chips) to handle the encapsulation and forwarding directly in silicon. This creates a multi-tiered fast path:
1. Hardware NIC/ToR (Silicon Fast Path)
2. Hoverboard (User-Space Fast Path)
3. Kernel/Control Plane (Slow Path)

### Conclusion
GCP's Andromeda architecture demonstrates that scaling cloud networking requires escaping traditional OS boundaries. By combining user-space packet processing (Hoverboard) with intelligent flow caching and hardware offloading, Andromeda delivers the illusion of a dedicated physical network while maintaining the software-defined agility required for VPCs, all without incurring a crippling CPU tax on the hypervisor.
