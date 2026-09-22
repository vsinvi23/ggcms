# eBPF in Kubernetes: Bypassing TCP stack routing using Cilium and sockops

### The Problem: Networking Overhead in Microservices
In a high-throughput microservices architecture, network latency and CPU utilization spent processing network packets become significant bottlenecks. When two Pods residing on the same Kubernetes Node communicate, the traffic typically travels down the TCP/IP stack of the sender, through the virtual ethernet (veth) interfaces, into the node's routing/iptables subsystem, back up through the receiving veth, and up the TCP/IP stack of the receiver. This redundant traversing of the kernel network stack for local traffic consumes CPU cycles and adds microsecond-level latency to every request.

### The Solution: eBPF and socket-level redirection
eBPF (Extended Berkeley Packet Filter) allows us to run sandboxed programs within the kernel without modifying kernel source code. Cilium, an eBPF-based CNI, leverages a feature called `sockmap` and `sockops` to intercept socket operations. 

When a socket connection is initiated, Cilium uses eBPF to detect if the destination IP belongs to a Pod running on the *same physical node*. If it does, Cilium bypasses the lower levels of the TCP/IP stack (IP routing, iptables, veth pairs) and directly wires the send socket to the receive socket.

### Architecture: Socket Acceleration

```text
Standard TCP/IP Path:
Pod A (App) -> Socket -> TCP -> IP -> veth0 -> Node IP Routing -> veth1 -> IP -> TCP -> Socket -> Pod B (DB)

eBPF Accelerated Path (sockops):
Pod A (App) -> Socket ------ (eBPF map redirect) ------> Socket -> Pod B (DB)
```

### How eBPF sockops Works
1.  **Connection Establishment**: When a container in Pod A calls `connect()` to reach Pod B, an eBPF program attached to the cgroup (`BPF_PROG_TYPE_SOCK_OPS`) intercepts the call.
2.  **Endpoint Lookup**: The eBPF program consults a BPF map populated by Cilium, containing all local endpoints (Pods) on that specific Node.
3.  **Socket Mapping**: If the destination IP is found in the local endpoint map, the socket is inserted into a `sockmap` (a special BPF map type designed for socket redirection).
4.  **Data Transfer**: When `sendmsg()` is invoked, another eBPF program (`BPF_PROG_TYPE_SK_MSG`) intercepts the data. It looks up the paired socket in the `sockmap` and writes the payload directly into the destination socket's receive queue.

The payload completely bypasses the TCP/IP network layer, avoiding packet encapsulation, checksum calculations, and iptables processing.

### Enabling Socket Acceleration in Cilium
If you are deploying Cilium via Helm, socket acceleration is not always enabled by default, depending on your kernel version (requires Kernel >= 4.19, though >= 5.10 is recommended).

Enable it by setting `bpf.sockopsEnable=true`:

```bash
helm upgrade cilium cilium/cilium --version 1.14.0 \
   --namespace kube-system \
   --set bpf.sockopsEnable=true \
   --reuse-values
```

To verify it is active, you can inspect the cilium agent configuration on a node:
```bash
kubectl exec -it -n kube-system ds/cilium -- cilium status | grep Sockmap
# Expected output: Sockmap: enabled
```

### Performance Implications
The performance gains of `sockops` acceleration are most visible in data-intensive local operations, such as a sidecar proxy (like Envoy in Istio) communicating with its primary application container over localhost, or intensive gRPC chatter between microservices co-located via Pod affinity.

- **Throughput**: TCP throughput can increase by 15-30% due to the elimination of packet processing overhead.
- **Latency**: Tail latency for local requests drops significantly.
- **CPU Savings**: The CPU cycles saved from bypassing the network stack can be returned to the application workloads, improving overall node efficiency.

### Operational Considerations
1.  **Kernel Requirements**: eBPF features are heavily dependent on the Linux kernel version. Ensure your worker nodes run a modern kernel (e.g., Ubuntu 22.04 with 5.15+, or Flatcar Linux).
2.  **Observability**: Because traffic bypasses the lower network layers, traditional packet capture tools like `tcpdump` listening on the `veth` interfaces will not see this accelerated traffic. You must rely on eBPF-aware observability tools, such as Cilium's `Hubble`, which hooks directly into the eBPF layer to provide flow visibility.

By fundamentally altering how data moves between local sockets, eBPF and Cilium transform Kubernetes networking from a series of complex routing rules into high-performance, kernel-native memory copies.