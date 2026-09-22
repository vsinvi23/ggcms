---
title: "Cilium sockops: Bypassing the TCP/IP Stack for Same-Node Pod Traffic"
description: "How Cilium's eBPF sockops/sockmap programs redirect data directly between socket buffers for same-node pod-to-pod TCP traffic, skipping the veth pair and IP stack entirely."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "DEEP_DIVE"
tags:
  - "cilium"
  - "ebpf"
  - "sockops"
  - "sockmap"
  - "kubernetes-networking"
  - "hubble"
---

# Cilium sockops: Bypassing the TCP/IP Stack for Same-Node Pod Traffic

## The Problem: Kernel Network Stack Overhead for Local Traffic

In traditional Kubernetes networking (`kube-proxy` with `iptables` or IPVS), pod-to-pod communication *on the same physical node* still traverses a significant portion of the Linux kernel network stack. A packet from Pod A to Pod B crosses the veth interface, hits the root network namespace, passes through `iptables`/Netfilter routing rules, and is finally pushed down into Pod B's veth interface. This full TCP/IP traversal — encapsulation, checksums, context switching — introduces measurable latency and CPU overhead, especially for high-throughput, latency-sensitive microservices like gRPC meshes or in-memory caching layers, where the two communicating pods are frequently co-located on the same node by design (e.g., a cache sidecar).

## The Solution: eBPF and TCP Socket Bypass (sockops)

eBPF lets custom code run safely inside the kernel without modifying kernel source. Using Cilium, we intercept socket operations (`sockops`) directly. When Pod A opens a socket to talk to Pod B on the same node, eBPF identifies that both sockets are local and establishes a direct data path, bypassing the lower levels of the TCP/IP stack (IP routing, `iptables`, the queuing discipline).

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

## Implementation: Enabling sockmap in Cilium

To achieve this bypass, Cilium must be configured to use `sockmap` and `sockhash` eBPF maps, which track established socket connections and allow an eBPF program to redirect a `sendmsg()` call straight from one socket's send buffer into another socket's receive queue.

### 1. Prerequisite: Kernel Support

Socket routing requires a modern Linux kernel — version `4.19` or higher at minimum, with `5.7+`/`5.10+` strongly recommended for stability and full sockops feature support. Check the kernel version on your worker nodes before enabling this:

```bash
uname -r
```

### 2. Configuring Cilium via Helm

When deploying or upgrading Cilium, enable the socket bypass feature via `sockops.enabled`:

```bash
helm upgrade cilium cilium/cilium \
    --namespace kube-system \
    --reuse-values \
    --set sockops.enabled=true \
    --set bpf.masquerade=true \
    --set kubeProxyReplacement=strict
```

- `sockops.enabled=true`: activates attaching eBPF programs to socket operations, redirecting traffic directly between socket structures for eligible same-node connections.
- `kubeProxyReplacement=strict`: completely removes `kube-proxy`, relying entirely on eBPF for Service routing (NodePort, ClusterIP, LoadBalancer) — sockops bypass is most effective when there's no `iptables` DNAT step left in the path at all.

### 3. Verifying the BPF Programs

Once Cilium is running with sockops enabled, verify the eBPF programs are attached using `bpftool` on the host node:

```bash
# Log into a Kubernetes worker node
sudo bpftool cgroup tree
```

You should see eBPF programs of type `sock_ops` and `sk_msg` attached to the cgroups associated with your containers.

To inspect the socket maps directly within the Cilium agent:

```bash
kubectl exec -it -n kube-system ds/cilium -- cilium bpf sock list
```

This prints the hash table mapping source IP/port pairs to destination IP/port pairs — confirming that active local connections are being tracked for direct bypass. An empty or sparse table despite heavy local pod-to-pod traffic usually means the two peers weren't both established after `sockops.enabled` was turned on (existing connections aren't retroactively redirected).

## Operational Considerations

- **Performance impact**: for workloads with long-lived TCP connections streaming large amounts of data (Redis, Kafka, databases), sockops bypass can reduce CPU usage by roughly 15-20% and noticeably lower p99 latencies for same-node traffic. The gain scales with how much of your traffic is actually co-located on the same node — a service mesh spread evenly across many nodes benefits less than a design with intentional node-local caching sidecars.
- **Protocol support**: eBPF socket bypass currently benefits **TCP** traffic. UDP traffic still traverses the standard eBPF datapath (already faster than `iptables`, but without the direct socket-to-socket bypass).
- **Visibility**: because packets bypass the IP layer entirely, standard `tcpdump` hooks in the root namespace won't see this inter-pod traffic — there's no packet on the wire to capture. You must rely on Cilium's **Hubble** observability stack, which instruments the eBPF datapath itself rather than the kernel's packet-capture hooks:

```bash
# Observe flows including sockops-bypassed same-node traffic
hubble observe --pod pod-a --pod pod-b
```

## Conclusion

`sockops`/`sockmap` is the most aggressive form of eBPF kernel-bypass Cilium offers: rather than just speeding up the routing *decision* (as `kube-proxy-replacement` does), it removes the IP stack traversal for the *data path itself* when both endpoints are known to be local. That makes it a natural pairing with `kubeProxyReplacement=strict` — one removes the routing overhead, the other removes the packet-path overhead for the same-node case — but it does mean standard host-level packet capture stops being a reliable debugging tool, and Hubble becomes required rather than optional for troubleshooting.
