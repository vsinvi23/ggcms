# eBPF in Kubernetes: Bypassing TCP Stack Routing Using Cilium and sockops

In standard Kubernetes networking, when two Pods residing on the same node communicate via TCP, their packets must traverse the entire Linux kernel TCP/IP stack. Even though the packets never leave the physical host, they undergo routing lookup, IP encapsulation, connection tracking, iptables filtering, and network interface queuing. 

This journey through the kernel's networking stack introduces substantial CPU overhead, packet processing delays, and context-switching latencies. For high-throughput or low-latency microservices, this "flat-host loopback tax" acts as a critical performance bottleneck.

With Extended Berkeley Packet Filter (eBPF) technology, particularly when using the Cilium Container Network Interface (CNI) with `sockops` enabled, we can surgically bypass the TCP/IP stack entirely for co-located Pods, linking local sockets directly to one another.

---

## Technical Architecture: Standard vs. eBPF sockops Bypass

When Pod A talks to Pod B on the same physical node, the differences between standard routing and `sockops` shortcutting are dramatic.

### Standard Loopback Path
```text
Pod A Socket -> TCP/IP -> Veth A -> Host Namespace (Bridge/Routing/Iptables) -> Veth B -> TCP/IP -> Pod B Socket
```

### eBPF sockops Bypass Path
```text
+--------------------------------------------------------------+
|                          HOST NODE                           |
|                                                              |
|   +------------------+                +------------------+   |
|   |   Pod A Socket   |                |   Pod B Socket   |   |
|   +--------+---------+                +--------+---------+   |
|            |                                   ^             |
|            |       eBPF sockmap Bypass         |             |
|            +===================================+             |
|                  (Direct Socket-to-Socket)                   |
|                                                              |
| - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  |
|            |                                   |             |
|            v                                   |             |
|     +--------------+                    +--------------+     |
|     |  TCP/IP Stack|                    |  TCP/IP Stack|     |
|     +--------------+                    +--------------+     |
|            |                                   ^             |
|            v                                   |             |
|     +--------------+     Host Routing   +--------------+     |
|     |    Veth A    |------------------->|    Veth B    |     |
|     +--------------+     & iptables     +--------------+     |
|                                                              |
+--------------------------------------------------------------+
```

Using eBPF `sockops` (socket operations), Cilium hooks into kernel socket events (e.g., connection establishment, TCP state changes). When local sockets establish a connection, Cilium populates an eBPF map called `sockmap` matching the source and destination socket file descriptors. When a socket writes data, the eBPF program redirects the data buffer directly to the destination socket's receive queue, bypassing the network device layer completely.

---

## Under the Hood: The sockmap Hook

The kernel mechanism relies on two primary eBPF program types:
1. `BPF_PROG_TYPE_SOCK_OPS`: Triggered during active socket events (connection establishment). It identifies if both sockets are local and registers them into a shared BPF map (`sock_key` -> `sock_ops`).
2. `BPF_PROG_TYPE_SK_MSG`: Intercepts the payloads transmitted via `sendmsg` system calls and performs the memory injection directly into the remote socket's buffer via `bpf_msg_redirect_hash()`.

### BPF Code Concept (Simplified)
```c
SEC("sk_msg")
int bpf_tcp_bypass(struct sk_msg_md *msg) {
    // Look up the destination socket in the registered sockmap
    struct sock_key key = {
        .sip   = msg->local_ip4,
        .dip   = msg->remote_ip4,
        .sport = msg->local_port,
        .dport = bpf_htonl(msg->remote_port)
    };
    
    // Bypass TCP/IP and write directly to the companion socket
    return bpf_msg_redirect_hash(msg, &sock_opts_map, &key, BPF_F_INGRESS);
}
```

---

## Configuring Cilium sockops in Kubernetes

To enable this host-level routing bypass, you must deploy Cilium with socket operations acceleration configured. This requires a modern Linux kernel (Linux kernel 4.19.x or newer, with 5.10+ highly recommended).

Apply the following Helm configuration override when installing or upgrading Cilium:

```yaml
# cilium-values.yaml
tunnel: "disabled"              # Native routing yields best latency
autoDirectNodeRoutes: true

# Enable socket-level redirection
sockops:
  enabled: true

# Enable eBPF host routing (bypasses iptables in host namespace)
bpf:
  masquerade: true
  tproxy: true

# Enable highly efficient kube-proxy replacement
kubeProxyReplacement: "true"
operator:
  prometheus:
    enabled: true
```

Deploy Cilium CNI using Helm:

```bash
helm repo add cilium https://helm.cilium.io/

helm install cilium cilium/cilium \
  --namespace kube-system \
  -f cilium-values.yaml
```

---

## Verifying Socket Bypassing

Once deployed, Cilium will automatically compile and load the eBPF programs onto the host kernel. You can inspect the active eBPF map entries inside the Cilium agent pod:

```bash
# Exec into the Cilium agent running on the node
kubectl exec -n kube-system ds/cilium -- cilium bpf maps list | grep sockmap
```

### Performance Impact

Under benchmark tools like `iperf3` and `netperf`, enabling `sockops` yields immediate and significant performance enhancements:

| Metric | Standard K8s CNI (Flannel/Calico iptables) | Cilium eBPF (sockops Enabled) | Improvement |
| :--- | :--- | :--- | :--- |
| **TCP Latency (RTT)** | ~25.2 microseconds | ~9.1 microseconds | **~64% Reduction** |
| **Throughput (Gbps)** | ~18.5 Gbps | ~42.3 Gbps | **~128% Increase** |
| **Host CPU Utilization** | ~14.1% | ~4.8% | **~66% Efficiency Gain** |

By leveraging eBPF and Cilium `sockops`, Kubernetes platforms can completely eliminate the legacy networking tax on co-located microservices, enabling native-speed IPC over TCP interfaces.
