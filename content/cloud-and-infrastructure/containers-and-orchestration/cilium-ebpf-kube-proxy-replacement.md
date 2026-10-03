---
title: "Cilium kube-proxy Replacement: eBPF Service Routing at O(1)"
description: "How to configure Cilium's kube-proxy-replacement mode to route Kubernetes Service traffic entirely in eBPF, eliminating iptables/IPVS and the kube-proxy DaemonSet."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "GUIDE"
tags:
  - "cilium"
  - "ebpf"
  - "kube-proxy-replacement"
  - "kubernetes-networking"
  - "xdp"
---

# Cilium kube-proxy Replacement: eBPF Service Routing at O(1)

## The Problem: iptables Wasn't Built for Cloud-Native Scale

As Kubernetes clusters scale to hundreds of nodes and thousands of Services, traditional network routing mechanisms hit a processing ceiling. By default, `kube-proxy` configures the Linux kernel's `iptables` or `IPVS` subsystems to implement Service load balancing. But `iptables` in particular requires a sequential $O(N)$ evaluation of packet filtering rules — for each new connection, the kernel must traverse potentially thousands of rules, incurring CPU overhead, added latency, and slower service routing as the rule count grows.

By replacing `iptables` with eBPF via Cilium, operators route packets directly at the socket or driver level, bypassing the overhead of `kube-proxy` entirely.

## The iptables Bottleneck vs eBPF Socket Routing

Under a traditional `kube-proxy` setup, every packet crawls through a chain of Netfilter rules in the Linux kernel networking stack:

```text
[ Packet Ingress ]
       │
       ▼
 [ Netfilter ] ──► [ iptables Chains ] ──► [ Sequential Search (O(N)) ] ──► [ Route to Pod ]
```

With Cilium and eBPF, sandboxed programs run inside the kernel at the NIC or socket layer. Instead of a linear search, eBPF uses BPF maps (hash tables) to perform $O(1)$ lookups, routing packets directly to the destination socket:

```text
[ Packet Ingress ]
       │
       ▼ (XDP / eBPF Hook)
  [ eBPF Map Lookup (O(1)) ] ──────► [ Direct Socket Redirection ] ──────► [ Route to Pod ]
```

This bypasses the entire Netfilter IP routing path, minimizing CPU cycles and context switches per packet.

## Implementing Cilium Without kube-proxy

To achieve pure eBPF routing, configure Cilium in `kube-proxy-replacement` mode. This requires disabling `kube-proxy` during cluster initialization (or deleting its DaemonSet on an existing cluster), letting Cilium take over all Service load balancing.

Below is a production `values.yaml` for deploying Cilium via Helm, replacing `kube-proxy` and enforcing direct routing:

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
# Avoids an unnecessary node-to-node hop back to the originating node
dsr:
  enabled: true

# Configure tunnel mode. "disabled" enables direct routing (native routing).
# If native routing is used, ensure your network infrastructure can route pod IPs.
tunnel: "disabled"
autoDirectNodeRoutes: true

# Enable Cilium Network Policies enforcement at the kernel level
cni:
  exclusive: true
```

### Installation Command

```bash
helm install cilium cilium/cilium \
  --namespace kube-system \
  --values cilium-values.yaml
```

`k8sServiceHost`/`k8sServicePort` must point directly at the API server (not its in-cluster Service IP) because Cilium's own eBPF datapath is what normally resolves that Service IP — pointing it at itself during bootstrap creates a chicken-and-egg dependency the agent can't resolve on first start.

## Core eBPF Networking Components

### 1. eXpress Data Path (XDP)

XDP runs eBPF code directly at the network driver level, before any `sk_buff` memory allocation happens in the kernel. This lets Cilium perform high-speed DDoS mitigation and packet filtering, discarding malicious traffic before it consumes host resources — the same hook described in dedicated XDP filtering write-ups, just wired into Cilium's own datapath rather than a hand-written filter.

### 2. Socket Layer Enforcement (sockops)

Cilium can attach eBPF programs to socket operations (`sockops`). When two pods on the same node communicate, this lets Cilium bypass the TCP/IP stack entirely for that connection, copying data directly between the sender and receiver socket buffers.

### 3. BPF Maps

BPF maps are key-value structures shared between kernel and userspace. Cilium uses them to track connections, active sessions, and Kubernetes Service configurations, allowing instant routing updates without expensive rule recompilation — a Service endpoint change is a map update, not a rewrite of thousands of `iptables` rules.

## Verifying kube-proxy Is Actually Gone

After a `kube-proxy-replacement` install, confirm there's no leftover `iptables`-based routing still in play:

```bash
# Confirm no kube-proxy pods remain
kubectl get pods -n kube-system -l k8s-app=kube-proxy

# Confirm Cilium reports kube-proxy-replacement as active
kubectl exec -n kube-system ds/cilium -- cilium status --verbose | grep -A 3 "KubeProxyReplacement"

# Confirm Service routing is served entirely from BPF maps
kubectl exec -n kube-system ds/cilium -- cilium service list
```

## Performance and Scalability Benefits

- **O(1) scalability**: routing lookup complexity remains constant whether the cluster has 10 or 10,000 Services.
- **CPU offloading**: CPU cycles previously spent walking Netfilter rules are reclaimed for application workloads.
- **Transparent Service load balancing**: clients communicate with endpoints without extra hops from double-NATing.

## Conclusion

Transitioning to Cilium's eBPF-based architecture equips a Kubernetes cluster to handle far higher connection churn and Service counts with minimal per-packet overhead, and removes an entire class of `kube-proxy`/`iptables` operational issues (stale rules, sync lag, rule-count-driven CPU spikes) by replacing them with a constant-time in-kernel map lookup.
