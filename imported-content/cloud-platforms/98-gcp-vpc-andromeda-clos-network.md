# GCP Andromeda: Under the Hood of Google's Jupiter Clos Fabric

## The Network Virtualization Problem
When you provision a Virtual Private Cloud (VPC) in Google Cloud Platform (GCP) and spin up two Compute Engine VMs on opposite sides of the globe, they can communicate using private RFC 1918 IP addresses as if they were plugged into the same physical switch. 

How does Google achieve this? Traditional data center networking relies on hardware routers, VLANs, and spanning trees. These physical architectures cannot scale to accommodate millions of multi-tenant VMs, nor can they dynamically adapt to global network programming in milliseconds. 

To provide the illusion of a dedicated, global, flat network to every customer, Google built a revolutionary Software Defined Networking (SDN) stack named **Andromeda**, running on top of their massive hardware data center fabric known as **Jupiter**.

## Mental Model: Clos Topology and SDN Control Planes
To understand Andromeda, you must first understand the physical hardware it runs on: the Jupiter network.

Historically, data centers used a hierarchical tree topology (Core -> Aggregation -> Edge). If a server on Edge Switch A wanted to talk to Edge Switch Z, the traffic had to travel all the way up to the Core routers and back down, creating massive bottlenecks.

Google's Jupiter uses a **Clos Fabric** (a leaf-spine architecture). In a Clos network, every leaf switch (where servers connect) is connected to every spine switch. This creates a non-blocking, multi-path fabric where the distance between any two servers in the data center is exactly the same (three hops), providing massive bisection bandwidth.

```text
[ Spine Switch 1 ]    [ Spine Switch 2 ]    [ Spine Switch 3 ]
       |  \  /                 |  \  /                 |  \  /
       |   X                   |   X                   |   X
       |  /  \                 |  /  \                 |  /  \
[ Leaf Switch A ]     [ Leaf Switch B ]     [ Leaf Switch C ]
       |                       |                       |
   [ VM 1 ]                [ VM 2 ]                [ VM 3 ]
```

Andromeda is the software layer that sits on top of this. It programs the network flows so that VM 1 thinks VM 2 is right next to it, regardless of the physical reality.

## Andromeda Architecture: Hoverboards and VMMs
Andromeda avoids relying exclusively on physical switches to enforce VPC boundaries. Instead, it distributes the network programming directly to the hypervisor host machines where the VMs run.

### 1. The Virtual Machine Monitor (VMM)
When a packet leaves a VM, it doesn't immediately hit a physical switch. It first hits the VMM (Google's hypervisor layer) on the host machine. The VMM acts as an Andromeda software switch (Open vSwitch-like). 
- It encapsulates the packet (adding routing data).
- It enforces VPC firewall rules immediately at the source. If the packet is denied, it never even hits the physical wire.

### 2. Hoverboards
If a packet requires complex processing (like NAT, load balancing, or cross-region routing) that is too heavy for the VMM software switch, Andromeda routes the packet to a "Hoverboard." Hoverboards are highly optimized, multi-threaded software gateways dedicated to heavy network processing. They intercept the traffic, perform the required transformations, and inject it back into the Clos fabric.

## Configuration Implications: VPC Scaling
Because Andromeda operates as a global SDN control plane, GCP networking behaves differently than traditional clouds (like AWS).

### Global VPCs
In AWS, a VPC is bound to a specific region (e.g., `us-east-1`). If you want VMs in New York to talk to VMs in London over private IPs, you must build complex VPC Peering or Transit Gateway architectures.

In GCP, Andromeda abstracts geography. A single GCP VPC is a **global** resource. You can create a subnet in `us-central1` (10.0.1.0/24) and another in `europe-west1` (10.0.2.0/24) inside the same VPC. VMs in these subnets can communicate via their private IPs natively, routed entirely over Google's global fiber backbone via Andromeda.

```bash
# Creating a global VPC network
gcloud compute networks create global-vpc --subnet-mode=custom

# Adding subnets across the globe seamlessly
gcloud compute networks subnets create us-subnet \
    --network=global-vpc \
    --region=us-central1 \
    --range=10.0.1.0/24

gcloud compute networks subnets create eu-subnet \
    --network=global-vpc \
    --region=europe-west1 \
    --range=10.0.2.0/24
```

### High-Performance Networking
Because Andromeda handles packet processing at the hypervisor level, Google can offer specialized network tiers. For extreme bandwidth requirements (like distributed ML training), customers can enable the Google Virtual NIC (gVNIC), which tightly couples the VM's network interface directly with the Andromeda stack, bypassing legacy emulation layers to achieve 100 Gbps+ throughput.

## Conclusion
GCP's Andromeda is a masterpiece of distributed systems engineering. By leveraging the immense bisection bandwidth of the Jupiter Clos physical fabric and pushing packet routing, firewalling, and encapsulation to the hypervisor edges, Andromeda delivers a globally flat, highly performant, and secure network abstraction. Understanding this architecture is crucial for cloud architects looking to design high-throughput, multi-region systems without the overhead of legacy network topologies.