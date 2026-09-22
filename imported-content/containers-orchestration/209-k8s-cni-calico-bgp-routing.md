# Kubernetes CNI: How Calico Uses BGP to Route Pod IPs Without Encapsulation

## The Problem: The Overhead of Overlay Networks

In traditional Kubernetes network implementations like Flannel, pod-to-pod communication across different nodes often relies on overlay networks using technologies like VXLAN or IP-in-IP. When a pod on Node A wants to speak to a pod on Node B, the original IP packet is encapsulated inside an outer UDP or IP packet.

This encapsulation has a significant cost. The inner packet must be packed and unpacked at every node boundary, consuming CPU cycles and reducing available Maximum Transmission Unit (MTU), which can lead to packet fragmentation and reduced throughput. For high-performance workloads, this overlay overhead is unacceptable. 

## The Solution: Pure Layer 3 Routing with BGP

Calico approaches this problem by treating the Kubernetes cluster as a standard Layer 3 network. Instead of wrapping packets in overlays, Calico assigns routable IP addresses to every pod and utilizes the Border Gateway Protocol (BGP) to distribute these routes across the cluster. 

By running a BGP client (BIRD) on every Kubernetes node, Calico dynamically advertises the IP addresses of the pods running on that node to the rest of the network. This eliminates the need for encapsulation—packets travel natively across the underlying network infrastructure exactly as they would in a traditional datacenter.

### The Mental Model: Nodes as Routers

To understand Calico's BGP routing, visualize every Kubernetes worker node as an autonomous IP router. 

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
4. Node A forwards the packet directly to Node B over the underlying network without any encapsulation.
5. Node B receives the packet, checks its local routing table, and delivers it to Pod B.

## Configuring Calico BGP: Peering Topologies

By default, Calico uses a **Full Mesh** BGP topology. Every node in the cluster peers with every other node. While this works beautifully for smaller clusters (typically under 100 nodes), the number of connections grows exponentially (N * (N-1) / 2), creating unmanageable overhead in large environments.

For enterprise-scale clusters, Calico introduces **BGP Route Reflectors (RR)**. 

### Route Reflector Architecture

Instead of peering with every node, worker nodes peer only with designated Route Reflector nodes. The Route Reflectors are responsible for learning the routes and propagating them to the rest of the cluster.

```text
         [ Route Reflector 1 ] <======> [ Route Reflector 2 ]
             /            \                 /            \
            /              \               /              \
[ Worker Node A ]  [ Worker Node B ] [ Worker Node C ]  [ Worker Node D ]
```

### Implementing BGP Peering in Calico

To configure route reflectors, we modify Calico's `BGPConfiguration` and `BGPPeer` custom resources. First, we disable the default full-mesh behavior:

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

Next, we label specific nodes to act as route reflectors (e.g., `route-reflector: true`) and configure the `BGPPeer` resource to tell the worker nodes to peer with them:

```yaml
apiVersion: projectcalico.org/v3
kind: BGPPeer
metadata:
  name: peer-to-route-reflectors
spec:
  nodeSelector: all()
  peerSelector: has(route-reflector)
```

Finally, we configure the route reflectors to peer with each other to ensure high availability and route consistency:

```yaml
apiVersion: projectcalico.org/v3
kind: BGPPeer
metadata:
  name: route-reflectors-mesh
spec:
  nodeSelector: has(route-reflector)
  peerSelector: has(route-reflector)
```

## Underlying Network Constraints

It is critical to note that Calico's unencapsulated BGP routing requires the underlying cloud or datacenter network to allow this traffic. 
- In on-premises environments, the physical switches must often be configured to peer with the Calico nodes (or route reflectors) to learn the pod CIDRs.
- In public clouds (like AWS or GCP), native fabric often drops packets with unknown source/destination IPs (Source/Dest Check). To work around this without overlays, cloud-specific routing integrations (like AWS VPC CNI or GCP Alias IP ranges) are often used, or Calico is forced to fall back to IP-in-IP specifically for cross-subnet traffic (known as Cross-Subnet mode).

## Conclusion

Calico’s BGP architecture transforms Kubernetes networking from an opaque, encapsulated overlay into a transparent, high-performance Layer 3 fabric. By treating nodes as routers and leveraging standard protocols, Calico provides unparalleled visibility, debugging capability (using standard tools like `traceroute` and `ip route`), and network performance, provided the underlying infrastructure is prepared to support it.