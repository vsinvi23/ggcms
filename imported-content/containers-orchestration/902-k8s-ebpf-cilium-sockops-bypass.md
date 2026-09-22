# eBPF in Kubernetes: Bypassing TCP stack routing using Cilium and sockops

## The Problem: The iptables Bottleneck
For years, Kubernetes networking relied heavily on `kube-proxy` operating in `iptables` mode. When a Service is created, `kube-proxy` translates it into complex iptables NAT rules on every node. 

As clusters scale to thousands of Services and tens of thousands of Pods, this architectural choice fractures. `iptables` evaluates rules linearly (O(N) complexity). Processing a single packet might require traversing thousands of rules. Furthermore, even intra-node communication (Pod A talking to Pod B on the *same* worker node) forces packets to traverse down the container's TCP/IP stack, across the virtual ethernet interface (`veth`), into the host's TCP/IP stack, through the iptables labyrinth, and back up into the destination container. This redundant protocol stack traversal introduces immense latency and CPU overhead.

## The Architecture: eBPF and Sockmap Bypass
extended Berkeley Packet Filter (eBPF) revolutionized Linux networking by allowing sandboxed, verified code to run directly inside the kernel without changing kernel source code or loading unstable modules.

Cilium, an eBPF-native Kubernetes CNI, leverages this to completely bypass `iptables`. But it goes further: for intra-node traffic, Cilium uses a specific eBPF feature called `sockmap` and `sockops`.

```text
Standard iptables Routing (High Latency):
[Pod A App] -> Socket -> Pod TCP/IP -> veth -> Host TCP/IP -> iptables -> Host TCP/IP -> veth -> Pod TCP/IP -> Socket -> [Pod B App]

Cilium eBPF Sockmap Bypass (Near-Zero Latency):
[Pod A App] -> Socket <================== eBPF Sockmap Redirect ==================> Socket -> [Pod B App]
```

When an application in Pod A opens a socket to talk to Pod B, the eBPF program hooked into the kernel's socket layer intercepts the payload. If it detects that both sockets exist on the same node, it short-circuits the entire TCP/IP stack. Data is copied directly from the send buffer of Pod A's socket to the receive buffer of Pod B's socket. 

## Implementation: Enabling Socket-Level Acceleration
To achieve this, you must deploy a CNI that supports eBPF socket acceleration, such as Cilium. `kube-proxy` must be entirely replaced (Cilium's strict `kube-proxy` replacement mode).

### 1. Deploying Cilium in Kube-Proxy Replacement Mode
When installing Cilium via Helm, you disable the standard `kube-proxy` and enable eBPF routing:

```bash
helm install cilium cilium/cilium --version 1.14.0 \
  --namespace kube-system \
  --set kubeProxyReplacement=strict \
  --set k8sServiceHost=API_SERVER_IP \
  --set k8sServicePort=API_SERVER_PORT \
  --set sockops.enabled=true
```

The flag `--set sockops.enabled=true` is the critical component here. It instructs Cilium to attach BPF programs to cgroups, hooking into `BPF_CGROUP_SOCK_OPS`. 

### 2. How it Works Under the Hood
When the `sockops` feature is enabled, Cilium loads an eBPF program that listens for TCP state changes (like `TCP_ESTABLISHED`). When a connection is established between two local endpoints, the eBPF program stores the socket descriptors in an eBPF Map (a highly efficient kernel data structure).

Subsequent `sendmsg()` system calls are intercepted. The kernel queries the eBPF map, finds the destination socket, and executes a `bpf_msg_redirect_hash()` call. The payload skips the physical/virtual network device layers entirely.

### 3. Verifying the Bypass
You can verify that traffic is bypassing the host stack by using the `cilium bpf sockmap list` command inside the Cilium agent pod, which will dump the active socket mappings. 

Additionally, because the traffic never hits the IP layer, network sniffers like `tcpdump` listening on the `veth` interfaces will see *zero* packets during the transmission, while the applications register massive throughput.

## Conclusion
As microservices architectures drive up the volume of East-West RPC traffic, the overhead of standard Linux networking stacks becomes a severe bottleneck. By replacing `kube-proxy` and `iptables` with eBPF-driven CNIs like Cilium, and explicitly enabling `sockops` acceleration, architects can bypass the TCP/IP stack entirely for local traffic, achieving near-bare-metal IPC performance within a heavily containerized environment.
