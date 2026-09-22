---
title: "Kubernetes Internals: How the Kubelet Talks to the Container Runtime (CRI)"
description: "A systems-level walkthrough of the Kubelet-to-CRI gRPC protocol, why Kubernetes deprecated Dockershim, and how the pause container anchors a pod's shared namespaces."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "DEEP_DIVE"
tags:
  - "kubelet"
  - "container-runtime-interface"
  - "containerd"
  - "cri-o"
  - "grpc"
  - "pause-container"
  - "kubernetes-internals"
---

# Kubernetes Internals: How the Kubelet Talks to the Container Runtime (CRI)

## The Problem: A Hardcoded, Docker-Only Kubelet

Early Kubernetes hardwired the Kubelet — the per-node agent responsible for running pods — directly against the Docker daemon through an internal shim:

```text
[ Kubelet ] ---> [ Dockershim (hardcoded) ] ---> [ Docker Daemon ] ---> [ libcontainer ]
```

That coupling caused two real problems:

1. **Docker is a whole platform, not a primitive.** It ships a CLI, a network bridge manager, a swarm orchestrator, and volume plugins Kubernetes never uses. All Kubernetes actually needs is "start this process in this set of namespaces and cgroups" — most of Docker's surface area is unnecessary overhead running on every node.
2. **Every new runtime meant a new hardcoded shim.** As alternative runtimes (CoreOS rkt, Hyper.sh) appeared, engineers had to bolt bespoke integration code directly into core Kubelet source, bloating the codebase and making the Kubelet impossible to maintain independently of any one vendor's runtime.

## The Solution: The Container Runtime Interface (CRI)

Kubernetes standardized this boundary as the **Container Runtime Interface** — a gRPC/Protobuf API any runtime can implement, decoupling the Kubelet completely from runtime-specific logic. Dockershim was removed entirely in Kubernetes v1.24 (2022); modern clusters run a dedicated CRI runtime such as **containerd** or **CRI-O**, both of which ultimately hand off to the OCI-standard `runc` to make the actual Linux system calls.

```text
                        THE WORKER NODE
                               |
        ===================================================
        |                                                 |
 [ Kubelet: Chief Architect ]              [ CRI Runtime: General Contractor ]
        |                                                 |
 Holds the blueprint (PodSpec).             Speaks the local "building codes"
 Continuously watches desired               (namespaces, cgroups).
 vs. actual state.                          Physically creates the container
 Commands rebuilds on drift.                 process via runc.
```

The Kubelet does high-level reconciliation and health checking; the CRI runtime does the actual OS-level work.

## The CRI gRPC Protocol Flow

CRI exposes two gRPC services over a local Unix socket: `RuntimeService` (pod/container lifecycle) and `ImageService` (image pull/list/delete). A typical pod start looks like this:

```text
Kubelet                     CRI Runtime (containerd/CRI-O)         CNI Plugin
   |                                    |                              |
   | Pod scheduled to this node         |                              |
   |----- RunPodSandbox(config) ------->|                              |
   |                                    | create net namespace,        |
   |                                    | start pause container        |
   |                                    |---- AddNetworkToSandbox ---->|
   |                                    |<--------- Allocated IP ------|
   |<---------- Sandbox ID -------------|                              |
   |                                    |                              |
   |-- CreateContainer(sandboxId, cfg)->|                              |
   |<---------- Container ID -----------|                              |
   |                                    |                              |
   |----- StartContainer(id) ---------->|                              |
   |                                    | clone(), setns(),            |
   |                                    | cgroup attach                |
   |<------------ Success ---------------|                              |
```

## The Pause Container: Why Sidecars Share an IP

If a pod contains an application container, a logging sidecar, and a proxy, how do all three share one IP address and one `localhost`?

1. The CRI runtime first starts a minimal, otherwise-inert **pause container** using the `pause` image.
2. It creates the pod's network and IPC namespaces attached to this pause container.
3. The CNI plugin allocates and binds the pod's IP address to the pause container's network namespace.
4. Every real container in the pod is then started with `setns()`, joining the *existing* namespaces the pause container already holds — not creating its own.

The pause container has no logic of its own; its only job is to stay alive as the stable anchor for the pod's shared namespaces, so that if your application container crashes and restarts, the pod keeps its IP address and localhost.

## Simulating the Kubelet-to-CRI Protocol

```python
import uuid
import json
from typing import Dict, Any


class MockCRIRuntime:
    """Simulates a containerd/CRI-O gRPC endpoint the Kubelet talks to."""

    def __init__(self):
        self.active_sandboxes: Dict[str, dict] = {}
        self.active_containers: Dict[str, dict] = {}

    def run_pod_sandbox(self, name: str, namespace: str) -> str:
        """Creates shared namespaces and starts the pause anchor container."""
        sandbox_id = f"sb-{uuid.uuid4().hex[:12]}"
        # A real CRI implementation triggers CNI IP allocation here.
        self.active_sandboxes[sandbox_id] = {
            "name": name,
            "namespace": namespace,
            "status": "Ready",
            "ip_address": "10.244.5.101",
            "containers": [],
        }
        print(f"[CRI] RunPodSandbox: {sandbox_id} ip=10.244.5.101")
        return sandbox_id

    def create_container(self, sandbox_id: str, container_name: str, image: str) -> str:
        if sandbox_id not in self.active_sandboxes:
            raise KeyError("Pod sandbox does not exist")

        container_id = f"ct-{uuid.uuid4().hex[:12]}"
        self.active_containers[container_id] = {
            "name": container_name,
            "image": image,
            "sandbox_id": sandbox_id,
            "status": "Created",
        }
        self.active_sandboxes[sandbox_id]["containers"].append(container_id)
        print(f"[CRI] CreateContainer: {container_id} image={image} sandbox={sandbox_id}")
        return container_id

    def start_container(self, container_id: str) -> None:
        if container_id not in self.active_containers:
            raise KeyError("Container does not exist")
        self.active_containers[container_id]["status"] = "Running"
        print(f"[CRI] StartContainer: {container_id} running")


if __name__ == "__main__":
    cri = MockCRIRuntime()

    sandbox_id = cri.run_pod_sandbox("payment-gateway", "production")
    container_id = cri.create_container(sandbox_id, "payment-api", "gcr.io/company/payment-api:v1.1")
    cri.start_container(container_id)

    print("\n--- Worker node state ---")
    print(json.dumps(cri.active_sandboxes, indent=2))
```

Running this prints the sandbox creation, container creation, and start calls in the same order the real Kubelet issues them — `RunPodSandbox` → `CreateContainer` → `StartContainer` — over what would be a real gRPC channel to `containerd` or `CRI-O` in production.

## Common Misconceptions

**"Kubernetes uses Docker inside worker nodes."** False since v1.24. Dockershim is gone; nodes run `containerd` or `CRI-O` directly, which invoke `runc` per the OCI runtime spec, bypassing the Docker daemon entirely.

**"The Kubelet schedules pods."** No — the Kubelet has no cluster-wide visibility and no scheduling logic. `kube-scheduler` (control plane) picks the node and writes the binding into `etcd`; the Kubelet on the chosen node merely observes that assignment via a watch and issues the corresponding CRI calls locally.

## Pause and Think

**Question:** if a container is killed by an out-of-memory condition, does the Kubelet detect and terminate it via a gRPC call, or does the Linux kernel act first?

**Answer:** the kernel acts first. When a container's cgroup exceeds its memory limit, the kernel's OOM-killer sends `SIGKILL` directly to the process — no Kubelet involvement. The Kubelet's `SyncLoop` polls the CRI runtime's reported container status, notices the exit, reads the exit code (`137`, signaling OOM), logs the event, and — per the pod's `restartPolicy` — issues a fresh `CreateContainer`/`StartContainer` sequence to the CRI to restart it.

## Key Takeaways

- CRI is a gRPC contract (`RuntimeService` + `ImageService`) that fully decouples the Kubelet from any specific container runtime.
- `containerd` and `CRI-O` are the standard modern runtimes; Dockershim and direct Docker daemon use were removed in Kubernetes v1.24.
- The pause container anchors a pod's shared network/IPC namespaces — every other container in the pod joins them via `setns()`.
- Kubelet has zero scheduling logic; it only executes what `kube-scheduler` already decided and wrote to `etcd`.
