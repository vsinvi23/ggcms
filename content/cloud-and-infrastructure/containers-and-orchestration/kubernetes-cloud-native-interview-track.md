---
title: "Kubernetes & Cloud-Native Interview Prep"
description: "SME evaluation on container isolation internals, Pod networking, Kubernetes RBAC and Secrets encryption, zero-downtime rollouts, service mesh mTLS, and admission control edge cases."
categorySlug: "containers-orchestration"
articleType: "INTERVIEW_PREP"
level: "Senior"
durationMinutes: 420
---

# Kubernetes & Cloud-Native Interview Prep

Welcome to the Kubernetes & Cloud-Native evaluation track. This module tests your mastery of container isolation primitives, the core Kubernetes object model, cluster security (RBAC, Secrets, Pod Security Admission), zero-downtime delivery, and the gotchas that separate tutorial-level knowledge from production experience.

---

### Question 1: What actually isolates a container from the host, and why is a shared-kernel container weaker than a VM against a kernel exploit?

Think Prompt: Distinguish namespaces (visibility) from cgroups (consumption limits), and explain the "one shared kernel" attack surface argument precisely — don't just say "containers are less secure."

Model Answer / Explanation:
1. Namespaces control what a process can *see*: `PID` (own process tree, container thinks it's PID 1), `NET` (private interfaces/routes), `MNT` (private filesystem root), `IPC`, `UTS` (hostname), and `USER` (remaps container UID 0 to an unprivileged host UID). None of these are hypervisor-grade boundaries — they are metadata visibility restrictions layered onto one shared kernel.
2. Cgroups control what a process can *consume* — CPU shares, memory ceilings (OOM-killed on breach), and I/O throughput — they do not add isolation, only resource fairness.
3. The security implication: every container on a host still executes system calls directly against the same physical kernel. A kernel privilege-escalation bug (e.g., a `runc` or `overlayfs` CVE) lets a process escape namespace/cgroup boundaries entirely and gain host root, compromising every other container on that node. A VM guest exploiting a kernel bug only compromises its own guest kernel; it still needs a *separate* hypervisor escape to touch the host or sibling VMs.
4. Production mitigation: for multi-tenant or hostile workloads, nest containers inside microVMs (Firecracker, gVisor) or run on VM-per-tenant boundaries, combining hardware-enforced isolation with container-speed delivery. This is exactly why hosted Kubernetes offerings (EKS Fargate, GKE Autopilot) run untrusted or multi-tenant pods inside dedicated micro-VMs rather than bare containerd sandboxes.
5. Concrete syscall-level illustration — the same primitives a container engine uses under the hood:

```c
#define _GNU_SOURCE
#include <sched.h>
#include <stdio.h>
#include <sys/mount.h>
#include <sys/wait.h>
#include <unistd.h>

#define STACK_SIZE (1024 * 1024)
static char child_stack[STACK_SIZE];

int container_main(void *arg) {
    // Private mount namespace: this mount is invisible to the host
    mount("none", "/tmp", "tmpfs", 0, "");
    char *const argv[] = { "/bin/sh", NULL };
    execv(argv[0], argv);
    return 0;
}

int main() {
    // CLONE_NEWPID/NEWNS/NEWNET isolate *visibility*; the syscalls the child
    // makes still land on this same host kernel -- that's the whole argument.
    int pid = clone(container_main, child_stack + STACK_SIZE,
                     CLONE_NEWPID | CLONE_NEWNS | CLONE_NEWNET | SIGCHLD, NULL);
    waitpid(pid, NULL, 0);
    return 0;
}
```

Common Mistakes:
- Claiming containers and VMs provide "equivalent" isolation — cgroups/namespaces are visibility and quota controls, not a hardware-enforced ring boundary.
- Forgetting that `USER` namespace remapping (UID 0 in container -> unprivileged UID on host) is what actually blunts most container-breakout CVEs, and that many clusters still run without it enabled.
- Assuming Kubernetes' Pod Security Admission alone stops kernel-level container breakouts — PSA restricts *pod spec* capabilities (privileged mode, hostPath, capabilities), it cannot patch an unpatched kernel.

Related Concepts: Linux Namespaces, cgroups, OverlayFS, Container vs VM Isolation, Pause Container, USER Namespace Remapping
Related Courses: Cloud-Native & Kubernetes Fundamentals (Lesson 1.2 "Containers Explained", Lesson 1.3 "Docker vs. Virtual Machines"), docker-container-security-namespaces-capabilities.md

---

### Question 2: Why do sidecar containers inside a Pod talk to each other over `localhost`, and what component makes that possible?

Think Prompt: Identify the hidden "pause"/infra container and explain exactly which namespaces it establishes before the app containers even start.

Model Answer / Explanation:
1. Kubernetes' one-process-per-container rule means a Pod's main app and its helper processes (log shippers, Envoy sidecars, config syncers) run as *separate* containers — but they must still behave like co-located processes on the same host.
2. The mechanism: when the kubelet schedules a Pod, the container runtime first creates a dormant infrastructure container — the **pause container** — whose only job is to hold open the Pod's shared `NET`, `IPC`, and `UTS` namespaces and own the Pod's single IP address.
3. Every subsequent container in the Pod spec is started with instructions to *join* the pause container's namespaces rather than create its own. This is exactly equivalent to the raw Docker invocation:

```bash
docker run -d --name pause registry.k8s.io/pause:3.9
docker run -d --name web --net=container:pause nginx
docker run -d --name sidecar --net=container:pause alpine-log-shipper
```

4. Because `web` and `sidecar` share one network namespace, they see one loopback interface and one IP — `sidecar` can reach `web`'s port on `localhost:80` exactly as if they were two threads in one process, with zero cross-node network hops.
5. Storage sharing is separate: Pods additionally mount a common `emptyDir` volume so containers can exchange files (e.g., app writes to `/var/log/nginx`, sidecar tails the same path via a different mount point), which is why "sidecar" and "shared volume" almost always appear together in manifests.
6. If the pause container itself is ever killed (rare, but happens on CRI bugs), *every* container in the Pod loses its network identity simultaneously — this is a useful "what happens if X dies" gotcha to probe.

Common Mistakes:
- Saying containers in a Pod "talk over the cluster network" — they don't; it's a shared loopback interface, no CNI or kube-proxy involvement at all.
- Forgetting the pause container exists and instead attributing localhost communication to "Kubernetes magic."
- Assuming each sidecar gets its own IP — a Pod has exactly one IP shared by all its containers.

Related Concepts: Pause Container, Shared Network Namespace, Sidecar Pattern, emptyDir Volumes
Related Courses: Cloud-Native & Kubernetes Fundamentals (Lesson 2.1 "Kubernetes Pods Explained"), istio-service-mesh-mtls-zero-trust.md

---

### Question 3: How does a Kubernetes `Service` route traffic to a constantly-changing set of Pod IPs, and what is kube-proxy's actual role?

Think Prompt: Many candidates say "kube-proxy load balances traffic" — correct them: it programs the kernel, it does not sit in the data path itself.

Model Answer / Explanation:
1. The problem: Pod IPs are ephemeral — every restart, reschedule, or scale event assigns a new IP. A `Service` provides a stable virtual IP (`ClusterIP`) and DNS name (via CoreDNS) that never changes, decoupling clients from Pod churn.
2. kube-proxy is *not* a traffic-forwarding proxy despite its name. It watches the API server for `Service`/`EndpointSlice` changes and, on every change, rewrites low-level kernel routing rules — either `iptables` DNAT rules or `IPVS` virtual server entries — on every node.
3. Data path: when a packet hits a node's NIC destined for a Service's ClusterIP, the kernel itself (not a userspace kube-proxy process) rewrites the destination to a randomly-selected healthy Pod IP and forwards it — this is why kube-proxy in iptables/IPVS mode adds essentially zero per-packet latency versus the old userspace-proxy mode it replaced.
4. Readiness is the gate that keeps this table correct: a Pod failing its readiness probe is removed from the Service's `EndpointSlice` immediately, so kube-proxy stops programming routes to it — this is distinct from the liveness probe, which triggers a container restart rather than an endpoint removal.
5. At very large scale (thousands of Services), iptables' linear rule-chain evaluation becomes a bottleneck; IPVS uses hash tables for O(1) lookup and is the recommended mode for large clusters. eBPF-based dataplanes (Cilium) go a step further and bypass iptables/IPVS entirely.

Common Mistakes:
- Describing kube-proxy as being "in the request path" for every packet — it configures rules ahead of time; it is not invoked per-packet.
- Conflating liveness probe failure (restart the container) with readiness probe failure (pull the Pod out of Service endpoints) — these trigger completely different remediations.
- Ignoring that DNS resolution (CoreDNS: Service name -> ClusterIP) and the actual packet-level load balancing (kube-proxy: ClusterIP -> Pod IP) are two separate, independently-failing systems.

Related Concepts: kube-proxy, IPVS vs iptables, EndpointSlice, Readiness vs Liveness Probes, CoreDNS
Related Courses: Cloud-Native & Kubernetes Fundamentals (Lesson 1.4 "Why Kubernetes Exists", Lesson 2.2 "Kubernetes Services Explained"), kube-proxy-ipvs-coredns-scaling.md, ebpf-cilium-kube-proxy-replacement.md

---

### Question 4: A Deployment rollout is causing HTTP 502s during every release even though all probes pass. Walk through the exact race condition and how you'd fix it.

Think Prompt: The bug is a timing race between SIGTERM delivery and EndpointSlice propagation across the cluster's kube-proxy instances — not a probe misconfiguration.

Model Answer / Explanation:
1. Root cause: when a Pod is terminated during a rolling update, Kubernetes does two things *simultaneously* — it sends `SIGTERM` to the container process, and it removes the Pod from the Service's `EndpointSlice`. But `kube-proxy` on every other node must still receive that EndpointSlice update and rewrite its local iptables/IPVS rules, which takes on the order of several seconds across a large cluster.
2. During that propagation window, some nodes are still routing live traffic to a Pod that has already begun shutting down (or has already exited), producing connection resets and 502s.
3. Fix — a `preStop` lifecycle hook that sleeps *before* the app handles SIGTERM, buying time for the EndpointSlice removal to propagate everywhere while the process keeps serving in-flight (and even new) connections:

```yaml
spec:
  containers:
    - name: api
      lifecycle:
        preStop:
          exec:
            command: ["sh", "-c", "sleep 15"]
      # Give the app enough time after SIGTERM to finish requests before the hard kill
      terminationGracePeriodSeconds: 45
```

4. The application itself must also catch `SIGTERM` explicitly, stop accepting *new* connections, and let in-flight requests complete within a bounded timeout — a `preStop sleep` alone does nothing if the process ignores SIGTERM and simply gets SIGKILLed once `terminationGracePeriodSeconds` expires.
5. Tune the RollingUpdate strategy so surge/unavailable capacity absorbs the churn without dropping serving capacity below what's needed:

```yaml
spec:
  replicas: 10
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 2
      maxUnavailable: 0
```

6. Add a `PodDisruptionBudget` so voluntary disruptions (node drains, cluster-autoscaler scale-downs) can never take down more Pods than the service can tolerate concurrently with the rollout itself:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api-pdb
spec:
  minAvailable: 8
  selector:
    matchLabels:
      app: api
```

Common Mistakes:
- Treating a passing readiness probe as proof that traffic routing is instantaneous — EndpointSlice propagation lag is a distinct, unavoidable network-wide delay.
- Adding a `preStop sleep` without also handling `SIGTERM` gracefully in the application — the sleep only helps if the app is still accepting/finishing requests during it.
- Setting `maxUnavailable: 0` without a `PodDisruptionBudget` and assuming that alone prevents downtime during node maintenance — PDBs govern *voluntary* disruptions, RollingUpdate governs the *deployment* rollout; both are needed.

Related Concepts: preStop Hooks, terminationGracePeriodSeconds, EndpointSlice Propagation Delay, PodDisruptionBudget, RollingUpdate Strategy
Related Courses: kubernetes-zero-downtime-deployments.md, devops-kubernetes-interview-track.md

---

### Question 5: Kubernetes `Secret` objects show up as encrypted-looking blobs — are they actually encrypted at rest? If not, how do you fix that?

Think Prompt: The trap is Base64 vs. encryption. Push for the envelope-encryption architecture (DEK/KEK split) and why sending every secret directly to a KMS on each read would be unacceptable.

Model Answer / Explanation:
1. By default, `Secret` data is stored in `etcd` as **Base64**, a reversible encoding, not a cipher:

```bash
echo "bXktc3VwZXItc2VjcmV0LWtleQ==" | base64 --decode
# my-super-secret-key
```

Anyone with a raw `etcd` snapshot or an unencrypted backup can decode every Secret in the cluster with one command — this fails SOC 2 / HIPAA / PCI-DSS encryption-at-rest requirements outright.
2. The fix is **envelope encryption**: the API server generates a local Data Encryption Key (DEK), encrypts the Secret payload with it, and sends only the small DEK (not the Secret) to an external KMS to be wrapped by a Key Encryption Key (KEK) that never leaves the KMS. Only the wrapped DEK and DEK-encrypted ciphertext are ever written to `etcd`.
3. This avoids a round-trip to the KMS for every Secret read/write (which would be a latency and availability disaster for the control plane) while still ensuring an attacker who only has an `etcd` snapshot gains nothing — decrypting requires a live call to the KMS to unwrap the DEK.
4. Enablement — an `EncryptionConfiguration` passed to the API server:

```yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
      - secrets
    providers:
      - kms:
          apiVersion: v2
          name: aws-kms-provider
          endpoint: unix:///var/run/kms-provider/kms.sock
          timeout: 3s
      - identity: {}   # required fallback for pre-existing unencrypted secrets
```

5. The `identity: {}` fallback is not optional in practice: without it, any Secret written *before* encryption was enabled becomes unreadable the instant the KMS provider is added, because the API server would have no provider able to decode its (unencrypted) on-disk form. With it present, old Secrets stay readable and are transparently re-encrypted with the `kms` provider the next time they're written — so a full `kubectl get secrets -o json | kubectl replace -f -` sweep is needed to actually re-encrypt everything, not just wait for it.

Common Mistakes:
- Believing Secrets are "already encrypted" because `kubectl get secret -o yaml` shows Base64 gibberish instead of plaintext.
- Enabling KMS encryption without the `identity: {}` fallback provider, bricking access to every Secret written before the config change.
- Assuming enabling `EncryptionConfiguration` retroactively re-encrypts existing Secrets — it only encrypts on next write; existing data must be explicitly rewritten to pick up the new provider.

Related Concepts: etcd, Envelope Encryption, KMS Provider, Data Encryption Key vs Key Encryption Key, EncryptionConfiguration
Related Courses: kubernetes-secrets-encryption-at-rest-kms.md, Cloud-Native & Kubernetes Fundamentals (Section 3: cluster security chain)

---

### Question 6: A pod was compromised via a code-execution bug in the app. The attacker immediately used the pod's mounted service account token to list every Secret in the namespace. What RBAC and ServiceAccount hardening steps prevent this?

Think Prompt: Cover both halves — the auto-mounted token as the actual attack vector, and least-privilege RBAC as the blast-radius limiter — a fix to only one of them is incomplete.

Model Answer / Explanation:
1. Every Pod is, by default, provisioned with its namespace's `default` ServiceAccount token auto-mounted at `/var/run/secrets/kubernetes.io/serviceaccount/token`. If that ServiceAccount is bound (directly or via a `ClusterRole`) to any permissive rule, RCE inside the Pod immediately hands the attacker a usable cluster credential:

```text
Compromised pod
  |
  +--> reads /var/run/secrets/kubernetes.io/serviceaccount/token
  |
  +--> curl -H "Authorization: Bearer <token>" https://<api-server>/api/v1/namespaces/prod/secrets
```

2. Step 1 — stop auto-mounting tokens where they aren't needed. Most workloads (a stock nginx, a Redis instance) never call the API at all:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: default
  namespace: production
automountServiceAccountToken: false
```

This makes token access opt-in per workload rather than opt-out cluster-wide.
3. Step 2 — for workloads that genuinely need API access, create a dedicated `ServiceAccount` and a `Role` scoped to exactly the verbs/resources required, never a wildcard:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: production
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "watch", "list"]
```

Never write `apiGroups: ["*"], resources: ["*"], verbs: ["*"]` — that is functionally `cluster-admin` scoped to the namespace, even as a "temporary" measure.
4. Step 3 — bind narrowly, and note that a `ClusterRole` referenced from a namespace-scoped `RoleBinding` stays constrained to that namespace — this is the standard pattern for defining a reusable permission set once and granting it per-namespace without ever needing a `ClusterRoleBinding`:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods-binding
  namespace: production
subjects:
- kind: ServiceAccount
  name: prometheus-scraper-sa
  namespace: production
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

5. Even with all of the above, a leaked token bound to `get secrets` on that one namespace is a much smaller blast radius than the default cluster's implicit `default` ServiceAccount having broad permissions — this is the core "defense in depth" argument the interviewer is listening for.

Common Mistakes:
- Fixing only the RBAC rule ("just don't grant secrets access") while leaving `automountServiceAccountToken` at its default `true`, meaning every future permissive change automatically becomes exploitable again.
- Binding a `ClusterRole` via `ClusterRoleBinding` "to be safe/simple" when a namespace-scoped `RoleBinding` referencing the same `ClusterRole` would have achieved least privilege.
- Not distinguishing between a `Role` (namespace-scoped rules) and a `ClusterRoleBinding` (cluster-wide grant) — these are independent axes (rule scope vs. binding scope) that get conflated constantly in interviews.

Related Concepts: ServiceAccount Token Auto-Mount, Role vs ClusterRole, RoleBinding vs ClusterRoleBinding, Least Privilege
Related Courses: kubernetes-rbac-service-account-hardening.md, Cloud-Native & Kubernetes Fundamentals (Section 3: authentication/authorization chain)

---

### Question 7: What is the exact difference between Pod Security Admission's `Baseline` and `Restricted` levels, and why was `PodSecurityPolicy` removed instead of fixed?

Think Prompt: This is a "why was the old thing deprecated" question — the interviewer wants the *mechanism* failure of PSP (admission-time coupling and no dry-run), not just "it was replaced."

Model Answer / Explanation:
1. `PodSecurityPolicy` (removed in v1.25) was an admission-controller resource that evaluated every Pod against cluster-wide policy objects, but its authorization model was famously confusing: a Pod's fate depended on which policies the *creating user or ServiceAccount* was authorized to use, evaluated in a nondeterministic order across multiple bound policies — debugging "why was my Pod rejected" often required reverse-engineering RBAC bindings to PSP objects, not reading the policy itself.
2. Its replacement, **Pod Security Admission (PSA)**, moved policy from a cluster resource to a namespace-level *label*, applying one of three built-in standards directly and deterministically:
   - `privileged`: no restrictions at all (used only for cluster infrastructure Pods, e.g., CNI or storage plugins).
   - `baseline`: blocks the most flagrant escalation vectors — no privileged containers, no host namespaces (`hostNetwork`, `hostPID`, `hostIPC`), no dangerous `hostPath` mounts — but still permissive on things like non-root enforcement.
   - `restricted`: enforces defense-in-depth on top of baseline — requires `runAsNonRoot: true`, drops `ALL` Linux capabilities by default, requires a `seccompProfile` of `RuntimeDefault`, and disallows privilege escalation.
3. Configuration is a namespace label, not a separate resource kind:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    # audit/warn allow safe rollout: log or warn without blocking, before flipping to enforce
    pod-security.kubernetes.io/warn: restricted
```

4. The safe migration path: apply `warn`/`audit` labels first (which surface violations in `kubectl` warnings and audit logs without blocking anything), fix the flagged workloads, and only then flip `enforce` to the stricter level — this dry-run capability is exactly what PSP's admission-time-only model lacked.
5. A Pod meeting `restricted` typically needs an explicit securityContext like:

```yaml
spec:
  securityContext:
    runAsNonRoot: true
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: app
      securityContext:
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
```

Common Mistakes:
- Saying PSA is "the same as PSP but simpler" — the actual difference is architectural: label-based per-namespace policy vs. RBAC-gated policy objects with no dry-run.
- Applying `restricted` directly to an existing production namespace without a `warn`/`audit` rollout first, silently blocking legitimate Deployments mid-release.
- Assuming `baseline` already enforces non-root execution — it does not; only `restricted` requires `runAsNonRoot`.

Related Concepts: PodSecurityPolicy Deprecation, Pod Security Admission, Baseline vs Restricted Standards, SecurityContext, seccompProfile
Related Courses: pod-security-standards-admission.md, opa-gatekeeper-admission-control.md

---

### Question 8: You enable Istio's `STRICT` mTLS PeerAuthentication cluster-wide and half your legacy services immediately start failing with connection resets. What went wrong, and how do you roll it out safely?

Think Prompt: The candidate should identify that services without an Envoy sidecar cannot participate in mTLS at all, and describe `PERMISSIVE` mode as a migration tool, not a permanent security posture.

Model Answer / Explanation:
1. Istio's data-plane mTLS works entirely at the Envoy sidecar layer — the application still opens a plain HTTP socket to `localhost`, and the sidecar transparently upgrades the connection to mutual TLS 1.3 with SPIFFE-identity verification before it ever leaves the Pod.
2. Setting `mode: STRICT` on a `PeerAuthentication` immediately rejects *any* plaintext connection to Pods in that scope:

```yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: finance-apps
spec:
  mtls:
    mode: STRICT
```

3. The break: any workload in that namespace that has *not* been injected with an Envoy sidecar (a legacy Deployment predating the mesh rollout, a batch Job the injector skipped, a Pod in a different, unmeshed namespace calling in) has no proxy to perform the mTLS handshake — its plaintext traffic is rejected outright, producing connection resets that look like a network outage rather than a policy change.
4. The safe rollout is `PERMISSIVE` mode first — it accepts *both* plaintext and mTLS simultaneously, existing purely as a migration bridge while onboarding services that don't yet have sidecars:

```yaml
spec:
  mtls:
    mode: PERMISSIVE
```

5. The correct sequence: inject sidecars across the namespace (or fleet), confirm via mesh telemetry that all traffic is already flowing over mTLS even under `PERMISSIVE`, and only then flip to `STRICT` to close the plaintext fallback entirely — flipping straight to `STRICT` before every peer has a sidecar is the single most common Istio outage pattern in interviews and in production.
6. A useful follow-up probe: ask what happens to traffic from *outside* the mesh (an external health-checker hitting a Pod directly) once `STRICT` is enforced — it will always be rejected, since there is no way for an unmeshed client to present the required mTLS identity; such traffic must go through an Ingress Gateway, which terminates external TLS and re-originates in-mesh mTLS on the Pod's behalf.

Common Mistakes:
- Treating `PERMISSIVE` as a security setting rather than a temporary migration state — it should never be the durable end-state for a namespace security posture.
- Enabling `STRICT` mesh-wide in one shot instead of namespace-by-namespace as sidecar injection completes.
- Forgetting that `STRICT` also blocks legitimate external traffic that bypasses the Ingress Gateway, mistaking it for a mesh bug rather than expected zero-trust behavior.

Related Concepts: Istio PeerAuthentication, STRICT vs PERMISSIVE mTLS, Envoy Sidecar Injection, SPIFFE Identity, Ingress Gateway TLS Termination
Related Courses: istio-service-mesh-mtls-zero-trust.md, istio-service-mesh-mtls-traffic-management.md, istio-canary-deployments-virtual-services.md

---

### Question 9: What is the actual mechanical difference between Helm and Kustomize, and when does mixing them (Helm chart + Kustomize overlay) make sense over picking one?

Think Prompt: Push past "Helm has templates, Kustomize doesn't" — get the candidate to articulate *why* that distinction matters operationally (secrets in values files, patch-based diffs, third-party chart customization).

Model Answer / Explanation:
1. Helm renders Go-template placeholders (`{{ .Values.replicaCount }}`) inside YAML text *before* it's valid YAML at all — templating happens at the text level, values come from a `values.yaml` hierarchy, and the final output is produced by `helm template`/`helm install`.
2. Kustomize is template-free: it starts from valid, complete base YAML manifests and applies structural, strategic-merge or JSON patches on top via overlays — there is no placeholder syntax anywhere in the base manifests, which makes the base independently valid and readable without running a tool over it first.
3. The practical tradeoff this creates: Helm charts are easy to parameterize for wildly different consumers (a public chart supporting dozens of unrelated deployment shapes) but hide logic inside template conditionals that can be hard to trace; Kustomize overlays are trivial to diff (`kustomize build overlays/prod | diff -`) since every layer is just YAML, but don't scale well to expressing deep conditional logic.
4. The common hybrid pattern: consume a third-party Helm chart you don't control (e.g., the official `prometheus-community` chart) but still need environment-specific patches Helm's `values.yaml` doesn't expose — render the chart to plain manifests with `helm template`, then run a Kustomize overlay on top of the rendered output:

```bash
helm template prometheus prometheus-community/kube-prometheus-stack \
  -f values-base.yaml > rendered-base.yaml
kustomize build overlays/production >> rendered-base.yaml
```

Or, more commonly in GitOps pipelines, Kustomize's native `helmCharts:` field renders the chart internally as one step of the overlay build.
5. A common failure mode when mixing both: patching a field that a Helm template conditionally omits entirely (e.g., a `resources:` block only rendered when `.Values.limits.enabled` is true) — a Kustomize strategic-merge patch targeting that path will silently no-op if the base manifest never emits the field, which is why teams doing this hybrid need to inspect `helm template` output, not the chart's source templates, before writing overlay patches.

Common Mistakes:
- Describing Kustomize as "just YAML merging" without mentioning that JSON6902 patches (as opposed to strategic-merge patches) are needed for array-element-specific edits that strategic merge can't express.
- Assuming Helm and Kustomize are mutually exclusive rather than commonly composed in GitOps pipelines.
- Writing a Kustomize patch against a field path that a Helm chart's conditional template logic doesn't always render, and not noticing the patch is a silent no-op.

Related Concepts: Helm Go-Templating, Kustomize Strategic Merge Patches, JSON6902 Patches, GitOps Rendering Pipelines
Related Courses: helm-vs-kustomize-configuration-management.md, helm-hooks-database-migration-lifecycle.md

---

### Question 10: How does the Gateway API's weighted canary routing actually split traffic, and what's the gotcha with doing this across namespaces?

Think Prompt: The mechanism (weighted `backendRefs` on an `HTTPRoute`) is simple; the edge case worth probing is the `ReferenceGrant` requirement for cross-namespace backend references, which silently fails closed without one.

Model Answer / Explanation:
1. The Gateway API replaces vendor-specific Ingress annotations (`nginx.ingress.kubernetes.io/canary-weight`, etc.) with a portable, role-oriented resource hierarchy: a `GatewayClass` (infrastructure implementation), a `Gateway` (a specific listener/address), and `HTTPRoute`/`TCPRoute` (routing rules attached to that Gateway).
2. Weighted canary splitting is expressed directly as an array of `backendRefs` with integer weights on a single `HTTPRoute`:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: checkout-route
spec:
  parentRefs:
    - name: public-gateway
  rules:
    - backendRefs:
        - name: checkout-v1
          port: 8080
          weight: 90
        - name: checkout-v2
          port: 8080
          weight: 10
```

Roughly 10% of matched requests are routed to `checkout-v2`; shifting the canary forward is a one-line weight edit, no annotation-specific syntax to remember across ingress controller vendors.
3. The gotcha: if `checkout-v2` lives in a *different* namespace than the `HTTPRoute` (a common pattern when a platform team owns the Gateway/Route and app teams own their Services), the reference is rejected by default — Gateway API enforces namespace isolation for security, requiring the target namespace to explicitly opt in with a `ReferenceGrant`:

```yaml
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-checkout-route
  namespace: checkout-v2-ns
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: gateway-ns
  to:
    - group: ""
      kind: Service
```

Without this grant, the cross-namespace `backendRef` doesn't error loudly — it's simply treated as an invalid reference and Gateway API reports a `ResolvedRefs: False` condition on the route, which is easy to miss if you're only checking whether the `HTTPRoute` object applied successfully rather than its status conditions.
4. This is a deliberate security boundary, not a bug: it prevents a Route in a shared/ingress namespace from silently pulling traffic into a Service in a namespace whose owners never consented to it.

Common Mistakes:
- Debugging a cross-namespace canary split by checking `kubectl get httproute` succeeded, instead of checking `kubectl describe httproute` for the `ResolvedRefs` condition, which is where the actual failure surfaces.
- Assuming Gateway API weights behave like exact percentages under low request volume — with a small number of concurrent requests, weighted distribution is probabilistic per-request, not a strict rolling percentage.
- Forgetting `ReferenceGrant` must be created in the *target* namespace (where the Service lives), not the namespace containing the `HTTPRoute`.

Related Concepts: Gateway API, HTTPRoute Weighted backendRefs, ReferenceGrant, Cross-Namespace Routing, ResolvedRefs Condition
Related Courses: kubernetes-gateway-api-canary-routing.md, istio-canary-deployments-virtual-services.md

---

### Question 11: What is the reconciliation loop, mechanically, and what happens if a controller's "observe" step reads stale cache data instead of the live API server?

Think Prompt: Push past the textbook "observe -> diff -> act" description into the failure mode: controllers watch informer caches, not live API calls, and staleness there causes flapping or thrashing reconciliation.

Model Answer / Explanation:
1. Every Kubernetes controller (Deployment controller, ReplicaSet controller, or a custom operator) runs the same non-terminating control loop: observe the actual cluster state, diff it against the object's declared desired state, and act to close the gap.
2. Controllers don't call the API server directly on every loop iteration for performance reasons — they use an **informer**, a local, watch-based cache that's kept in sync via long-lived API server watch streams and periodic full resyncs.
3. The failure mode: if a controller's informer cache is stale (a watch connection silently dropped and hasn't yet triggered a resync), the controller's "observe" step returns outdated actual-state data. Combined with the desired-state comparison, this can cause the controller to take an action based on data that's already been superseded — e.g., scaling up a ReplicaSet that already has enough replicas because the cache hasn't registered Pods that were created moments ago, producing transient over-scaling that self-corrects on the next resync.
4. A minimal illustration of the pattern controllers implement (simplified, no actual informer):

```python
class Controller:
    def __init__(self):
        self.desired_state = {}   # from watched Spec
        self.actual_state = []    # from informer cache, NOT a live API call

    def reconcile(self):
        actual = self.observe()          # reads local cache -- can be stale
        for name, target in self.desired_state.items():
            running = [p for p in actual if p.name == name and p.healthy]
            if len(running) < target:
                self.scale_up(name, target - len(running))
            elif len(running) > target:
                self.scale_down(name, len(running) - target)
```

5. Production-grade controllers guard against acting on stale reads by making reconciliation idempotent and safe to re-run: every action re-derives the diff from the latest observed state rather than assuming a single pass converges the system, and controllers requeue objects with exponential backoff rather than tight-looping, so a stale read self-heals on the next pass rather than compounding.
6. This is also why declarative "desired state" APIs tolerate eventual consistency far better than imperative deployment scripts: a controller that acts on slightly stale data simply converges one loop iteration later, rather than leaving the system in a broken intermediate state the way a failed imperative script does.

Common Mistakes:
- Describing the reconciliation loop as reading "the live cluster state" every iteration — it reads an eventually-consistent local informer cache, which is the entire reason watch-resync staleness is a real production concern.
- Assuming reconciliation is a one-shot convergence — a single reconcile pass is expected to only make partial progress and rely on requeueing, not to always fully resolve desired vs. actual state in one call.
- Treating transient over/under-scaling from cache staleness as a bug to "fix" rather than an expected, self-correcting characteristic of eventually-consistent control loops.

Related Concepts: Reconciliation Loop, Informer Cache, Watch/Resync Semantics, Idempotent Controllers, Eventual Consistency
Related Courses: Cloud-Native & Kubernetes Fundamentals (Lesson 1.1 "Cloud Native Explained from First Principles", Lesson 1.4 "Why Kubernetes Exists"), kubelet-cri-internals.md

---

### Question 12: You need a workload that survives Pod rescheduling with the *same* network identity and storage, unlike a Deployment. Why does a StatefulSet solve this and a Deployment cannot, mechanically?

Think Prompt: The candidate should name the two specific guarantees a Deployment explicitly does not provide — stable ordinal identity and stable per-replica storage binding — and connect each to a concrete Kubernetes object that implements it.

Model Answer / Explanation:
1. A `Deployment`'s ReplicaSet treats all Pod replicas as fully interchangeable: Pods get random name suffixes, are created/destroyed in no guaranteed order, and any Pod can be scheduled to any node with any freshly-provisioned volume. This is exactly right for stateless services but breaks stateful systems that depend on stable identity — a database replica that must always rejoin the cluster as "replica 2" with "replica 2's" data, not a random peer's.
2. `StatefulSet` provides two guarantees a Deployment doesn't:
   - **Stable, ordinal Pod identity**: Pods are named deterministically (`db-0`, `db-1`, `db-2`), created and scaled up/down strictly in order, and each retains its ordinal identity (and DNS name via a headless Service) across restarts and rescheduling.
   - **Stable per-replica storage**: each ordinal gets its own `PersistentVolumeClaim` created from a `volumeClaimTemplate`, and that exact PVC — not a fresh one — is reattached to the Pod with that ordinal whenever it's rescheduled, so `db-1` always comes back with `db-1`'s data, even on a different node.
3. Minimal illustrative manifest:

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: db
spec:
  serviceName: db-headless
  replicas: 3
  selector:
    matchLabels:
      app: db
  template:
    metadata:
      labels:
        app: db
    spec:
      containers:
        - name: db
          image: postgres:16
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi
```

4. The headless Service (`clusterIP: None`) is what makes each ordinal individually addressable via DNS (`db-0.db-headless.default.svc.cluster.local`) rather than only reachable through a single load-balanced VIP — critical for systems like a database replica set where clients (or peers) must target a *specific* member, not "any healthy member."
5. The gotcha to probe: scaling a StatefulSet down does **not** delete its PersistentVolumeClaims by default — this is deliberate, so a database replica isn't destroyed by an accidental scale-to-zero — but it means storage silently accumulates (and keeps costing money) unless PVCs are cleaned up explicitly, and scaling back up reattaches the *old* PVC with its old data rather than starting fresh.

Common Mistakes:
- Reaching for a Deployment with a `PersistentVolumeClaim` shared across all replicas — this causes every Pod replica to fight over the same underlying volume, which most storage backends don't even support for concurrent `ReadWriteOnce` access.
- Forgetting the headless Service requirement — without `clusterIP: None`, StatefulSet Pods still get individual DNS entries, but clients querying the regular Service name get one load-balanced VIP instead of being able to target a specific ordinal.
- Assuming scaling a StatefulSet down cleans up its PVCs automatically, and being surprised that scaling back up returns stale, previously-written data rather than a clean volume.

Related Concepts: StatefulSet, Ordinal Pod Identity, volumeClaimTemplates, Headless Service, PersistentVolumeClaim Retention
Related Courses: Cloud-Native & Kubernetes Fundamentals (Section 2: "Core Kubernetes Building Blocks" — multi-tier manifest tying Deployment, StatefulSet, PVC, Secret, and Services together), helm-hooks-database-migration-lifecycle.md
