---
title: "kube-proxy at Scale: From O(N) iptables Chains to O(1) IPVS Lookups"
description: "Why iptables-mode kube-proxy degrades past a thousand Services, how IPVS's hash-table lookups fix it, and the step-by-step migration including conntrack tuning."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "DEEP_DIVE"
tags:
  - "kube-proxy"
  - "ipvs"
  - "iptables"
  - "coredns"
  - "conntrack"
  - "kubernetes-networking"
---

# kube-proxy at Scale: From O(N) iptables Chains to O(1) IPVS Lookups

## The Problem: The O(N) Scaling Limit of iptables

As Kubernetes clusters scale to hundreds of Services and thousands of Pods, the default `kube-proxy` networking mode — built on `iptables` — becomes a severe performance bottleneck. Every Service and Endpoint in Kubernetes translates to a set of sequential `iptables` rules on every node. When a packet is sent to a Service's `ClusterIP`, the Linux kernel must traverse these rules sequentially to find a match and perform Destination Network Address Translation (DNAT).

This linear search has time complexity $O(N)$, where $N$ is the number of rules. In clusters with over 1,000 Services, the rule list can easily grow to tens of thousands of lines. At this scale, packet traversal induces significant CPU overhead in the `ksoftirqd` kernel process, causing packet-processing delays and network throughput degradation.

`iptables` also relies heavily on `conntrack` (connection tracking) to maintain connection states. High-throughput microservice architectures frequently exhaust the `conntrack` state table, manifesting as `conntrack: table full` errors, dropped packets, and intermittent 5-second DNS timeouts caused by race conditions during concurrent UDP resolution attempts in CoreDNS — a symptom many teams first notice as flaky DNS rather than a routing problem.

## Mental Model: Packet Flow from CoreDNS to Backend Pods

```text
[ Pod Container ]
       │
       ├─ (1) Queries ClusterIP of CoreDNS ──────> [ CoreDNS Pod ]
       │                                                 │
       ├─ (2) Receives backend Pod ClusterIP <───────────┘
       │
       └─ (3) Sends HTTP traffic to ClusterIP
                 │
                 v
     [ Linux Kernel Network Stack ]
                 │
        Mode? ───┼───────────> [ iptables mode ]
                 │                    │ (O(N) sequential rule matching)
                 │                    v
                 │                    └─ Rule 1542: Match! DNAT to Pod IP
                 │
                 └───────────> [ IPVS Mode ]
                                      │ (O(1) Hash-table lookup via ipset)
                                      └─ Direct Match! DNAT to Pod IP
                                                 │
                                                 v
                                        [ Target Pod IP ]
```

## The Architectural Solution: IPVS (IP Virtual Server)

IPVS is a transport-layer (L4) load-balancing subsystem built directly into the Linux kernel as part of the Netfilter framework. Instead of a flat linked list like `iptables`, IPVS organizes its virtual server rules into a hash table. This structured lookup reduces search complexity from $O(N)$ to $O(1)$ — routing lookup time stays roughly constant whether the cluster has 10 Services or 10,000.

IPVS uses `ipset` to manage IP addresses and ports collectively, preventing the kernel from being overwhelmed by millions of discrete rules. It also operates in kernel space and supports several load-balancing algorithms:

- **Round-Robin (`rr`)**: directs traffic sequentially.
- **Least-Connections (`lc`)**: routes to the backend pod with the fewest active connections.
- **Source Hashing (`sh`)**: routes traffic based on client IP to enforce session stickiness.

## Implementation: Upgrading kube-proxy to IPVS Mode

### Step 1: Load Linux Kernel Modules

IPVS-mode kube-proxy needs the IPVS kernel modules present on every worker node. Load them and persist the change across reboots:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Required IPVS modules
modules=(
  ip_vs
  ip_vs_rr
  ip_vs_wrr
  ip_vs_sh
  nf_conntrack
)

for mod in "${modules[@]}"; do
  modprobe "$mod"
done

printf '%s\n' "${modules[@]}" | sudo tee /etc/modules-load.d/ipvs.conf
```

### Step 2: Configure the kube-proxy ConfigMap

Modify the `kube-proxy` configuration in the `kube-system` namespace. Set `mode` to `ipvs` and specify a scheduling algorithm:

```yaml
apiVersion: kubeproxy.config.k8s.io/v1alpha1
kind: KubeProxyConfiguration
bindAddress: 0.0.0.0
clientConnection:
  acceptContentTypes: ""
  contentType: application/vnd.kubernetes.protobuf
  kubeconfig: /var/lib/kube-proxy/kubeconfig
  qps: 10
  burst: 20
mode: "ipvs"
ipvs:
  excludeCIDRs: null
  minSyncPeriod: 0s
  scheduler: "rr"
  syncPeriod: 30s
```

Apply the change and trigger a rollout restart of the `kube-proxy` DaemonSet:

```bash
kubectl edit configmap kube-proxy -n kube-system
kubectl rollout restart daemonset kube-proxy -n kube-system
```

### Step 3: Verify the Upgrade

Confirm `kube-proxy` correctly initialized the IPVS proxier:

```bash
kubectl logs -n kube-system -l k8s-app=kube-proxy | grep "Using ipvs Proxier"
```

Log in to a worker node and use `ipvsadm` to inspect the active hash tables:

```bash
# Install the user-space administration tool
sudo apt-get install -y ipvsadm

# List active virtual services and target real servers
sudo ipvsadm -ln
```

Each line of `ipvsadm -ln` output corresponds to a Service `ClusterIP:port` (the "virtual server") and its backing pod endpoints (the "real servers") — this is the IPVS equivalent of grepping through thousands of `iptables -L` rules, but returned as a flat, readable table regardless of Service count.

## Tuning conntrack for High-Throughput Cluster Networking

Even with IPVS, busy clusters can still hit connection-tracking limits, since `conntrack` sits below both proxy modes. Tune the kernel parameters on worker nodes:

```bash
# Increase maximum conntrack table size
sysctl -w net.netfilter.nf_conntrack_max=1048576

# Reduce timeout for established TCP connections
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_established=86400
```

Raising `nf_conntrack_max` gives the table more headroom before a burst of new connections starts getting dropped with `conntrack: table full`; shortening the established-connection timeout reclaims entries for long-lived idle connections faster, which matters in clusters with many short bursty connections (e.g., serverless-style request/response workloads) rather than a few long-lived streaming ones.

## Conclusion

Transitioning `kube-proxy` from `iptables` to `ipvs` mode replaces an $O(N)$ sequential rule scan with an $O(1)$ hash-table lookup, keeping Service routing latency flat as the cluster grows past hundreds or thousands of Services. Combined with `conntrack` tuning, this gives clusters stable, scalable Service routing that keeps pace with demanding microservice scaling requirements — though for the largest, most latency-sensitive clusters, teams increasingly skip `kube-proxy` altogether in favor of an eBPF-based CNI like Cilium.
