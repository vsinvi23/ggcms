---
title: "GPU Provisioning for Platform Teams: Scheduling Scarce AI Compute"
slug: "gpu-provisioning-platform-teams-scheduling-scarce-ai-compute"
category: "Platform Engineering"
subcategory: "GPU Scheduling & Capacity"
domain: "Platform Engineering"
level: "Advanced"

prerequisites:
  - "Platform Engineering Explained: Bridging DevOps and Dev UX"
  - "Building an Internal Developer Platform: Golden Paths and Self-Service"
  - "Why Kubernetes Exists: Self-Healing and Network Load Balancing"
  - "AI Infrastructure Explained: The Stack Behind Every LLM Call"

learning_outcomes:
  - "Explain why GPUs behave as a scarce, indivisible resource in a scheduler, unlike CPU and memory"
  - "Describe how quota systems allocate fixed GPU capacity fairly across teams and projects"
  - "Compare fair-share and gang scheduling to plain FIFO queuing for multi-tenant GPU clusters"
  - "Explain the isolation and performance trade-offs of MIG, time-slicing, and MPS as fractional-GPU sharing mechanisms"
  - "Describe how priority classes and preemption reclaim GPU capacity from low-priority work without wasting it"
  - "Implement basic Kubernetes constructs (ResourceQuota, PriorityClass, a Kueue ClusterQueue) that express GPU scheduling policy as configuration"
  - "Identify the failure modes and security boundaries specific to shared, multi-tenant GPU scheduling"

related:
  - "AI Infrastructure Explained: The Stack Behind Every LLM Call"
  - "GPU Clusters and Model Serving: How AI Compute Actually Scales"
  - "Understanding AI Supercomputing: Networking, Storage, and Scheduling for Training"
  - "Platform Engineering 2.0: Building Internal Platforms for AI Agents"
  - "FinOps for AI: Understanding and Controlling LLM Inference Costs"

next:
  - "Platform Engineering 2.0: Building Internal Platforms for AI Agents"
  - "FinOps for AI: Understanding and Controlling LLM Inference Costs"

tags:
  - gpu-scheduling
  - platform-engineering
  - kubernetes
  - fair-share-scheduling
  - quota
  - mig
  - preemption
  - capacity-planning
  - ai-infrastructure

content_status: "draft"
last_reviewed: "2026-09-18"
---

# GPU Provisioning for Platform Teams: Scheduling Scarce AI Compute

> By the end of this article you'll be able to explain, mechanically, why "just add a node" doesn't solve GPU capacity problems the way it solves CPU capacity problems — and how quota, fair-share scheduling, fractional sharing, and preemption exist specifically to make a scarce, indivisible resource behave like a shared platform service.

## The Problem

If you've run a platform team for a normal application fleet, you already know the moves. Someone needs more capacity, you raise a quota, the autoscaler adds nodes, the scheduler bin-packs pods onto them, and if two teams both want the same node at the same time, Kubernetes just... time-slices the CPU between them at the millisecond level. Nobody notices. That's the model most platform engineers carry in their heads when a data science team first asks for "a few GPUs for training."

Then the request comes in for eight A100s, on a cluster where you have twelve, three of which are already running a job that won't finish for six hours, and two different teams both filed the request on the same afternoon. There is no autoscaler move that fixes this in five minutes. There is no "just give both teams a slice" move, because — as you're about to see — a GPU doesn't slice the way a CPU core does by default. You now own a resource-allocation problem that looks less like Kubernetes bin-packing and more like a university deciding who gets time on the supercomputer.

That problem — allocating a small number of extremely expensive, mostly-indivisible compute units across many competing internal customers, fairly, without leaving expensive silicon idle — is what this article is about. It is a distinct discipline within platform engineering, not a variant of "provision more compute."

## Why This Problem Is Difficult

Three properties of GPUs, taken together, break the provisioning playbook that works fine for CPU and memory.

1. **GPUs are scarce in a way CPU cores usually aren't.** A cloud region might have effectively unlimited standard CPU instances available on demand. High-end training GPUs are frequently capacity-constrained — vendors allocate them, cloud providers reserve them for committed customers, and even well-funded platform teams routinely hit hard ceilings on how many they can get, not just budget ceilings. Provisioning here is sometimes a negotiation with a vendor or a cloud account team, not an API call.
2. **GPUs are (by default) indivisible scheduling units.** A CPU core can be shared between ten lightweight processes via the OS scheduler's time-slicing, and Kubernetes routinely lets you request fractional CPU (`cpu: "250m"`). A GPU, in the default Kubernetes device-plugin model, is requested as a whole integer unit — you get one, or you don't get one. There's no built-in equivalent of "give me a quarter of a GPU" without deliberately layering extra sharing technology on top, each with real trade-offs (covered below).
3. **GPU workloads are expensive to preempt and slow to start.** Killing a CPU-bound request and retrying it is cheap. Killing a training job that's four hours into an eight-hour run, with no checkpoint, throws away four hours of expensive compute. And unlike a stateless web pod, a new GPU workload often can't just "start" the instant it's scheduled — model weights or datasets may need to load into GPU memory first, which is a slow, heavy operation in its own right.

Put together: you're allocating a resource that's genuinely scarce, that can't be finely subdivided without extra engineering, and where getting the scheduling decision wrong is expensive in both wasted silicon and wasted work-in-progress. That's why GPU provisioning is its own discipline inside platform engineering, with its own tools (quota systems, fair-share schedulers, fractional-sharing technology, and preemption policy) that don't have a direct, drop-in equivalent in traditional CPU/memory platforms.

## A Simple Mental Model

Think of a traditional Kubernetes cluster's CPU/memory scheduling like seating people at a big open-plan office: there's a lot of desk space, people come and go all day, and if it gets crowded for an hour you just... deal with slightly less elbow room. Nobody is turned away at the door.

Now think of a GPU cluster like a small number of shared research labs with expensive, specialized equipment — say, three electron microscopes shared across an entire university. There are far more researchers who want time on a microscope than there are microscopes. You can't give everyone a "little bit" of a microscope simultaneously and have it work well for any of them (unless the microscope itself was specifically engineered to be safely partitioned — which is exactly what fractional-GPU technology like MIG is, and we'll get to it). Instead the university needs a **booking system**: departments get an allocated share of total microscope-hours (quota), a fair scheduling policy so one lab doesn't monopolize the equipment for a semester (fair-share scheduling), a policy for what happens when a higher-priority experiment needs the microscope right now (preemption), and, for the newer microscopes that actually support it, a way to safely split one physical instrument into a few smaller, isolated instruments for smaller jobs (fractional sharing).

Where the analogy breaks down: a microscope-booking system is mostly a human bureaucratic process. GPU scheduling has to make these same allocation decisions programmatically, in seconds, thousands of times a day, as part of a Kubernetes (or Slurm, or similar) control plane — which is why it needs purpose-built software rather than a spreadsheet.

## Before We Continue

This article assumes you're already comfortable with:

- **Kubernetes scheduling fundamentals** — pods, nodes, requests/limits, and how the default scheduler places workloads. If "requests and limits" or "the scheduler" are unfamiliar concepts, start with *Why Kubernetes Exists* first.
- **Platform engineering fundamentals** — the idea of an internal platform as a self-service product for developers, golden paths, and why abstraction exists. *Platform Engineering Explained* and *Building an Internal Developer Platform* cover this.
- **What GPUs are for in an AI context, at a high level** — that model weights and computation live on the GPU, and that inference/training both need it. *AI Infrastructure Explained* covers the "why GPU" question and the inference request path in depth; this article assumes that background and does not repeat it.

We will not re-derive why GPUs are good at matrix multiplication, or how continuous batching works inside a serving engine — that's the *serving* problem, covered in *AI Infrastructure Explained* and the forthcoming *GPU Clusters and Model Serving*. This article is specifically about the layer above that: how a platform team decides **who gets a GPU, for how long, and what happens when demand exceeds supply.**

## The Core Idea

Every mechanism in this article exists to answer one question: **given a fixed, expensive, mostly-indivisible pool of GPUs and a much larger set of teams who all want some, how do you allocate capacity in a way that's fair, keeps expensive hardware busy, and doesn't let one workload silently starve everyone else?**

That single question explains why each of these exists:

- You need **quota** because without an allocation boundary, the first team to submit a big enough job can consume the entire cluster, and everyone else queues indefinitely.
- You need **fair-share scheduling** because a simple first-in-first-out queue lets whoever submits first (or submits the most jobs) dominate the cluster, which is not the same thing as a fair allocation over time.
- You need **fractional GPU sharing** because a large fraction of real workloads (interactive development, small inference jobs, notebooks) don't need a whole GPU, and handing out whole GPUs to them wastes most of the hardware's capacity.
- You need **preemption** because rigid, static allocation wastes capacity whenever a high-priority job arrives after a lower-priority job has already claimed the hardware — someone has to have the authority to reclaim it.

Every section below answers: what happens if this specific mechanism didn't exist?

## How It Actually Works

Let's walk through the full decision path a GPU request takes inside a shared, multi-tenant cluster — the same shape whether the underlying orchestrator is Kubernetes with a scheduling add-on, or a traditional HPC scheduler like Slurm.

```text
 Team submits a job
 (training run / batch inference / notebook)
        |
        v
 +----------------------+   Does this team/project have
 |   Quota Check        |   remaining GPU-hours or GPU-count
 |                       |   allocation left this period?
 +----------+------------+
            | pass
            v
 +----------------------+   Where does this job rank against
 |  Fair-Share / Queue   |   every other pending job, given each
 |  Scheduler            |   team's recent usage and job priority?
 +----------+------------+
            | selected to run next
            v
 +----------------------+   Does this job need a whole GPU,
 |  Placement Decision   |   a fraction of one (MIG/time-slice),
 |                       |   or several GPUs together (gang)?
 +----------+------------+
            |
            v
 +----------------------+   Is there a higher-priority job that
 |  Preemption Check     |   should bump a currently-running,
 |                       |   lower-priority job to free capacity?
 +----------+------------+
            |
            v
     Job placed on GPU(s), begins running
```

Walking through each stage:

**Quota check.** Before a job is even considered for scheduling, the platform checks whether the submitting team or project has remaining allocation — expressed as a GPU count, a GPU-hour budget, or both. This is the same conceptual role a `ResourceQuota` plays for CPU/memory in Kubernetes, just applied to a resource where going over budget is far more expensive to correct after the fact.

**Fair-share / queueing.** Once a job clears quota, it doesn't necessarily run immediately — it enters a queue alongside every other pending job across every team. A fair-share scheduler decides ordering not purely by arrival time, but by weighing each team's recent consumption against their entitled share, so a team that's been quiet for a week gets prioritized over a team that's been running jobs nonstop.

**Placement decision.** The scheduler decides whether this job needs a whole GPU, a fraction of one, or (for large distributed training) several GPUs simultaneously across possibly multiple nodes — a requirement called **gang scheduling**, where all the pieces of the job must start together or not at all, because a distributed training job with only half its workers running usually can't make progress and just burns capacity waiting for the rest.

**Preemption check.** If quota and fairness rules say a pending job should run now, but there is no free capacity, the scheduler may need to preempt (evict) a currently running, lower-priority job to make room — a decision with real consequences depending on whether that job can checkpoint and resume cleanly.

## Let's Walk Through an Example

Say a platform hosts two teams sharing an eight-GPU cluster: **Team A** (an applied-research group running long training jobs) and **Team B** (a product team running short, interactive fine-tuning experiments during business hours).

```mermaid
sequenceDiagram
    participant B as Team B (submits job)
    participant Q as Quota Controller
    participant S as Fair-Share Scheduler
    participant P as Preemption Controller
    participant A as Team A's running job (low priority)
    participant GPU as GPU Pool (8 GPUs, all in use by Team A)

    B->>Q: Request 2 GPUs for interactive fine-tuning
    Q->>Q: Check Team B's quota (has headroom)
    Q->>S: Forward to scheduler
    S->>S: Team A has used 95% of recent GPU-hours;<br/>Team B has used 10%. Team B ranks higher.
    S->>P: No free GPUs — evaluate preemption
    P->>A: Check priority class of Team A's job (Batch, preemptible)
    P->>A: Send preemption signal (job checkpoints, exits gracefully)
    A-->>GPU: Releases 2 GPUs
    P->>GPU: Assign 2 GPUs to Team B's job
    GPU-->>B: Job starts running
```

Notice what each mechanism contributed: quota confirmed Team B was allowed to ask at all; fair-share scheduling recognized Team B had been under-served relative to its allocation and should rank ahead of Team A's next request; and preemption — because Team A's job was explicitly marked as a lower, preemptible priority class and had checkpointing built in — reclaimed capacity without losing Team A's work outright. Remove any one of these mechanisms and this exact scenario breaks: without quota, Team A could simply keep submitting jobs and never leave room; without fair-share ranking, Team B would sit behind a plain FIFO queue of Team A's backlog; without preemption, Team B would simply wait for Team A's job to finish naturally, regardless of how relatively urgent Team B's work was.

## Under the Hood

### Why GPUs don't slice like CPU cores

In Kubernetes, CPU is a **compressible** resource — the kernel's CFS (Completely Fair Scheduler) can time-slice a physical core across many processes' `cpu: "100m"` requests, and a process that gets less CPU than requested just runs slower, not incorrectly. Memory is trickier (it's not compressible in the same way) but still fundamentally fine-grained: it's addressed in bytes, and the OS enforces limits per-process with mechanisms (cgroups) built directly into the kernel.

A GPU, exposed through the standard Kubernetes device-plugin interface, is neither. The device plugin model advertises GPUs as a countable, non-fractional custom resource (conventionally `nvidia.com/gpu`) — a pod requests an integer number of them, and the scheduler treats each GPU as a single indivisible unit to hand to exactly one container, the same way it would treat a physical, un-shareable peripheral. There is no default equivalent of `nvidia.com/gpu: "0.25"` the way there is for CPU millicores, because the underlying hardware and driver model weren't originally designed to be time-sliced or memory-partitioned safely between untrusted tenants. Everything in the "fractional GPU sharing" section below exists specifically to work around that default.

> **Note on Dynamic Resource Allocation (DRA).** Everything above describes the long-standing device-plugin model, which is still what most production GPU clusters run on today. It is not the end state: Kubernetes' **Dynamic Resource Allocation** (`resource.k8s.io`, using `DeviceClass`/`ResourceClaim` objects instead of a plain integer count) reached General Availability in Kubernetes 1.34 and is aimed specifically at expressing richer device requests — MIG shapes, multi-GPU topology, and shared/consumable capacity — without every driver reinventing its own scheme. Two things matter for this article's scope: first, DRA changes *how* fractional and topology-aware requests get expressed, not the underlying fair-share/quota/preemption policy problem this article covers. Second, as of this GA release, the default kube-scheduler does not support preempting a pod that holds a DRA-managed device — a higher-priority pod waiting on a DRA resource stays pending rather than triggering eviction the way the `PriorityClass` preemption described below does for device-plugin GPUs. Treat DRA adoption and driver maturity as something to verify against current Kubernetes and vendor documentation before relying on it for the preemption behavior this article describes.

### Quota systems

At the platform layer, GPU quota is usually enforced at two levels simultaneously:

- **Cluster/namespace-level quota** (a Kubernetes `ResourceQuota` object, scoped to a namespace) caps the total `nvidia.com/gpu` count a given team's namespace can request at once — the same mechanism used for CPU/memory quota, just pointed at the GPU custom resource.
- **Organizational/budget-level quota**, tracked outside Kubernetes entirely (often in the platform's own control plane or a FinOps system), caps cumulative **GPU-hours** consumed over a billing period — because unlike CPU quota, GPU cost accrues fast enough, and GPUs are scarce enough, that "how many at once" and "how much total time" both need independent limits.

> **Verification Note**
> Exact `ResourceQuota` field names, the specific custom resource name a given GPU vendor's device plugin advertises, and any managed cloud provider's specific quota-request workflow change across Kubernetes and vendor driver versions. Confirm the current field names and vendor device-plugin documentation before writing production manifests.

### Fair-share scheduling

Plain FIFO queuing (first job in, first job scheduled) is the default behavior you'd get from a naive batch queue, and it fails multi-tenant clusters in a specific, predictable way: a single team that submits many jobs in a row can occupy the front of the queue indefinitely, starving every other team's requests regardless of how small or urgent they are.

Fair-share scheduling — a concept with deep roots in traditional HPC schedulers (Slurm's fairshare algorithm being a well-known example) and now available in the Kubernetes ecosystem through batch-scheduling add-ons — instead ranks pending jobs using each team's **historical usage relative to their entitled share**, not just arrival order. A team that's under its fair share of recent cluster time gets prioritized over a team that's been consuming more than its share, even if the second team's job was submitted first. This is the direct mechanical answer to "one team's aggressive job submission shouldn't be able to starve everyone else," and it's also why fair-share schedulers need to track usage history over a rolling time window, not just the current instant.

Two Kubernetes-native projects built specifically to add this kind of batch-aware, fair-share, gang-scheduling behavior on top of the default scheduler are **Kueue** (a Kubernetes SIG project focused on job queueing) and **Volcano** (a CNCF project with roots in HPC-style batch scheduling). Both exist because the *default* Kubernetes scheduler makes pod-by-pod placement decisions and has no native concept of "this team's fair share over the last week" or "these six pods must all start together or none should."

### Fractional GPU sharing

Because a whole-GPU-per-workload default wastes enormous capacity on workloads that don't need it (a small inference test, a Jupyter notebook, a lightweight fine-tuning job), several mechanisms exist to split GPU capacity below the whole-device level — each with a different isolation and performance trade-off:

| Mechanism | How it works | Isolation | Typical use |
|---|---|---|---|
| **Multi-Instance GPU (MIG)** | Hardware-level partitioning available on supported data-center GPU architectures; splits one physical GPU into several fully isolated instances, each with dedicated compute cores and dedicated memory | Strong — hardware-enforced, one tenant cannot see or starve another's partition | Multi-tenant clusters where isolation guarantees matter (shared platform serving multiple internal teams or external customers) |
| **Time-slicing** | The GPU scheduler switches between multiple processes' contexts in time slices, similar in spirit to CPU time-slicing | Weak — no memory isolation between contexts by default; one workload can still exhaust shared GPU memory and affect others | Trusted internal workloads (same team, dev/test) where a full MIG partition would be overkill |
| **Multi-Process Service (MPS)** | Allows multiple processes to submit work to the same GPU concurrently without full context-switch overhead, improving throughput for many small jobs | Weak on fault isolation — a misbehaving client has historically been able to affect other clients sharing the same MPS server, and this depends heavily on driver/version behavior | High-throughput small-batch workloads where the tenants are trusted and cooperating |
| **vGPU (virtualization layer)** | A hypervisor-level virtual GPU, commonly used in VM-based environments rather than containers, with vendor licensing involved | Depends on vendor implementation | VDI and virtualization-first environments, less common in container-native AI platforms |

> **Verification Note**
> Which specific GPU architectures and generations support hardware MIG partitioning, the maximum number of MIG instances per physical GPU, and the current isolation/fault-tolerance guarantees of MPS all change across vendor hardware and driver releases. Confirm against the GPU vendor's current documentation before making an isolation-sensitive design decision — the isolation strength listed above is directional, not a guarantee for any specific hardware generation or driver version.

The platform-engineering decision here is not "which is best" — it's "which trade-off matches this workload." A shared multi-tenant platform serving untrusted or semi-trusted internal teams generally wants MIG's hardware isolation, even at some cost in flexibility (fixed partition shapes), because the alternative is a noisy-neighbor and potential cross-tenant-visibility problem. A single trusted team running many small dev jobs might reasonably choose time-slicing for its simplicity and finer-grained oversubscription, accepting the weaker isolation because the tenants aren't adversarial.

### Preemption policy

Preemption is what keeps a rigid quota-plus-queue system from wasting capacity. Without it, once a job claims a GPU, it holds that GPU until it finishes — even if a much higher-priority job arrives five minutes later and now has to wait hours. With it, the scheduler can evict a lower-priority job to free capacity immediately for higher-priority work.

The mechanism, in Kubernetes terms, is a **PriorityClass**: pods are assigned a priority value, and when the scheduler can't place a pending higher-priority pod due to lack of resources, it can evict lower-priority pods to make room, provided those pods tolerate preemption. This is a direct extension of the same `PriorityClass` mechanism used for CPU/memory workloads — but the *stakes* of preemption are categorically higher for GPU workloads, because:

- **Preempting a CPU/memory workload usually just delays it** — Kubernetes reschedules it and it resumes from wherever a stateless retry naturally lands.
- **Preempting a multi-hour training job without checkpointing throws away that entire run's progress.** The workload itself has to be designed to checkpoint its state periodically (a responsibility of the training framework, not the scheduler) for preemption to be anything other than destructive.

This is why serious GPU-scheduling platforms treat "is this workload checkpoint-capable" as a first-class scheduling input, not an afterthought — a job that can't checkpoint should generally run at a priority tier where it won't be preempted at all, or should be broken into smaller units that fail cheaply.

## Implementation

You don't need a full multi-tenant scheduler add-on installed to see the shape of these controls. Here's what quota, priority/preemption, and a batch queue look like as real Kubernetes configuration.

**Namespace-level GPU quota**, capping a team's namespace to at most 4 GPUs in use at once:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-research-gpu-quota
  namespace: team-research
spec:
  hard:
    requests.nvidia.com/gpu: "4"
```

Only the `requests.` prefix is valid for an extended resource like `nvidia.com/gpu` in a `ResourceQuota` — Kubernetes doesn't allow overcommitting extended resources, so a pod's GPU `limits` must already equal its `requests`, and a `limits.nvidia.com/gpu` quota key is simply not honored (it won't appear in the quota's tracked usage). `requests.nvidia.com/gpu` is the only key that actually caps and enforces the namespace's GPU count.

**A preemptible PriorityClass** for long-running, checkpoint-capable batch training jobs, ranked below interactive workloads:

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: batch-training-preemptible
value: 100
preemptionPolicy: PreemptLowerPriority
globalDefault: false
description: "Long-running training jobs that checkpoint regularly and can tolerate preemption."
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: interactive-inference
value: 1000
preemptionPolicy: PreemptLowerPriority
globalDefault: false
description: "Interactive, latency-sensitive workloads that should preempt lower-priority batch jobs when GPUs are scarce."
```

A pod then opts into a tier by name, and the scheduler does the rest:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: training-job-checkpointed
  namespace: team-research
spec:
  priorityClassName: batch-training-preemptible
  containers:
    - name: trainer
      image: your-registry/training-job:latest
      resources:
        requests:
          nvidia.com/gpu: 1
        limits:
          nvidia.com/gpu: 1
```

**A Kueue-style ClusterQueue**, expressing fair-share capacity across two teams sharing an eight-GPU pool (illustrative shape — consult Kueue's current documentation for exact API fields):

```yaml
apiVersion: kueue.x-k8s.io/v1beta1
kind: ClusterQueue
metadata:
  name: shared-gpu-pool
spec:
  namespaceSelector: {}
  resourceGroups:
    - coveredResources: ["nvidia.com/gpu"]
      flavors:
        - name: default-gpu
          resources:
            - name: "nvidia.com/gpu"
              nominalQuota: "8"
  cohort: research-cluster
```

Each `LocalQueue` in a team's namespace then binds to this shared `ClusterQueue`, and Kueue enforces fair borrowing between teams in the same cohort — a team can temporarily borrow another team's unused quota, but must yield it back under contention, which is the queueing-system equivalent of the fair-share behavior described earlier.

> **Verification Note**
> Kueue and Volcano's exact CRD schemas, supported fields, and fair-share algorithm details evolve across releases. Treat the YAML above as illustrative of the *shape* of the configuration, and verify exact field names against the current project documentation before deploying.

A few things worth noticing, because each maps directly back to a concept above: the quota is expressed in whole GPUs, not fractional units, because that's what the default device-plugin model gives you; the priority values create an explicit, declared hierarchy rather than an implicit "whoever asks first" ordering; and the ClusterQueue's `nominalQuota` is the platform team's actual policy decision — encoded as configuration, not enforced by convention or a Slack message asking people to be considerate.

## What Can Go Wrong?

- **Quota fragmentation across teams leaves capacity stranded.** If Team A is granted a quota of 3 GPUs and Team B a quota of 3 GPUs on a 6-GPU cluster, but Team A is idle and Team B needs 5 for one job, a rigid per-team quota with no borrowing mechanism leaves 3 GPUs idle while Team B waits — this is exactly the problem fair-share/borrowing systems like Kueue's cohorts exist to solve.
- **Bin-packing failure from indivisible GPU requests.** A job needing 8 GPUs together can fail to schedule even when a cluster has 8 GPUs free in total, if those free GPUs are scattered as 2-3 per node across several nodes and the job needs them co-located for fast interconnect access. This is a fundamentally harder packing problem than scheduling a stateless web pod that can run anywhere.
- **Preempting a non-checkpointed job destroys real work.** If preemption policy is configured without regard for whether the target workload can actually checkpoint and resume, "reclaiming capacity efficiently" becomes "silently deleting hours of GPU-hours of progress," which is worse for total cluster efficiency than not preempting at all.
- **Time-sliced or MPS-shared GPUs create noisy-neighbor memory pressure.** Because these mechanisms don't hard-partition memory the way MIG does, one workload that unexpectedly grows its memory footprint can starve or crash a co-located workload that has no visibility into what else is running on the same physical device.
- **Cold-start and checkpoint-reload latency undermines otherwise-correct scheduling decisions.** A perfectly reasoned preemption or scheduling decision can still produce a bad outcome in practice if the replacement job takes many minutes to load weights or restore a checkpoint before doing useful work — the scheduling policy needs to account for this cost, not assume placement is instantaneous the way it effectively is for lightweight pods.
- **Gang-scheduling deadlock.** A naive scheduler that places distributed training workers one at a time, without an all-or-nothing gang-scheduling guarantee, can partially place a job (some workers running, others queued behind other work), where the running workers sit idle waiting for the rest indefinitely — burning GPU-hours on a job that can't make progress.

## Security Considerations

- **Weak-isolation sharing mechanisms and multi-tenancy don't mix by default.** Time-slicing and MPS were designed primarily for throughput, not tenant isolation. Placing workloads from different trust boundaries (different customers, or teams with different data-sensitivity levels) on a time-sliced or MPS-shared GPU without additional controls risks one tenant observing performance side effects of another, or a misbehaving process degrading another tenant's job. If tenants don't fully trust each other, prefer hardware-partitioned sharing (MIG) or dedicate whole GPUs, and treat "different tenants sharing a GPU" as a trust-boundary decision, not just a bin-packing optimization.
- **Quota and priority configuration are themselves privileged, high-value targets.** Whoever can edit `ResourceQuota`, `PriorityClass`, or a fair-share scheduler's queue configuration effectively controls who gets access to the most expensive hardware in the platform. RBAC on these objects deserves the same scrutiny as RBAC on Secrets — a compromised or over-permissioned service account that can raise its own namespace's GPU quota, or assign itself the highest PriorityClass, can starve every other tenant or run unauthorized workloads on privileged hardware.
- **Preemption can be abused as a denial-of-service vector.** If any tenant can submit workloads at a high-priority tier without governance, they can repeatedly preempt other teams' legitimate work — the scheduling equivalent of a resource-exhaustion attack, except the resource is other people's GPU-hours. Priority tiers should be assigned by platform policy (ideally via admission control), not self-selected by whoever submits the job.
- **Fractional-sharing memory residue between tenants.** Depending on driver and hardware generation, GPU memory is not always guaranteed to be wiped between different tenants' use of a shared or time-sliced device the way process memory is isolated by the OS on a CPU. Don't assume "different container" implies "no possibility of data remaining accessible" without verifying the specific isolation guarantees of the sharing mechanism and driver version in use.
- **Scheduler/queue-controller credentials are a high-value target**, for the same reason described in the AI infrastructure article's security section: whatever component has authority to place workloads onto GPU nodes can be abused to run unauthorized compute, at someone else's cost, on hardware that's expensive enough to make that theft of service directly material.

## Common Misconceptions

**Misconception:** "If we just add more GPU quota, the scheduling problem goes away."
**Reality:** Quota controls *how much* a team is allowed to ask for; it doesn't solve *ordering* (fair-share), *fragmentation* (indivisible units scattered across nodes), or *waste* (idle allocated-but-unused capacity). More quota without the scheduling mechanisms in this article just moves the same problems to a larger number.

**Misconception:** "Kubernetes already handles this the same way it handles CPU and memory."
**Reality:** The default Kubernetes scheduler places pods one at a time based on requests/limits and has no built-in concept of team-level fair share over time, gang scheduling for distributed jobs, or GPU-specific fractional sharing. All of that requires deliberately added components (Kueue, Volcano, GPU-vendor sharing configuration) — it is not automatic just because the cluster also happens to run GPU workloads.

**Misconception:** "Time-slicing and MIG are basically the same thing, just different names."
**Reality:** They solve the same *problem* (fit more than one workload on a physical GPU) with very different *guarantees*. MIG is hardware-enforced partitioning with real memory and fault isolation between instances; time-slicing is closer to cooperative multitasking with shared memory and no hard isolation boundary. Choosing between them is a trust and isolation decision, not just a performance tuning knob.

**Misconception:** "Preemption is just a more aggressive version of pod eviction, so it's always safe to enable."
**Reality:** Preemption is only safe to the extent the preempted workload can recover its progress. Enabling preemption on jobs that don't checkpoint turns "reclaim idle-ish capacity" into "randomly destroy hours of work," which can make overall cluster efficiency worse, not better.

## Real-World Architecture

The same layering shows up across both the Kubernetes-native world and the older HPC world it borrowed heavily from:

- **Traditional HPC batch schedulers** (Slurm being the most widely deployed example in research and supercomputing environments) have implemented fair-share scheduling, priority queues, and gang scheduling for GPU/accelerator-backed jobs for a long time before Kubernetes-native equivalents existed — much of the vocabulary used in this article (fair-share, gang scheduling, backfill) originates there, and many large-scale AI training clusters still run on Slurm or Slurm-like schedulers rather than Kubernetes, specifically because of this maturity.
- **Kubernetes-native batch/queueing add-ons** (Kueue and Volcano being the prominent CNCF-ecosystem examples) bring the same fair-share and gang-scheduling concepts into clusters that are otherwise standard Kubernetes, letting a platform team keep the rest of its Kubernetes tooling while adding GPU-aware queueing on top.
- **Commercial GPU-orchestration platforms** exist specifically to package quota, fair-share, fractional sharing, and preemption into a single product layered on top of Kubernetes, aimed at organizations that don't want to assemble these pieces themselves from open-source components.
- **Cloud-provider managed GPU quota systems** sit one layer above all of this — before your cluster's internal scheduler ever sees a request, the cloud provider's own account-level quota (a hard ceiling on how many GPU instances your account can provision in a region) is often the very first scarcity constraint a platform team hits, frequently requiring a support ticket or account-team conversation to raise, not just a configuration change.

> **Verification Note**
> Specific product names, feature sets, and which scheduler a particular organization uses for its GPU clusters change over time and are frequently not publicly disclosed in detail. Treat any named tool above as an example of a category of solution, and confirm current capabilities against that project's or vendor's own documentation before making a platform architecture decision.

## Expert Insight

The most common mistake platform teams make with GPU provisioning is treating it as a **quota problem** when it's actually a **scheduling-policy problem**. Raising everyone's quota ceiling doesn't fix contention — it just means more teams can simultaneously ask for more than the cluster has, and you're back to needing fair-share ranking and preemption to decide who actually runs. Quota answers "how much is this team entitled to over time"; scheduling policy answers "what happens right now, this minute, when demand exceeds supply." Teams that only tune the first number and never build the second mechanism end up with a cluster that looks fully allocated on paper and still has teams silently waiting days for capacity that, on average, exists.

The second lesson experienced platform teams learn is that **fractional sharing is a governance decision disguised as a performance optimization.** It's tempting to enable time-slicing or MPS broadly because the utilization graphs look better immediately — more workloads packed onto the same hardware. But the isolation trade-off doesn't show up on a utilization dashboard; it shows up later, as an unpredictable, hard-to-reproduce latency spike or a data-adjacency concern that someone in security or compliance asks about after the fact. The teams that get this right decide, explicitly and in advance, which workloads are trusted enough to share a GPU without hardware isolation — rather than discovering the answer during an incident review.

## Try It Yourself

**Goal:** Observe quota enforcement and preemption behavior directly, without needing an actual GPU-backed cluster.

**Starting Point:** Any Kubernetes cluster you can experiment on (a local `kind` or `minikube` cluster is enough — you can simulate GPU-like scarcity using an ordinary custom resource or even plain CPU requests to observe the *mechanics*, since the scheduling and quota behavior is identical regardless of which resource name is being counted).

**Task:**
1. Create a namespace with a `ResourceQuota` capping a resource (real GPU count, or a stand-in like `requests.cpu`) to a small number, then submit pods that exceed it and observe the rejection.
2. Create two `PriorityClass` objects at different priority values, and submit a low-priority pod that fills all available capacity, followed by a high-priority pod requesting the same resource. Watch (`kubectl get events`) for the preemption event evicting the lower-priority pod.
3. Read Kueue's own quickstart documentation and stand up a minimal `ClusterQueue`/`LocalQueue` pair with two teams' namespaces bound to it, then submit jobs from both and observe how quota borrowing between them behaves under contention.

**Expected Result:** You should see the quota controller reject over-budget requests outright, and see a concrete preemption event in the cluster's event log when a higher-priority pod needs capacity a lower-priority pod is holding.

**What You Learned:** Quota enforcement and preemption aren't abstract policy statements — they're concrete, observable control-plane events, and the same mechanics apply whether the resource being governed is CPU, memory, or a scarce accelerator.

## Pause and Think

Why can't you just give every team a small fractional CPU-style request for GPUs (like `nvidia.com/gpu: "0.25"`) by default, the same way Kubernetes lets you request `cpu: "250m"`?

### Answer

Because CPU fractional requests work by relying on a scheduling mechanism already built into the kernel — the CFS time-slices a physical core across processes, and a process that gets less CPU than requested simply runs more slowly, without any risk of memory corruption or data leakage between processes; the isolation guarantee (separate address spaces, kernel-enforced scheduling) already exists independent of the fractional request. A GPU, exposed through the standard device-plugin model, doesn't have an equivalent default: the hardware and driver stack weren't originally designed to transparently and safely time-slice or memory-partition a device between multiple untrusted tenants the way a CPU core is. Fractional GPU sharing only becomes safe and well-defined once you deliberately add a mechanism that provides that isolation — either in hardware (MIG's dedicated partitions) or with an explicit, accepted trade-off in isolation strength (time-slicing, MPS). That's why fractional GPU sharing is an opt-in, deliberately configured platform decision, not a scheduler default the way fractional CPU is.

## Key Takeaways

- GPUs break the standard CPU/memory provisioning playbook because they are scarce relative to demand, mostly indivisible by default, and expensive to interrupt mid-work — three properties that rarely combine this severely for ordinary compute.
- Quota systems set the ceiling on what a team can request, but don't by themselves solve ordering, fragmentation, or waste — that's the job of fair-share and gang scheduling.
- Fair-share scheduling ranks pending work by each team's usage relative to their entitlement over time, preventing one team's submission volume from starving everyone else the way plain FIFO queuing would.
- Fractional-sharing mechanisms (MIG, time-slicing, MPS) trade isolation strength for utilization and flexibility differently, and choosing between them is fundamentally a trust-boundary decision, not just a performance tuning choice.
- Preemption reclaims capacity from lower-priority work for higher-priority work, but is only safe when the preempted workload can checkpoint and resume — otherwise preemption destroys real progress instead of reclaiming idle capacity.
- Governance of quota, priority assignment, and scheduler/queue-controller credentials deserves the same security scrutiny as any other high-value, high-privilege platform control, because misconfiguration here translates directly into unauthorized access to genuinely expensive hardware.

## What to Learn Next

This article stayed at the platform-policy layer: who gets a GPU, how much, and what happens under contention. The next articles in this series go one layer down and one layer sideways. *GPU Clusters and Model Serving: How AI Compute Actually Scales* covers how a cluster scheduler and serving engine cooperate once a workload has actually been placed on GPU hardware. *Understanding AI Supercomputing: Networking, Storage, and Scheduling for Training* covers the training-specific side of scheduling at very large scale, where network topology and job-checkpoint storage become first-class scheduling inputs alongside everything covered here. And *Platform Engineering 2.0: Building Internal Platforms for AI Agents*, along with *FinOps for AI: Understanding and Controlling LLM Inference Costs*, pick up the broader platform and cost-governance threads this article's quota and preemption sections only briefly touched.
