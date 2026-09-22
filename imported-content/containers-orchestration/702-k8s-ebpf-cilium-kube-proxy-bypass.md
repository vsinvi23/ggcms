# Leveraging eBPF in Kubernetes: Bypassing iptables and kube-proxy with Cilium

As Kubernetes clusters scale to hundreds of nodes and thousands of services, traditional network routing mechanisms hit a processing ceiling. Traditionally, Kubernetes relies on `kube-proxy` configuring the Linux kernel's `iptables` or `IPVS` subsystems. However, `iptables` was never designed for dynamic, microsecond-level cloud-native operations. It requires a sequential $O(N)$ evaluation of packet filtering rules. For each new connection, the kernel must traverse thousands of rules, incurring high CPU overhead, packet latency, and slow service routing.

By replacing `iptables` with eBPF (Extended Berkeley Packet Filter) technology via Cilium, operators can route packets directly at the socket level, bypassing the overhead of `kube-proxy` entirely.

---

## The iptables Bottleneck vs eBPF Socket Routing

Under a traditional `kube-proxy` setup, every packet must crawl through a labyrinth of Netfilter chains and iptables rules within the Linux kernel networking stack:

```
[ Packet Ingress ]
       │
       ▼
 [ Netfilter ] ──► [ iptables Chains ] ──► [ Sequential Search (O(N)) ] ──► [ Route to Pod ]
```

With Cilium and eBPF, we execute sandboxed programs inside the kernel at the network interface card (NIC) or socket layer. Instead of searching linearly, eBPF uses highly efficient BPF maps (hash tables) to perform $O(1)$ lookups, routing packets directly to the destination socket:

```
[ Packet Ingress ]
       │
       ▼ (XDP / eBPF Hook)
  [ eBPF Map Lookup (O(1)) ] ──────► [ Direct Socket Redirection ] ──────► [ Route to Pod ]
```

This bypasses the entire Netfilter IP routing table, minimizing CPU cycles and context switches.

---

## Implementing Cilium without kube-proxy

To achieve pure eBPF routing, we configure Cilium in `kube-proxy-replacement` mode. This requires disabling `kube-proxy` during cluster initialization or deleting its daemonset, allowing Cilium to take over all Service load balancing.

Below is the optimized `values.yaml` configuration for deploying Cilium via Helm, replacing `kube-proxy` and enforcing direct routing.

```yaml
# cilium-values.yaml
# Production-grade configuration for kube-proxy-replacement

kubeProxyReplacement: "true"

# Points Cilium directly to the Kubernetes API server
k8sServiceHost: "api-server.internal.cluster.local"
k8sServicePort: "6443"

# Enables eBPF-based masquerading of traffic leaving the cluster node
bpf:
  masquerade: true
  tproxy: true

# Enable socket-level load balancing for local processes
socketLB:
  enabled: true

# Optimize packet transport via Direct Server Return (DSR)
# Avoids unnecessary node-to-node hop back to the originating node
dsr:
  enabled: true

# Configure the tunnel mode. "disabled" enables direct routing (native routing)
# If native routing is used, ensure your network infrastructure can route pod IPs
tunnel: "disabled"
autoDirectNodeRoutes: true

# Enable Cilium Network Policies enforcement at the kernel level
cni:
  exclusive: true
```

### Installation Command
Apply this configuration during Cilium installation:

```bash
helm install cilium cilium/cilium \
  --namespace kube-system \
  --values cilium-values.yaml
```

---

## Core eBPF Networking Components

To understand Cilium’s performance gains, we must examine the specific kernel hooks it utilizes:

### 1. eXpress Data Path (XDP)
XDP runs eBPF code directly at the network driver level, before any memory allocation (sk_buff) occurs in the OS kernel. This allows Cilium to perform high-speed DDoS mitigation and packet filtering, discarding malicious traffic before it consumes host resources.

### 2. Socket Layer Enforcement (sockops)
Cilium attaches eBPF programs to socket operations (`sockops`). When two pods on the same node communicate, Cilium bypasses the TCP/IP stack entirely. It copies data directly from the sender socket’s write buffer to the receiver socket’s read queue, shortening the internal data path.

### 3. BPF Maps
BPF maps are key-value structures shared between the kernel and userspace. Cilium uses maps to track connections, active sessions, and Kubernetes Service configurations, allowing instant routing updates without requiring expensive rule recompilation.

---

## Performance and Scalability Benefits

- **O(1) Scalability:** Routing lookup complexity remains constant whether you have 10 or 10,000 Kubernetes Services.
- **CPU Offloading:** Reclaiming CPU cores previously wasted on executing Netfilter rules inside the kernel.
- **Transparent Service Load Balancing:** Clients can communicate directly with endpoints without double-natting network hops.

Transitioning to Cilium’s eBPF-based architecture equips your Kubernetes cluster to handle massive throughput with minimal system overhead.
