---
title: "eBPF and Cilium: Replacing kube-proxy's iptables Bottleneck"
description: "Why kube-proxy's iptables mode degrades at scale into sequential O(n) rule scans, and how Cilium's eBPF-based kube-proxy replacement uses O(1) hash map lookups at the kernel level instead."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "DEEP_DIVE"
tags:
  - "ebpf"
  - "cilium"
  - "kube-proxy"
  - "kubernetes-networking"
  - "iptables"
  - "cni"
---

# eBPF and Cilium: Replacing kube-proxy's iptables Bottleneck

A cluster running a few dozen Services performs fine with the default `kube-proxy` iptables mode. The same cluster at a few thousand Services and tens of thousands of Pods starts showing symptoms that look like generic "network slowness": elevated per-packet latency, high CPU usage on nodes that aren't running any particularly heavy workloads, and Service endpoint updates that take visibly longer to propagate. The root cause is architectural, not a misconfiguration — `iptables`, as a rule-evaluation engine, was never designed for the scale a Service-mesh-heavy Kubernetes cluster produces.

---

## Why iptables degrades at scale

`kube-proxy` in iptables mode writes a Netfilter rule (or chain of rules) for every Service-to-Pod mapping. `iptables` evaluates rules as an **ordered, sequential list** — a design dating to the 1990s, built for a modest, largely static rule count. In a cluster with thousands of Services and Pods, `kube-proxy` can generate tens of thousands of individual rules. Every incoming packet must be checked against that list from the top, in the worst case, for every rule — an O(n) linear scan repeated per packet.

The consequences compound as the cluster grows:

- **CPU overhead** rises with rule count, not with actual traffic volume.
- **Latency** increases because more packets require walking further down the chain before a match.
- **Rule propagation** (adding/removing an endpoint) becomes visibly slower because the entire ruleset must be rewritten.

---

## eBPF as the structural fix

**eBPF (Extended Berkeley Packet Filter)** lets a small, verified program run directly inside the kernel, attached to specific hook points (like the network interface's receive path), without the overhead of traversing a Netfilter rule chain. Instead of an ordered list, eBPF programs typically use **hash maps** for lookups — O(1) regardless of how many Services or endpoints exist.

```text
[ Legacy iptables routing ]
NIC -> TCP/IP stack -> Netfilter hooks -> iptables (sequential O(n) scan) -> socket -> Pod

[ eBPF routing with Cilium ]
NIC -> eBPF hook (XDP/TC) -> eBPF map lookup (O(1) hash map) -> socket -> Pod
```

Think of `iptables` as a toll booth where every car stops and has its paperwork checked against a long, unindexed printed list. eBPF instead injects a purpose-compiled micro-program directly into the kernel's packet path: it intercepts the packet at the NIC, does a single hash-map lookup, and forwards it — no chain traversal at all.

**Cilium**, a CNI built on eBPF, is the most common way this reaches a real Kubernetes cluster. It can fully replace `kube-proxy`, eliminating the iptables/IPVS layer entirely.

---

## How the replacement actually works

When Cilium runs in **kube-proxy replacement mode**, it stops relying on `kube-proxy` to sync rules at all. Instead, Cilium watches the Kubernetes API directly for Service and Endpoint changes, and compiles those changes straight into eBPF programs and maps, attaching them to the kernel via **XDP** (eXpress Data Path, the earliest possible interception point on the NIC) or **TC** (Traffic Control, a later hook in the stack).

This buys three concrete things:

1. **Near-native throughput** — packet routing decisions happen via a single hash lookup instead of a rule-chain walk, so CPU overhead stays roughly flat as Service count grows.
2. **Instant convergence** — adding or removing an endpoint updates a hash map entry directly, rather than requiring a full ruleset rewrite.
3. **Layer 7 visibility** — because eBPF operates at the socket layer, Cilium (via its observability component, Hubble) can enforce and observe policy at the HTTP/gRPC/Kafka level, not just IP:port — something a pure iptables-based data plane cannot do.

---

## Installing Cilium as a kube-proxy replacement

### 1. Bootstrap the cluster without kube-proxy

```bash
kubeadm init --skip-phases=addon/kube-proxy
```

### 2. Install Cilium with `kubeProxyReplacement` enabled

```bash
helm repo add cilium https://helm.cilium.io/

helm install cilium cilium/cilium \
  --namespace kube-system \
  --set kubeProxyReplacement=true \
  --set k8sServiceHost=192.168.1.100 \
  --set k8sServicePort=6443 \
  --set bpf.masquerade=true
```

Replace `192.168.1.100`/`6443` with the real API server address — Cilium needs to reach the control plane directly since it can no longer rely on `kube-proxy`-managed routing to find it. `bpf.masquerade=true` additionally moves Source NAT (SNAT) for egress traffic into eBPF, removing the last iptables dependency for outbound connections too.

### 3. Verify the replacement is active

```bash
kubectl exec -it -n kube-system ds/cilium -- cilium status

# KubeProxyReplacement: True   [eth0 (Direct Routing)]
```

Checking the host's own `iptables` ruleset afterward should show it essentially empty for Service routing — confirming Cilium's eBPF maps, not Netfilter chains, are handling traffic.

---

## Key takeaways

1. `iptables`-mode `kube-proxy` degrades because it evaluates Service routing as a sequential rule list — the cost scales with total Service/endpoint count, not with actual traffic.
2. eBPF replaces that sequential scan with O(1) hash-map lookups executed directly in the kernel at the packet's earliest interception point (XDP/TC).
3. Cilium's kube-proxy replacement mode requires bootstrapping the cluster without the default `kube-proxy` addon, and pointing Cilium at the API server explicitly since it no longer benefits from `kube-proxy`-managed cluster routing.
4. Because eBPF operates at the socket layer, Cilium can additionally provide Layer 7 policy enforcement and flow observability (via Hubble) that a pure iptables data plane structurally cannot offer.
