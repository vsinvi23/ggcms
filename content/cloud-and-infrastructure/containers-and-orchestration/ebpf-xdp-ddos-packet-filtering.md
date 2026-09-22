---
title: "eBPF and XDP: Kernel-Bypass Packet Filtering for DDoS Mitigation"
description: "How the Express Data Path (XDP) hook lets eBPF programs drop malicious packets at the NIC driver, before the Linux kernel allocates an sk_buff, and how to write and load an XDP filter."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "DEEP_DIVE"
tags:
  - "ebpf"
  - "xdp"
  - "ddos-mitigation"
  - "linux-networking"
  - "packet-filtering"
---

# eBPF and XDP: Kernel-Bypass Packet Filtering for DDoS Mitigation

## The Problem: The Bottleneck of the Linux Network Stack

When a high-volume Distributed Denial of Service (DDoS) attack hits a Linux server, traditional firewall mechanisms like `iptables` or `nftables` often fail to keep the server online, even if they successfully drop the malicious packets.

The failure occurs because of *where* these firewalls operate. By the time a packet reaches `iptables`, it has already traversed a significant portion of the Linux networking stack. The kernel has allocated an `sk_buff` (socket buffer) memory structure, performed MAC header parsing, and interrupted the CPU. In a volumetric attack (millions of packets per second), the sheer CPU overhead of allocating memory and processing malicious packets exhausts system resources. The server succumbs to CPU starvation before the application ever sees the traffic.

A concrete scenario: a public-facing API server is expected to receive only TCP/HTTPS traffic on port 443, but an attacker floods it with UDP packets at line rate. Every one of those packets currently costs the kernel a full `sk_buff` allocation and a walk through Netfilter rules just to be dropped — the "defense" itself becomes the resource exhaustion vector.

## The Solution: eBPF and the Express Data Path (XDP)

Extended Berkeley Packet Filter (eBPF) allows developers to run sandboxed, verified code safely inside the Linux kernel without changing kernel source code or loading unverified kernel modules.

The **Express Data Path (XDP)** is a hook point for eBPF programs situated at the lowest point in the Linux network stack. An XDP program executes directly within the network device driver, immediately after the NIC receives the packet — and crucially, *before* the kernel allocates an `sk_buff` or begins standard protocol processing.

By attaching an eBPF program to the XDP hook, you can parse packets and make drop/pass decisions at near line-rate speeds, mitigating volumetric attacks with virtually zero CPU overhead.

### The Mental Model: The Bouncer at the Gate

Imagine a nightclub. `iptables` is the security guard inside the club checking IDs after you've already walked in, taken up space, and caused a scene. XDP is the bouncer standing out on the street, stopping malicious actors before they even step onto the property.

```text
[ Physical NIC ]  --->  [ NIC Driver (XDP Hook) ]  ---> [ Linux Network Stack (sk_buff) ]  ---> [ iptables ] ---> [ Application ]
                                   |
                         (eBPF Program runs here)
                                   |
                             [ DROP / PASS ]
```

## How XDP Works: Return Codes

An XDP program is typically written in a restricted subset of C, compiled to eBPF bytecode using LLVM/Clang, and injected into the kernel via the verifier (which statically proves the program terminates and cannot access arbitrary memory).

When a packet arrives, the XDP program inspects the raw packet bytes and returns one of several action codes telling the driver what to do:

- **`XDP_PASS`**: The packet is safe. Pass it up to the normal Linux network stack.
- **`XDP_DROP`**: The packet is malicious. Drop it instantly. No memory is allocated, and the CPU cost is negligible.
- **`XDP_TX`**: Modify the packet and bounce it back out the same network interface (useful for load balancing).
- **`XDP_REDIRECT`**: Send the packet out a different network interface or directly into a specialized user-space socket (`AF_XDP`).

## Example: Dropping Unexpected UDP Traffic with XDP

Consider an XDP program designed to drop all UDP traffic on a server that only expects TCP/HTTP traffic:

```c
#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/in.h>

SEC("xdp_drop_udp")
int xdp_prog(struct xdp_md *ctx) {
    // Pointers to the start and end of the raw packet data
    void *data = (void *)(long)ctx->data;
    void *data_end = (void *)(long)ctx->data_end;

    // Parse the Ethernet header
    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end)
        return XDP_PASS; // Packet too small, let the stack handle it

    // Check if it's an IPv4 packet
    if (eth->h_proto != __constant_htons(ETH_P_IP))
        return XDP_PASS;

    // Parse the IP header
    struct iphdr *ip = (void *)(eth + 1);
    if ((void *)(ip + 1) > data_end)
        return XDP_PASS;

    // If the protocol is UDP, drop it instantly at the NIC
    if (ip->protocol == IPPROTO_UDP) {
        return XDP_DROP;
    }

    // Otherwise, allow it through
    return XDP_PASS;
}

char _license[] SEC("license") = "GPL";
```

Every branch in this program explicitly checks pointer bounds (`(void *)(eth + 1) > data_end`) before dereferencing — the eBPF verifier rejects any program that cannot prove it stays within the packet buffer. This is what makes it safe to run arbitrary logic inside the kernel: a bug results in a rejected load, not a crashed kernel.

### Loading the Program

Once compiled into an object file (e.g., `xdp_filter.o`), administrators use `iproute2` to attach the program to a network interface (e.g., `eth0`):

```bash
# Compile with clang targeting the BPF backend
clang -O2 -g -target bpf -c xdp_filter.c -o xdp_filter.o

# Attach the compiled program to eth0's XDP hook
ip link set dev eth0 xdp obj xdp_filter.o sec xdp_drop_udp

# Confirm it's attached
ip link show eth0 | grep xdp

# Detach it if you need to roll back
ip link set dev eth0 xdp off
```

The moment the attach command executes, the NIC driver begins executing the eBPF code on every incoming packet. Millions of UDP packets can be discarded per second while CPU utilization remains near zero, keeping the server fully responsive for legitimate TCP traffic.

### Driver Modes: Native, Offloaded, and Generic

XDP can run in three modes, and the mode you get depends on hardware and driver support:

- **Native XDP**: the program runs inside the NIC driver itself. This is the fast path described above and requires driver support (most modern Intel `ixgbe`/`i40e`, Mellanox `mlx5`, and virtio-net drivers support it).
- **Offloaded XDP**: the program is compiled and pushed onto a SmartNIC that executes it directly on the network card's own processor, bypassing the host CPU entirely. Only a small set of NICs (e.g., Netronome) support this.
- **Generic XDP (`SKB` mode)**: a software fallback for NICs/drivers without native support. The kernel still builds the `sk_buff` first, then invokes the XDP program — losing most of the performance advantage, but useful for testing.

## Conclusion

eBPF and XDP represent a paradigm shift in Linux network performance and security. By shifting packet processing out of the heavy Linux network stack and down into the device driver, XDP lets software-defined systems achieve near-hardware-level packet filtering speeds. For hyperscalers like Cloudflare and Meta, XDP is the foundational technology powering their global DDoS mitigation networks. In Kubernetes environments, this same hook is what CNIs like Cilium build on to bypass `iptables`/`kube-proxy` entirely for Service routing.
