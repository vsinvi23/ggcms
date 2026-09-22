---
title: "Trusted Execution Environments: How Hardware Enforces Data Privacy"
description: "A deep dive into the actual silicon mechanisms — memory encryption engines, RMP/GPT ownership tables, and attestation quotes — behind Intel SGX, AMD SEV-SNP, Intel TDX, and Arm CCA, and precisely what a root/hypervisor attacker still can and can't do."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "DEEP_DIVE"
tags:
  - "trusted-execution-environment"
  - "confidential-computing"
  - "sgx"
  - "sev-snp"
  - "intel-tdx"
  - "arm-cca"
  - "attestation"
  - "memory-encryption"
  - "hardware-security"
---

# Trusted Execution Environments: How Hardware Enforces Data Privacy

By the end of this article you'll be able to point at the actual silicon-level mechanisms — the memory encryption engine, the per-context key, the integrity table the hypervisor can't forge — that make a Trusted Execution Environment's promise real, and you'll be able to say precisely what a `root` shell on the host still can and can't do to it.

## The Problem

A Trusted Execution Environment (TEE) keeps data encrypted and isolated even from a compromised OS or hypervisor. That's a satisfying sentence to say in a design review. It's also, on its own, an act of faith — "trust the CPU" is not meaningfully different from "trust the cloud provider" unless you can explain *what the CPU is actually doing differently* from every other piece of software on the machine.

So this article asks the question a skeptical security architect should ask next: **mechanically, at the level of registers, memory controllers, and page tables, how does a chip stop code running with `ring 0` / hypervisor privilege from reading memory that's sitting three inches away on the same DIMM?**

That's not a rhetorical question with a hand-wavy answer. It has a specific, checkable answer, and it's different for each vendor's implementation. If you're going to put a regulated workload, a model's weights, or a customer's health record inside one of these boundaries, you should know exactly which structure is doing the enforcing — because that's also exactly where you'd look for the crack.

## A Simple Mental Model

Picture a safe-deposit box vault with a genuinely dual-key design: the bank's staff can unlock the *vault room* — they manage which box goes where, they can carry a box out to a different room, they can even destroy a box if they want to — but every individual box has a second lock that only the customer's own key opens, and the bank never had a copy of that key cut. The bank administers the *building*; it does not hold the key to what's *inside*.

That's the split a TEE creates between the hypervisor and the CPU's memory-encryption hardware. The hypervisor still manages *which physical page belongs to which VM* — that's its job, and it keeps doing it. What it loses is the second key: the one that turns that page's ciphertext back into plaintext. That key exists only in a register inside the CPU package, generated (or derived) at boot or launch time, and there is no software-visible instruction — not for the hypervisor, not for firmware, not for a debugger — that reads it out.

**Where this analogy breaks down:** a safe-deposit box only stores an object; it doesn't run a program that reads and writes to itself thousands of times a second while someone is timing how long each operation takes. That timing information is exactly the side channel that the vault analogy has nothing to say about — and it's why "What Can Go Wrong?" later in this article isn't optional reading.

## The Core Idea

Every TEE implementation covered here is built from the same two hardware primitives, implemented differently by each vendor:

1. **A memory encryption/integrity engine** sitting between the CPU cores and the memory bus, using a key that exists only in on-die hardware registers, so that anything landing in DRAM — whether read via a debugger, a cold-boot attack, or a hypervisor's own privileged instructions — is ciphertext to everyone except the correct execution context.
2. **A measurement-and-attestation pipeline** that hashes the exact code and initial state loaded into the protected region *before* it runs, seals that hash into hardware, and later lets the CPU sign a report over that hash with a key that never leaves the chip — so a remote party can cryptographically verify *which* code produced any given result, rather than trusting an administrator's word.

What differs across Intel SGX, AMD SEV-SNP, Intel TDX, and Arm CCA is the *shape* of the protected boundary (a slice of a process vs. a whole VM) and the *specific hardware structures* used to enforce it. Those structures are the actual subject of this article — a "TEE" isn't magic, it's a stack of concretely-named registers, tables, and instructions, and being able to name them is what separates "I read a diagram once" from "I can defend this design in an audit."

## How It Actually Works

### The shared substrate: a memory controller that doesn't trust anyone above it

Modern server CPUs from both Intel and AMD ship a **memory encryption engine (MEE)** sitting in the path between the last-level cache and the DRAM interface. When a cache line is evicted back to memory, the engine encrypts it; when it's fetched back into cache, the engine decrypts it — transparently to every instruction that isn't specifically trying to bypass it. Higher-end implementations add cryptographic integrity protection too (not just confidentiality), so that a physical replay or splice of ciphertext is detected rather than silently accepted as valid plaintext.

The key point that makes this a *trust* boundary and not just an *obfuscation* layer: **the key lives in a hardware register inside the CPU package, generated by an on-die random number generator (or derived through a hardware key-derivation function), and no architectural instruction exists for software — at any privilege level — to read it out.** The hypervisor can still tell the memory controller "this physical page belongs to key-context 7," because it has to, in order to allocate and schedule guest memory. It cannot ask the memory controller "what is key-context 7," because that question has no answer any instruction can retrieve.

> **Verification Note**
> Exact engine names (Intel Total Memory Encryption/Multi-Key TME, AMD Secure Memory Encryption), cipher choices, key lengths, and which CPU generations include integrity protection versus confidentiality-only protection are vendor- and generation-specific and change across product lines. Verify current specifics against Intel's and AMD's own architecture manuals before citing a specific mode as a hard requirement in a design.

### Intel SGX: a hand-carved enclave inside an ordinary process

SGX takes the narrowest possible boundary: a region called the **Enclave Page Cache (EPC)** — protected physical memory carved out at boot time, historically tens to low hundreds of megabytes, encrypted and integrity-checked by the MEE — inside which an application can load a small, deliberately minimal amount of sensitive code.

Building and entering an enclave is a specific instruction sequence, not a configuration flag:

- **`ECREATE`** allocates and initializes an enclave control structure.
- **`EADD`** loads pages of code and data into the EPC, page by page.
- **`EEXTEND`** feeds each added page into a running hash — this hash *is* the measurement.
- **`EINIT`** finalizes the enclave: the measurement is sealed, and no more code can be added. From this point, the enclave's identity (its **`MRENCLAVE`** value — the final hash of everything loaded) is fixed.
- **`EENTER` / `EEXIT`** are the only ways execution transitions between untrusted host code and the enclave; the CPU enforces that instructions inside the enclave range only execute when entered through this gate.

Two measurement values matter for different purposes: **`MRENCLAVE`** identifies *this exact build* of the enclave (any code change produces a different hash), while **`MRSIGNER`** identifies *who signed it* (the enclave author's key) — letting a relying party choose to trust "any enclave signed by this vendor," which matters for software that gets patched over time without changing what's fundamentally trusted.

Because the enclave can't make arbitrary system calls from inside the boundary, I/O has to be proxied: an enclave that needs to read a file or make a network call has to ask the untrusted host code to do it and hand results back across the `EENTER`/`EEXIT` gate — the host can see *that* a call happened and its size/timing, even though it can't see inside the enclave's protected memory. That asymmetry (host sees call patterns, not contents) is exactly the crack that page-fault and cache side-channel research has spent years widening — more on that under "What Can Go Wrong?"

### AMD SEV-SNP: encrypting and protecting a whole guest VM

AMD's line took the opposite shape: protect an entire VM, not a hand-picked sliver of a process, so unmodified guest operating systems and applications run inside the boundary largely unchanged.

- **SEV (the first generation)** tags each physical memory page with a **C-bit** (a bit in the physical address itself) that tells the memory controller "this page is encrypted." The C-bit alone doesn't say *whose* key to use for that page — that comes from the guest's **ASID (Address Space ID)**, the value the hypervisor loads into the VMCB to launch that specific guest. The memory controller combines the C-bit with the currently-active ASID to select the correct per-VM key slot, which is why a hypervisor can schedule guests onto and off a core (changing which ASID is active) without ever being able to redirect one guest's traffic onto another guest's key. Each VM's key is generated by the **AMD Secure Processor (PSP)** — a separate, dedicated security co-processor embedded on the same package, distinct from the main x86 cores — and never exposed to the hypervisor.
- **SEV-ES ("Encrypted State")** closed a specific gap in plain SEV: on every `VMEXIT` (the transition back to the hypervisor, which happens constantly — for I/O, interrupts, scheduling), the guest's CPU register contents used to be visible to the hypervisor in the clear. SEV-ES encrypts the register state too, storing it in a **VMSA (VM Save Area)**, and routes the narrow set of things the hypervisor genuinely needs (like an I/O port number) through an explicit, guest-controlled **GHCB (Guest-Hypervisor Communication Block)** instead of leaking the whole register file.
- **SEV-SNP ("Secure Nested Paging")** closed the bigger gap: encrypting page *contents* is not the same as guaranteeing the hypervisor can't lie about *which* encrypted page is mapped where. Without integrity protection over the mapping itself, a malicious hypervisor could remap, splice, or replay a guest's own valid ciphertext pages into different guest-physical addresses — the guest would decrypt them successfully (they're real ciphertext, encrypted with its key), just at the wrong location, corrupting guest state in an attacker-chosen way. SEV-SNP's fix is the **Reverse Map Table (RMP)**: a hardware-checked, hypervisor-writable-only-through-validated-instructions table that records, for every physical page, which guest (and which guest-physical address) currently owns it. Every memory access is checked against the RMP; a hypervisor attempt to reassign or alias a page it doesn't legitimately control is rejected by hardware, not by guest software that could be fooled.

```text
Guest writes to guest-physical page 0x4000
        |
        v
Memory Management Unit translates via nested page tables
        |
        v
RMP CHECK: does this physical page's recorded owner/GPA
           match the guest and address making this access?
        |
   +----+----+
  YES         NO
   |           |
   v           v
Access       Fault -- hypervisor's mapping
proceeds     manipulation is rejected in hardware,
             before any decrypted data is exposed
```

### Intel TDX: SGX's isolation model, applied to a whole VM

Intel's answer to "SEV-SNP's problem, our hardware" is **TDX (Trust Domain Extensions)**. Conceptually it borrows SEV-SNP's goal — protect a whole VM, called a **Trust Domain (TD)**, from the hypervisor — but implements the trusted arbiter differently: instead of a separate co-processor like AMD's PSP, TDX introduces a new CPU execution mode called **SEAM (Secure Arbitration Mode)**, in which a small, Intel-signed piece of privileged software (the **TDX module**) runs *above* the hypervisor's privilege level for the specific operations that matter — assigning memory to a TD, tracking ownership, and mediating the transitions between TD and host. The hypervisor still schedules and manages resources at a coarse grain, but the TDX module — not the hypervisor — is the thing that actually enforces which physical pages belong to which TD and encrypts/authenticates them, structurally playing the same role AMD's RMP plays, just as a software module running in a higher-privileged mode rather than a table checked directly by the memory controller's hardware logic.

### Arm CCA: Realms and the Granule Protection Table

Arm's architecture-level answer is the **Realm Management Extension (RME)**, which introduces a new isolated world called a **Realm** — conceptually parallel to TDX's Trust Domain or SEV-SNP's encrypted guest — managed by a small trusted component called the **Realm Management Monitor (RMM)**, itself measured and attestable, running at a new privilege level below the normal hypervisor. Physical memory is partitioned by a **Granule Protection Table (GPT)**, checked by hardware on every access, that assigns each memory granule to exactly one world (Normal, Secure, Realm, or Root) — structurally the same idea as SEV-SNP's RMP: a hardware-enforced ownership record the privileged software above it cannot forge.

### Comparing the four side by side

| | Intel SGX | AMD SEV-SNP | Intel TDX | Arm CCA |
|---|---|---|---|---|
| **Protected unit** | Slice of a process (enclave) | Whole VM | Whole VM (Trust Domain) | Whole VM (Realm) |
| **Ownership/integrity structure** | EPC + enclave page metadata | RMP (Reverse Map Table) | TDX module (SEAM mode) tracking | GPT (Granule Protection Table) |
| **Separate trusted co-processor?** | No -- enforced by CPU microcode/MEE | Yes -- AMD Secure Processor (PSP) | No -- SEAM mode on main cores | Yes-ish -- RMM runs at a new Arm privilege level, not a separate chip |
| **Guest OS compatibility** | None -- app must be rewritten for the enclave model | Unmodified guest OS | Unmodified guest OS | Unmodified guest OS |
| **Register-state protection from hypervisor** | N/A (whole enclave is opaque) | SEV-ES / VMSA encryption | Analogous TD state protection | Analogous Realm state protection |
| **Trusted code base size** | Very small (just the enclave) | Whole guest kernel + userspace | Whole guest kernel + userspace | Whole guest kernel + userspace |

> **Verification Note**
> Feature names, which CPU/SoC generation introduced a given capability, and current known limitations evolve quickly across vendor roadmaps. Treat this table as a conceptual map of *how each architecture enforces ownership*, and verify generation-specific claims against the vendor's current architecture documentation before relying on them in a design review.

### From measurement to a signed quote a stranger can verify

Isolating memory is only half the story — the other half is proving to someone who has never met your infrastructure team that the isolation is real and running the code they expect. The pipeline is conceptually the same across all four architectures, differing mainly in *who* generates and signs the quote:

```text
 Enclave/VM Launch      Measurement Engine        Chip Vendor's           Relying
    (Loader)          (microcode/PSP/TDX/RMM)    Provisioning Root      Party
      |                        |                        |                    |
      |--1. Load code + ------>|                        |                    |
      |   initial mem pages    |                        |                    |
      |                        |--2. Hash each page into |                    |
      |                        |   running measurement   |                    |
      |                        |   (MRENCLAVE / TD meas.) |                    |
      |--3. Finalize ---------->|                        |                    |
      |   (EINIT / equivalent) |  measurement now sealed |                    |
      |--4. Request quote----->|                        |                    |
      |                        |--5. Request signing---->|                    |
      |                        |   over the measurement, |                    |
      |                        |   key derived from      |                    |
      |                        |   fused hardware secrets|                    |
      |                        |<--6. Signed quote,-------|                    |
      |                        |   chains to vendor's    |                    |
      |                        |   manufacturing root cert|                   |
      |<--7. Return quote------|                        |                    |
      |----8. Forward quote--------------------------------------------------->|
      |                        |                        |     9. Verify sig    |
      |                        |                        |     chain to vendor  |
      |                        |                        |     root + check     |
      |                        |                        |     revocation +     |
      |                        |                        |     compare measure- |
      |                        |                        |     ment to expected |
      |                        |                        |     known-good hash  |
```

The detail worth sitting with: **the signing key at the bottom of that chain is provisioned into the chip during manufacturing and is itself protected by the same class of hardware isolation the chip provides to workloads** — Intel's and AMD's provisioning infrastructure for these keys is treated with HSM-grade protection, because if that key were ever extracted, an attacker could forge quotes for arbitrary fake measurements, and the entire attestation scheme for every chip sharing that key material would need to be revoked.

## Under the Hood: What Root Access Genuinely Can't Do

This is the question the whole article has been building toward. Assume the worst realistic case: an attacker has full root on the host OS, or full control of the hypervisor. Walk through their usual toolkit and what happens to each tool against a properly-configured TEE.

**`/dev/mem`, `/proc/<pid>/mem`, hypervisor memory-introspection APIs.** These read *physical* addresses. Inside the protected range, the bytes returned are whatever the memory encryption engine produced — ciphertext under a key that lives only in an on-die register the read instruction has no path to. The attacker gets bytes; the bytes are cryptographically meaningless without the key, and there is no instruction, at any privilege level, that extracts that key into a general-purpose register.

**Remapping, splicing, or replaying encrypted pages.** Under plain SEV (and, differently, an unprotected VM in general), a hypervisor controls the guest-physical-to-host-physical mapping and could in principle redirect where a given ciphertext page lands. SEV-SNP's RMP and Arm CCA's GPT exist specifically to make this fail: every memory access is checked against a hardware-maintained ownership record the hypervisor can update only through instructions the CPU validates, not by writing the table directly. A hypervisor attempting to alias a guest's page into a location it doesn't legitimately own is rejected before any decrypted content is exposed.

**Reading guest register state at a `VMEXIT`.** Under plain SEV, this was genuinely visible to the hypervisor — a real gap that SEV-ES closed by encrypting the VMSA and forcing communication through an explicit GHCB the guest itself controls. Post-SEV-ES, a hypervisor handling a routine `VMEXIT` sees only what the guest deliberately exposed for that specific exit reason, not the full register file.

**Attaching a debugger or single-stepping into the protected boundary.** SGX enclaves, SEV-SNP guests, TDX TDs, and CCA Realms all disable or gate standard debug/introspection paths into the protected execution context during normal operation. Vendors do provide debug-enabled modes for development — but those modes are themselves reflected in the measurement, so a relying party whose verification logic actually checks the measurement (not just the signature) will see that a debug-enabled instance doesn't match the expected production hash and should refuse to release secrets to it.

**Modifying the code before or during execution and having it go unnoticed.** Any change to the code loaded before the measurement is finalized changes the hash — full stop, this is a property of cryptographic hashing, not a heuristic. Modifying code *after* the boundary is sealed isn't possible through ordinary memory writes from outside, because the integrity-checked memory (where implemented) will detect tampering, and unauthenticated-but-encrypted-only schemes at minimum prevent the attacker from writing *meaningful* plaintext, since they can't produce valid ciphertext for arbitrary chosen plaintext without the key.

None of this requires trusting the hypervisor's good behavior. It requires trusting that the specific hardware structure — MEE key registers, RMP, GPT, TDX module — was manufactured correctly and hasn't been physically compromised. That's a meaningfully smaller trust surface than "the entire cloud provider's software stack and staff," but it is not zero.

## What Can Go Wrong?

**Page-fault and cache-timing side channels observe *behavior*, not *content*.** A hypervisor still controls the page tables that decide when a page fault occurs, and can single-step a guest or enclave through page-granularity faults, learning the *pattern* of memory accesses (which pages were touched, in what order) without ever reading their decrypted contents. If a program's memory access pattern depends on secret data — a lookup table indexed by a key byte, a branch taken based on a password comparison — that access pattern itself can leak the secret, entirely without breaking the memory encryption. This class of attack (broadly, "controlled-channel" and cache-timing side channels) was demonstrated against early SGX implementations in academic research and is a standing reason vendors and application developers are pushed toward constant-time, data-independent-access coding patterns for anything running inside a TEE.

**Speculative-execution attacks can, under some conditions, leak data across the boundary the memory encryption itself never touches.** Because these attacks exploit the CPU's speculative/transient execution behavior rather than reading encrypted memory directly, a memory-encryption engine doesn't inherently stop them — mitigation instead comes from microcode updates, changes to speculation behavior, and application-level countermeasures, an ongoing area of hardware/software co-design across the industry.

> **Verification Note**
> Specific named vulnerabilities (their CVE identifiers, which exact TEE generations were affected, and current patch/mitigation status) are actively evolving and vendor-specific. Verify any named attack or CVE against the relevant vendor's current security advisories and recent academic literature before citing it as a settled fact in a security design document.

**A larger trusted code base means a larger attack surface, structurally.** The whole-VM approaches (SEV-SNP, TDX, CCA) put an entire guest kernel inside the trust boundary. A memory-safety bug in that guest kernel is now a bug inside your confidential computing base — the TEE's hardware isolation protects the boundary *from the outside*, it does nothing about a vulnerability *inside* the boundary being exploited by, say, a malicious network packet the guest itself processes. SGX's narrower enclave boundary was specifically designed to minimize this exposure, at the cost of the awkward programming model described earlier.

**Physical, lab-grade attacks remain a live research area.** Electromagnetic and power side-channels, fault injection against the chip package, and cold-boot-style attacks against the specific hardware key registers have all been explored in academic settings against various TEE implementations. Vendors' own threat models generally assume the attacker does not have sustained, unrestricted physical possession of the chip with specialized lab equipment — a materially different (and much higher) bar than "has root over SSH," but not the same as "physically impossible."

**None of this is caught by attestation, and that's by design, not an oversight.** Attestation proves which measured code is running. It says nothing about whether that code has a side-channel-exploitable secret-dependent branch, a buffer overflow, or a logic bug that leaks data through an output channel the hardware was never meant to police. A relying party who treats a valid attestation as "this workload is fully secure" has confused *what code is running* with *whether that code is well-written* — the hardware attests to the former only.

## Security Considerations

| | |
|---|---|
| **Asset** | Plaintext code/data inside the protected execution boundary; the hardware key(s) enforcing that boundary |
| **Threat** | Root/administrator on host OS, malicious or compromised hypervisor, physically-present attacker with lab equipment |
| **Attack** | Physical memory dump, page-remapping/replay, register-state inspection at VMEXIT, debugger attachment, page-fault/cache-timing side channels, speculative-execution leakage, fault injection |
| **Mechanism defeating it (where defeated)** | Memory encryption engine (key never software-readable); RMP / GPT / TDX-module ownership enforcement; SEV-ES register encryption; debug-path gating reflected in measurement; cryptographic hashing of loaded code |
| **Residual risk (not defeated by isolation alone)** | Access-pattern side channels, speculative-execution attacks, bugs inside the trusted code base itself, sophisticated physical attacks, an attestation check that exists but is never actually enforced |

The practical rule that falls out of this table: **hardware isolation and remote attestation answer different questions, and both have to be actually correct for the guarantee to hold.** Isolation without attestation means you can't tell if the right code is even running. Attestation without a relying party that rejects mismatched measurements is a signature nobody checks. And even with both working, the trusted code base itself still has to be written as if it will be probed for access-pattern and timing leaks — because it will be.

## Common Misconceptions

**Misconception:** "Memory encryption means side-channel attacks are already handled."
**Reality:** Memory encryption protects *content*. Side-channel attacks typically don't try to read content — they infer secrets from *timing*, *access patterns*, or *power draw*, none of which the encryption engine was built to hide.

**Misconception:** "A bigger, whole-VM TEE (SEV-SNP/TDX/CCA) is strictly more secure than a small enclave (SGX) because it protects more."
**Reality:** It protects a *larger volume of code*, which is a larger attack surface, not a stronger guarantee. A smaller trusted code base is easier to audit and has fewer places for a bug to hide — the trade-off is a harder programming model, not "less security" in absolute terms.

**Misconception:** "The RMP / GPT / TDX-module is just a software policy the hypervisor agrees to follow."
**Reality:** It's checked by hardware on every relevant memory access, specifically because a software-only policy is exactly what a compromised or malicious hypervisor would ignore. The entire point of these structures is that the hypervisor's cooperation isn't required for the check to hold.

## Real-World Architecture

Cloud providers expose these mechanisms as instance types or runtime options layered on top of one of the architectures above — a confidential VM backed by AMD SEV-SNP or Intel TDX, or an enclave-based service backed by SGX — typically paired with an attestation-verification service the provider or chip vendor operates. The workloads that justify adopting this stack tend to share a shape: **the party operating the infrastructure is explicitly not supposed to be able to see the data or the model.** Multi-party health and financial data pooling, and confidential AI inference where a model owner doesn't want weights extracted by the host and a data owner doesn't want inputs read by the model owner, are the recurring patterns — and in the AI-inference case specifically, remember that a CPU-based TEE's protection stops at the CPU-GPU boundary: model weights and inputs crossing PCIe into GPU memory need the GPU's *own* attestable confidential-computing mode to stay covered, which is a separate hardware trust boundary from the CPU TEE, not an extension of it.

> **Verification Note**
> Which cloud instance types, regions, and CPU/GPU generations back a given confidential-computing offering — and the exact attestation service each provider operates — change frequently. Verify current availability and the underlying hardware generation against the provider's own architecture documentation before treating it as a fixed dependency.

## Expert Insight

**The measurement is only as good as your build's reproducibility.** If two builds of "the same" source code produce different binaries — non-deterministic compilation, embedded timestamps, unpinned dependency versions — you can't hand a relying party a single expected hash and have it reliably match. Teams adopting SGX or confidential VMs at scale end up investing in reproducible-build discipline earlier than they otherwise would have, because the attestation model forces the question.

**The RMP/GPT-style integrity structures are the part that took the industry a generation to get right.** Early SEV protected content confidentiality but not the mapping's integrity — the gap SEV-SNP closed. It's a useful case study in why "we encrypted it" and "we made it tamper-evident" are different engineering claims, and why a security review of any TEE-based design should ask specifically which of the two a given generation of hardware actually provides.

**Debug modes are a recurring real-world failure point, not a theoretical one.** Every architecture here has a debug or simulation mode that's essential for development and explicitly *not* meant to carry real secrets in production. The operational mistake that actually happens is a relying party's verification logic failing to check the debug flag in the measurement — an attestation that "passes" because nobody wired up the one check that would have caught it.

**Side-channel resistance is an application-level discipline, not something you get for free by choosing a TEE.** Code that branches or indexes memory based on secret values leaks through access patterns regardless of how good the underlying memory encryption is. Anyone shipping cryptographic or sensitive-comparison logic inside a TEE should already be writing constant-time code as a baseline habit — the TEE doesn't relax that requirement, if anything it raises the stakes for getting it right.

## Try It Yourself

**Goal:** Get hands-on evidence of which TEE capability, if any, your own hardware actually exposes — this grounds the whole article in something checkable rather than take-on-faith.

**Starting point:** A Linux machine (a cloud VM is fine) with either an Intel or AMD CPU from roughly the last several years.

**Task:**
1. Check what your CPU claims to support:
   ```bash
   # Look for SGX support (Intel)
   grep -o 'sgx[a-z_0-9]*' /proc/cpuinfo | sort -u

   # Look for SEV support (AMD) -- requires root, reads an MSR-adjacent CPU feature flag
   grep -o 'sev[a-z_0-9]*' /proc/cpuinfo | sort -u
   ```
2. If you have access to an SEV-SNP-capable AMD host, AMD publishes an open-source `sev-tool` / `sevctl`-style utility (naming and exact tooling have changed across releases) that can query the platform's certificate chain and, on a properly configured guest, request an attestation report. Fetching this report and inspecting its fields (measurement, policy, platform info) is the closest hands-on equivalent to the sequence diagram earlier in this article.
3. For SGX without special hardware, look at an SGX simulation mode in an SDK such as Intel's SGX SDK or the Gramine LibOS project — both offer a mode that runs enclave-shaped code without real hardware enforcement, useful for understanding the `ECREATE`/`EADD`/`EINIT` lifecycle even if you can't get a real measurement.

**Expected result:** You should come away able to say, concretely, "my CPU does/doesn't expose feature X," rather than reasoning about TEEs purely from a vendor diagram.

> **Verification Note**
> Exact tool names, CLI flags, and `/proc/cpuinfo` flag strings vary by kernel version, microcode version, and vendor tooling release. Treat the commands above as a starting point to explore, not a guaranteed-current reference.

## Pause and Think

> AMD's SEV (the first generation) encrypted every guest page with a per-VM key the hypervisor couldn't read. A researcher later demonstrated that a malicious hypervisor could still corrupt a running guest by remapping which physical page appeared at a given guest-physical address — without ever decrypting anything. Why does "we encrypted the data" not automatically imply "we protected the data's integrity and placement," and what hardware structure discussed in this article was built specifically to close that gap?

### Answer

Encryption (confidentiality) and integrity/authenticity are separate cryptographic properties, and a scheme can provide one without the other. Plain SEV's memory encryption meant the hypervisor couldn't read plaintext content, but nothing stopped it from relocating or replaying *valid ciphertext* — the guest would still decrypt it successfully (it's real ciphertext under the guest's real key), just at an address the guest didn't intend, corrupting execution in an attacker-controlled way without the attacker ever seeing a single decrypted byte. SEV-SNP's Reverse Map Table (and Arm CCA's Granule Protection Table, and TDX's module-enforced ownership tracking) exist precisely to add that missing integrity/placement guarantee: a hardware-checked record of which guest legitimately owns which physical page, verified on every access, that a hypervisor cannot bypass just by rewriting its own page tables.

## Key Takeaways

- **A TEE's guarantee rests on two separable hardware primitives**: a memory encryption engine whose key never leaves the chip, and a measurement-and-attestation pipeline that lets a remote party verify exactly what code produced that key's protected output.
- **The vendors chose different shapes for the protected boundary**: SGX carves a small enclave out of an ordinary process (EPC, MRENCLAVE); SEV-SNP, TDX, and Arm CCA each protect a whole VM (RMP, TDX module in SEAM mode, and GPT/RMM, respectively) — smaller boundary means smaller attack surface, whole-VM means better compatibility.
- **Confidentiality and integrity are different guarantees, and the industry learned this the hard way**: plain SEV encrypted content but didn't protect page *placement*, which is exactly the gap SEV-SNP's RMP (and its analogues elsewhere) was built to close.
- **A root/hypervisor attacker is genuinely defeated on a specific, enumerable list**: reading physical memory, remapping/replaying encrypted pages, inspecting register state at a VMEXIT, attaching a debugger, and tampering with code without changing its measurement.
- **The same attacker is not defeated on a different, equally specific list**: access-pattern and cache-timing side channels, speculative-execution leakage, bugs inside the trusted code itself, and sufficiently sophisticated physical attacks — none of which the memory encryption or ownership tables were designed to address.
- **Attestation only has value if the relying party's verification logic actually checks the measurement, the debug flag, and revocation status** — a quote that's fetched but not meaningfully validated provides no security benefit regardless of how sound the underlying hardware is.
