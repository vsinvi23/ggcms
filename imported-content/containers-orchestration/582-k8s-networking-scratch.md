# Kubernetes Networking from Scratch: Pod-to-Pod and the CNI

### The Problem

Container orchestration requires a unified network. In a standard Docker setup, containers on the same host can communicate via bridge networks, but containers on different hosts cannot easily reach each other. Port mapping and NAT rules quickly become an unmanageable mess.

Kubernetes mandates a flat, un-NAT-ed network structure. Every Pod must have its own IP address, and every Pod must be able to communicate with every other Pod without Network Address Translation (NAT), regardless of which node they reside on.

### The Kubernetes Network Model

The Kubernetes networking model imposes the following fundamental rules:
1. **Pods can communicate with all other Pods on any node without NAT.**
2. **Agents on a node (e.g., system daemons, kubelet) can communicate with all Pods on that node.**
3. **The IP that a Pod sees itself as is the same IP that others see it as.**

This model radically simplifies application development. To a container inside a Pod, it appears as though it is running on a dedicated machine with its own IP.

### How Pod-to-Pod Communication Works

Let's break down communication between two Pods, first on the same node, and then across different nodes.

#### Same Node Communication

When Pod A talks to Pod B on the same node, traffic flows through a virtual ethernet bridge (typically `cbr0`).

```text
[ Pod A (10.0.0.2) ]     [ Pod B (10.0.0.3) ]
      | (veth1)                | (veth2)
      +-------- [ Bridge ] ----+
```

1. Pod A sends a packet to `10.0.0.3`.
2. The packet leaves Pod A's namespace through a `veth` pair.
3. The bridge intercepts the packet.
4. Using ARP, the bridge resolves the MAC address for `10.0.0.3`.
5. The packet is routed directly to Pod B's `veth` interface.

#### Cross-Node Communication

When Pod A talks to Pod C on a different node, the bridge alone isn't enough. The host's routing table must direct the packet to the correct physical node.

```text
Node 1 (192.168.1.10)              Node 2 (192.168.1.11)
Subnet: 10.0.1.0/24                Subnet: 10.0.2.0/24

[ Pod A (10.0.1.2) ]               [ Pod C (10.0.2.2) ]
      |                                  |
   [ Bridge ]                         [ Bridge ]
      |                                  |
    (eth0)                             (eth0)
      |--------------( Physical )--------|
                     ( Network  )
```

1. Pod A sends a packet to `10.0.2.2`.
2. The packet hits the bridge on Node 1.
3. Node 1's routing table knows that the `10.0.2.0/24` subnet lives on Node 2 (`192.168.1.11`).
4. The packet is encapsulated or routed over the physical network to Node 2.
5. Node 2 receives the packet, its routing table forwards it to the local bridge.
6. The bridge delivers the packet to Pod C.

### The Role of the CNI (Container Network Interface)

Kubernetes itself does not implement the cross-node routing, encapsulation, or IP address management (IPAM). Instead, it delegates these responsibilities to a CNI plugin.

The CNI is a standard specification defining how container orchestrators should interact with network plugins. When a Pod is created, the `kubelet` calls the configured CNI plugin to set up the network interface.

```json
// Example CNI configuration snippet
{
  "cniVersion": "0.3.1",
  "name": "mynet",
  "type": "bridge",
  "bridge": "cni0",
  "isGateway": true,
  "ipMasq": true,
  "ipam": {
    "type": "host-local",
    "subnet": "10.22.0.0/16",
    "routes": [
      { "dst": "0.0.0.0/0" }
    ]
  }
}
```

#### Popular CNI Implementations

- **Flannel:** Simple, uses overlay networks (VXLAN) to encapsulate Pod traffic within UDP packets across nodes.
- **Calico:** Highly scalable, supports both overlay networks and pure L3 routing via BGP.
- **Cilium:** Focuses heavily on security, using BGP for routing and eBPF (Extended Berkeley Packet Filter) for high-performance packet filtering and network policies.

By decoupling the network implementation, the CNI allows Kubernetes to run on any underlying infrastructure, from bare-metal servers using BGP to cloud environments requiring VXLAN encapsulation.
