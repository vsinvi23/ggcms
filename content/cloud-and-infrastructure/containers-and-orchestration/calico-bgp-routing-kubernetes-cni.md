---
title: "Calico CNI: Encapsulation-Free Pod Routing with BGP"
description: "How Calico treats a Kubernetes cluster as a Layer 3 network, using BGP route reflectors instead of VXLAN/IP-in-IP overlays to route pod traffic natively at full MTU."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "DEEP_DIVE"
tags:
  - "calico"
  - "cni"
  - "bgp"
  - "kubernetes-networking"
  - "route-reflector"
---

# Calico CNI: Encapsulation-Free Pod Routing with BGP

## The Problem: The Overhead of Overlay Networks

In traditional Kubernetes network implementations like Flannel, pod-to-pod communication across different nodes often relies on overlay networks using VXLAN or IP-in-IP encapsulation. When a pod on Node A wants to speak to a pod on Node B, the original IP packet is wrapped inside an outer UDP or IP packet.

This encapsulation has a real cost: the inner packet must be packed and unpacked at every node boundary, consuming CPU cycles and reducing the effective Maximum Transmission Unit (MTU), which can lead to packet fragmentation and reduced throughput. For high-performance workloads — a latency-sensitive trading system or a high-throughput data pipeline — this overlay tax is unacceptable.

## The Solution: Pure Layer 3 Routing with BGP

Calico treats the Kubernetes cluster as a standard Layer 3 network. Instead of wrapping packets in overlays, Calico assigns routable IP addresses to every pod and uses the Border Gateway Protocol (BGP) to distribute those routes across the cluster.

By running a BGP client (BIRD) on every Kubernetes node, Calico dynamically advertises the IP addresses of the pods running on that node to the rest of the network. This eliminates the need for encapsulation — packets travel natively across the underlying network infrastructure exactly as they would in a traditional datacenter.

### The Mental Model: Nodes as Routers

Visualize every Kubernetes worker node as an autonomous IP router.

```text
[ Pod A (10.244.1.2) ] -> [ veth1 ] -> [ Node A Routing Table ]
                                                |
                                        (Native L3 Network)
                                                |
[ Pod B (10.244.2.3) ] <- [ veth2 ] <- [ Node B Routing Table ]
```

When Pod A transmits data to Pod B:

1. The packet hits the `veth` interface and enters Node A's default network namespace.
2. Node A consults its local routing table.
3. Because Calico's BGP daemon has populated the routing table, Node A knows that `10.244.2.0/24` (or the specific pod IP) is reachable via Node B's IP.
4. Node A forwards the packet directly to Node B over the underlying network — no encapsulation.
5. Node B receives the packet, checks its own routing table, and delivers it to Pod B.

## Configuring Calico BGP: Peering Topologies

By default, Calico uses a **full-mesh** BGP topology: every node peers with every other node. This works well for smaller clusters (roughly under 100 nodes), but the number of connections grows as `N * (N-1) / 2`, creating unmanageable overhead at scale.

For enterprise-scale clusters, Calico introduces **BGP Route Reflectors (RR)**.

### Route Reflector Architecture

Instead of peering with every node, worker nodes peer only with designated Route Reflector nodes. The Route Reflectors learn routes from their peers and propagate them to the rest of the cluster.

```text
         [ Route Reflector 1 ] <======> [ Route Reflector 2 ]
             /            \                 /            \
            /              \               /              \
[ Worker Node A ]  [ Worker Node B ] [ Worker Node C ]  [ Worker Node D ]
```

### Implementing BGP Peering in Calico

To configure route reflectors, modify Calico's `BGPConfiguration` and `BGPPeer` custom resources. First, disable the default full-mesh behavior:

```yaml
apiVersion: projectcalico.org/v3
kind: BGPConfiguration
metadata:
  name: default
spec:
  logSeverityScreen: Info
  nodeToNodeMeshEnabled: false # Disable full mesh
  asNumber: 64512
```

Next, label specific nodes to act as route reflectors (e.g., `route-reflector: true`) and configure a `BGPPeer` resource telling worker nodes to peer with them:

```yaml
apiVersion: projectcalico.org/v3
kind: BGPPeer
metadata:
  name: peer-to-route-reflectors
spec:
  nodeSelector: all()
  peerSelector: has(route-reflector)
```

Finally, configure the route reflectors to peer with each other for high availability and route consistency:

```yaml
apiVersion: projectcalico.org/v3
kind: BGPPeer
metadata:
  name: route-reflectors-mesh
spec:
  nodeSelector: has(route-reflector)
  peerSelector: has(route-reflector)
```

With `nodeToNodeMeshEnabled: false` in place, a worker node now maintains only as many BGP sessions as there are route reflectors (typically 2-3, for redundancy) instead of `N-1` sessions — the connection count becomes constant instead of scaling with cluster size.

## Underlying Network Constraints

Calico's unencapsulated BGP routing requires the underlying cloud or datacenter network to actually permit this traffic:

- **On-premises**: the physical switches must often be configured to peer with the Calico nodes (or route reflectors) to learn the pod CIDRs — this is a real coordination point with the network team, not just a Kubernetes-side config change.
- **Public clouds (AWS, GCP)**: the native fabric often drops packets carrying unknown source/destination IPs (a "source/dest check"). To work around this without falling back to overlays, cloud-specific routing integrations are used (AWS VPC CNI-style ENI routes, or GCP Alias IP ranges), or Calico falls back to IP-in-IP specifically for cross-subnet traffic — known as **Cross-Subnet mode** — while staying unencapsulated within a subnet where native routing already works.

## Verifying the Routing Fabric

Because Calico's BGP routes are just standard kernel routes, ordinary Linux tools work for debugging — no CNI-specific tooling required:

```bash
# Confirm BGP sessions are established between this node and its peers
calicoctl node status

# Inspect the kernel routing table for pod CIDR entries learned via BGP
ip route show | grep bird

# Trace the actual network path a packet takes between two pod IPs
traceroute -n <destination-pod-ip>
```

## Conclusion

Calico's BGP architecture transforms Kubernetes networking from an opaque, encapsulated overlay into a transparent, high-performance Layer 3 fabric. By treating nodes as routers and leveraging a standard, widely-understood protocol, Calico provides strong debugging capability using ordinary networking tools and better raw throughput — provided the underlying infrastructure is prepared to support unencapsulated routing.
