# eBPF in Kubernetes: Bypassing TCP Stack Routing using Cilium and sockops

### The Problem: Kernel Network Stack Overhead

In traditional Kubernetes networking (e.g., using kube-proxy with iptables or IPVS), pod-to-pod communication on the same physical node traverses a significant portion of the Linux kernel network stack. A packet from Pod A to Pod B goes through the Veth interface, hits the root network namespace, passes through complex iptables/netfilter routing rules, and is finally pushed down into Pod B's Veth interface. This traversal of the TCP/IP stack (packet encapsulation, checksums, context switching) introduces noticeable latency and high CPU overhead, particularly for high-throughput, latency-sensitive microservices (like gRPC meshes or caching layers).

### The Solution: eBPF and TCP Socket Bypass (sockops)

Extended Berkeley Packet Filter (eBPF) allows custom code to run safely within the kernel without altering kernel source code. Using Cilium (an eBPF-based CNI), we can intercept socket operations (`sockops`) directly. When Pod A opens a socket to talk to Pod B on the same node, eBPF identifies that both sockets reside locally and establishes a direct data path, bypassing the lower levels of the TCP/IP stack (IP routing, iptables, qdisc).

### Architecture: iptables vs. eBPF sockops Bypass

```text
Standard TCP/IP Routing (iptables/kube-proxy):
+---------+                               +---------+
|  Pod A  |                               |  Pod B  |
| Socket  |                               | Socket  |
+----|----+                               +----^----+
     v (TCP/IP)                                | (TCP/IP)
+----|----+       +-------------------+   +----|----+
|  Veth A +------>| Root NetNS (Host) +-->|  Veth B |
+---------+       | iptables / routing|   +---------+
                  +-------------------+

Cilium eBPF sockops Bypass:
+---------+                               +---------+
|  Pod A  |                               |  Pod B  |
| Socket  |==============================>| Socket  |
+---------+   eBPF Socket redirect (msg)  +---------+
            (Bypasses Veth, iptables, IP layer)
```

### Implementation: Enabling sockmap in Cilium

To achieve this bypass, Cilium must be configured to use `sockmap` and `sockhash` eBPF maps, which keep track of established socket connections.

#### 1. Prerequisite: Kernel Support

Socket routing requires a modern Linux kernel. Specifically, kernel version `4.19` or higher is required, but `5.7+` or `5.10+` is highly recommended for stability and full feature support regarding sockops.

#### 2. Configuring Cilium via Helm

When deploying or upgrading Cilium via Helm, you enable the socket bypass feature by turning on `sockops.enabled`.

```bash
helm upgrade cilium cilium/cilium \
    --namespace kube-system \
    --reuse-values \
    --set sockops.enabled=true \
    --set bpf.masquerade=true \
    --set kubeProxyReplacement=strict
```

*   `sockops.enabled=true`: Activates the attaching of eBPF programs to socket operations, redirecting traffic directly between socket structures.
*   `kubeProxyReplacement=strict`: Completely removes `kube-proxy`, relying entirely on eBPF for service routing (NodePort, ClusterIP, LoadBalancer).

#### 3. Verifying the BPF Programs

Once Cilium is running with sockops enabled, you can verify that the eBPF programs are attached using the `bpftool` utility on the host node.

```bash
# Log into a Kubernetes worker node
sudo bpftool cgroup tree
```

You should see eBPF programs of type `sock_ops` and `sk_msg` attached to the cgroups associated with your containers. 

To check the socket maps directly within the Cilium agent:

```bash
kubectl exec -it -n kube-system ds/cilium -- cilium bpf sock list
```

This command will output the hash table mapping source IPs/Ports to destination IPs/Ports, confirming that active local connections are being tracked for direct bypass.

### Operational Considerations

*   **Performance Impact:** For workloads that establish long-lived TCP connections and stream large amounts of data (e.g., Redis, Kafka, databases), sockops bypass can reduce CPU usage by up to 15-20% and significantly lower p99 latencies.
*   **Protocol Support:** Currently, eBPF socket bypass primarily benefits TCP traffic. UDP traffic still traverses the standard eBPF datapath (which is still faster than iptables, but doesn't get the direct socket-to-socket bypass).
*   **Visibility:** Because packets bypass the IP layer and tcpdump hooks in the root namespace, standard packet capturing tools on the host might not see the inter-pod traffic. You must rely on Cilium's Hubble observability stack for network flow visibility.
