# GCP Andromeda SDN: Under the Hood of Google's Jupiter Clos Fabric

## The Problem: The Hard Limits of Physical Network Hardware

In a hyperscale cloud environment, virtual machines (VMs) are provisioned, migrated, and destroyed within seconds. Traditional hardware-defined networks (using physical switches, hardware VLANs, and stateful hardware firewalls) cannot survive in this dynamic landscape. Legacy network designs face three fatal bottlenecks:

1. **Static Routing Table Limits**: Core physical switches have fixed TCAM (Ternary Content-Addressable Memory) sizes. These physical tables cannot scale to hold the millions of ephemeral MAC and IP addresses of cloud-native containers and VMs.
2. **Jitter and Inter-Host Overhead**: Traditional physical routing forces packets through centralized, stateful middleboxes (e.g., physical firewalls, hardware routers) before reaching their destination. This "tromboning" or "hairpinning" adds substantial latency, high packet jitter, and throughput limitations.
3. **Slow Failover Times**: Physical network convergence (such as BGP or OSPF route recalculations) takes seconds to minutes when a link fails. Hyperscale clouds require sub-millisecond, hitless failure recovery to prevent client-facing application dropouts.

---

## Technical Architecture: Andromeda Control Plane & Jupiter Fabric

To solve these physical scaling limits, Google developed **Andromeda**, its proprietary Software-Defined Network (SDN) stack, operating on top of the **Jupiter** Clos physical network fabric.

Andromeda decouples the networking control plane from the data plane, moving packet routing, firewall rules, and load balancing away from physical switches and directly into the software hypervisors running on the physical hosts.

### The Andromeda Packet Traversal Architecture

```
                       +-----------------------------+
                       |    Andromeda Controller     |
                       |       (Control Plane)       |
                       +--------------+--------------+
                                      |
             Optimized Route          | Program Fast-Path
             Update Message           | Flow Tables
                                      v
+-------------------------------------+-------------------------------------+
|             PHYSICAL HOST A         |             PHYSICAL HOST B         |
|                                     |                                     |
|  +--------------+                   |  +--------------+                   |
|  |  Guest VM A  |                   |  |  Guest VM B  |                   |
|  +------+-------+                   |  +------+-------+                   |
|         |                           |         |                           |
|         | gVNIC / VirtIO            |         | gVNIC / VirtIO            |
|         v                           |         v                           |
|  +-------------------------------+  |  +-------------------------------+  |
|  | Hoverboard User-Space Data    |  |  | Hoverboard User-Space Data    |  |
|  | Plane (OVS + DPDK Bypass)     |  |  | Plane (OVS + DPDK Bypass)     |  |
|  +--------------+----------------+  |  +--------------+----------------+  |
+-----------------|-------------------+-----------------|-------------------+
                  |                                     ^
                  |      Direct Host-to-Host Tunnel     |
                  +=====================================+
                         Jupiter Clos Optical Fabric
                             (Physical Layer)
```

### Core Architecture Components

1. **Andromeda Controller**: A highly available, hierarchically organized centralized controller. It acts as the brain of the network, listening to virtual machine configuration changes and dynamically programming packet forwarding rules onto host hypervisors.
2. **Hoverboard (Host-Level Data Plane)**: An optimized packet-processing engine that runs in userspace on every physical host. Hoverboard programs Open vSwitch (OVS) and bypasses the Linux kernel using DPDK (Data Plane Development Kit) or Google Virtual NIC (gVNIC) drivers.
3. **Jupiter Clos Fabric**: The underlying physical network infrastructure. It is a non-blocking, flat, optical Clos network utilizing Wavelength Division Multiplexing (WDM). It provides massive bisection bandwidth, allowing any host to talk to any other host at full line rate (e.g., up to 200 Gbps per VM) without oversubscription.

---

## Implementation: Conceptual User-Space Packet Routing Logic

Hoverboard intercepts packets from the Guest VM’s virtual network interface (gVNIC) and processes them in userspace, completely avoiding costly kernel context switches. The following Go pseudo-code represents the core routing loop executed inside the host's Andromeda agent to enforce firewall policies and encapsulate the packet in an outer IP tunnel (e.g., Geneve or VXLAN).

```go
package main

import (
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"net"
)

// Packet represents a raw L3 packet from the Guest VM
type Packet struct {
	SrcIP   net.IP
	DstIP   net.IP
	Payload []byte
}

// RouteEntry represents the SDN forwarding table programmed by Andromeda
type RouteEntry struct {
	TargetHostPhysicalIP net.IP
	TunnelID             uint32
	AllowEgress          bool
}

type HoverboardRouter struct {
	LocalPhysicalIP net.IP
	RoutingTable    map[string]RouteEntry // Key: Target Virtual Destination IP
}

func NewHoverboardRouter(localIP net.IP) *HoverboardRouter {
	return &HoverboardRouter{
		LocalPhysicalIP: localIP,
		RoutingTable:    make(map[string]RouteEntry),
	}
}

// EncapsulateAndRoute intercepts userspace packets and encapsulates them for Jupiter transit
func (hr *HoverboardRouter) EncapsulateAndRoute(pkt Packet) ([]byte, error) {
	// 1. Perform immediate SDN Lookup (O(1) Hash Map)
	route, exists := hr.RoutingTable[pkt.DstIP.String()]
	if !exists {
		// Packet miss: route to centralized OnCloud software routers for slower resolution
		return nil, errors.New("route cache miss: fallback to OnCloud router")
	}

	// 2. Enforce Distributed Firewall Rules (SDN-defined)
	if !route.AllowEgress {
		return nil, errors.New("packet dropped by distributed security policy")
	}

	// 3. Encapsulate packet inside virtual network tunnel (VXLAN / GENEVE style)
	// Outer Header: Physical Host Source IP -> Physical Host Destination IP
	// Inner Header: Virtual VM Source IP -> Virtual VM Destination IP
	encapsulatedPacket := make([]byte, len(pkt.Payload)+16)
	
	// Write Tunnel ID (VNI)
	binary.BigEndian.PutUint32(encapsulatedPacket[0:4], route.TunnelID)
	// Write Physical Destination Host IP
	copy(encapsulatedPacket[4:12], route.TargetHostPhysicalIP.To4())
	// Write original payload
	copy(encapsulatedPacket[12:], pkt.Payload)

	return encapsulatedPacket, nil
}
```

---

## Operational Best Practices

* **Utilize gVNIC Over VirtIO**: When launching high-performance or latency-sensitive workloads (such as databases or machine learning pipelines) on GCP Compute Engine, specify the **Google Virtual NIC (gVNIC)** network interface type instead of standard VirtIO. gVNIC is optimized to feed packets directly into the host-level Hoverboard userspace bypass, reducing latency and maximizing throughput.
* **Size VM Instances for Bandwidth**: GCP scales a virtual machine’s egress bandwidth linearly based on the number of vCPUs. A 1-vCPU instance is throttled to 2 Gbps, while instances with 16 or more vCPUs (or specialized machine types like N2/C2) can leverage up to 100 or 200 Gbps. Ensure your cluster sizing aligns with your network throughput requirements.
* **Leverage Internal Load Balancers**: GCP's Internal HTTP(S) and TCP/UDP Load Balancing are completely distributed, software-defined services managed by Andromeda. Traffic routed through them does not pass through a bottlenecked load balancer appliance; Andromeda routes packets directly from the client VM hypervisor to the healthy backend VM hypervisor.
