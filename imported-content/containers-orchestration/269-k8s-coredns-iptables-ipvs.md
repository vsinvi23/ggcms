# Kubernetes Services: CoreDNS Routing, iptables Bottlenecks, and the IPVS Upgrade

## The Problem: The O(N) Scaling Limit of iptables
As Kubernetes clusters scale to host hundreds of Services and thousands of Pods, the default `kube-proxy` networking mode—built on `iptables`—becomes a severe performance bottleneck. Every Service and Endpoint in Kubernetes translates to a set of sequential `iptables` rules on every single node. When a packet is sent to a Service's `ClusterIP`, the Linux kernel must traverse these rules sequentially to find a match and perform Destination Network Address Translation (DNAT).

This linear search has a time complexity of $O(N)$, where $N$ is the number of rules. In clusters with over 1,000 Services, the rule list can easily grow to tens of thousands of lines. At this scale, packet traversal induces significant CPU overhead in the `ksoftirqd` kernel process, causing packet-processing delays and network throughput degradation.

Additionally, `iptables` relies heavily on `conntrack` (connection tracking) to maintain connection states. High-throughput microservice architectures frequently exhaust the `conntrack` state table, manifesting as `conntrack: table full` errors, dropped packets, and intermittent 5-second DNS timeouts caused by race conditions during concurrent UDP resolution attempts in CoreDNS.

## Mental Model: Packet Flow from CoreDNS to Backend Pods
The diagram below traces DNS query resolution and routing lookup under different proxier modes.

```
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
IPVS is a transport-layer (L4) load-balancing subsystem built directly into the Linux kernel as part of the Netfilter framework. Instead of using a flat linked list like `iptables`, IPVS organizes its virtual server rules into a highly optimized hash table. This structured lookup reduces search complexity from $O(N)$ to $O(1)$. Regardless of whether your cluster has 10 or 10,000 Services, routing lookup times remain constant and near-instantaneous.

IPVS utilizes `ipset` to manage IP addresses and ports collectively. This prevents the kernel from being overwhelmed by millions of discrete network rules. Furthermore, IPVS operates in kernel space, offering advanced load-balancing algorithms such as:
- **Round-Robin (`rr`)**: Directs traffic sequentially.
- **Least-Connections (`lc`)**: Routes to the backend pod with the fewest active connections.
- **Source Hashing (`sh`)**: Routes traffic based on client IP to enforce session stickiness.

## Implementation: Upgrading kube-proxy to IPVS Mode
To transition a cluster from `iptables` to `ipvs` mode, you must first load the required kernel modules on all cluster worker nodes.

### Step 1: Load Linux Kernel Modules
Create a script to load these modules and ensure they persist across reboots:

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

### Step 2: Configure kube-proxy ConfigMap
Modify the `kube-proxy` configuration in the `kube-system` namespace. Set the mode field to `ipvs` and specify your preferred scheduling algorithm.

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

Apply this changes and trigger a rollout restart of the `kube-proxy` DaemonSet:
```bash
kubectl edit configmap kube-proxy -n kube-system
kubectl rollout restart daemonset kube-proxy -n kube-system
```

### Step 3: Verify the Upgrade
Confirm that `kube-proxy` has correctly initialized the IPVS proxier:
```bash
kubectl logs -n kube-system -l k8s-app=kube-proxy | grep "Using ipvs Proxier"
```

Log in to a worker node and run the `ipvsadm` utility to inspect the active hash tables:
```bash
# Install the user-space administration tool
sudo apt-get install -y ipvsadm

# List active virtual services and target real servers
sudo ipvsadm -ln
```

## Tuning conntrack for High-Throughput Cluster Networking
Even with IPVS, busy clusters can encounter connection tracking bottlenecking. To prevent conntrack tables from filling up, fine-tune the system parameters on your nodes:

```bash
# Increase maximum conntrack table size
sysctl -w net.netfilter.nf_conntrack_max=1048576

# Reduce timeout for established TCP connections
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_established=86400
```

By transitioning to IPVS and tuning your kernel's connection limits, you ensure stable, scalable routing that keeps up with demanding microservice scaling requirements.
