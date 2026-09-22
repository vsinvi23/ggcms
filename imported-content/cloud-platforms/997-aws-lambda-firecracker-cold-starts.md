# AWS Lambda Internals: Firecracker MicroVMs, Cold Starts, and SnapStart

## The Problem: The Latency of Cold Starts in Serverless Compute

In serverless architectures, execution environments are created dynamically on-demand. When a function has not been called recently or experiences a sudden burst of concurrent requests, AWS Lambda must instantiate a completely new environment. This phase is known as a **Cold Start**.

For standard, runtime-heavy environments (such as Java JVM or .NET runtimes), cold starts introduce painful tail latencies ($p99 > 3 \text{ seconds}$). This latency is dominated by:
1. **Hypervisor Provisioning:** Creating a secure VM wrapper.
2. **OS Boot & Runtime Init:** Booting the guest OS kernel and starting the execution engine (e.g., JVM).
3. **Application Initialization:** Compiling classes, executing static constructor blocks, and establishing database connection pools.

```
Standard JVM Cold Start Pipeline (Seconds):
+---------------------+---------------------+----------------------+
| 1. Provision VM     | 2. Boot JVM / OS    | 3. Application Init  |
| (Firecracker Init)  | (Runtime Startup)   | (Class Loading)      |
| ~5-50ms             | ~500-1500ms         | ~1000-5000ms         |
+---------------------+---------------------+----------------------+
                                            |
                             Total Delay: 2 to 6 Seconds!
```

Traditional virtualization hypervisors (such as QEMU) are too heavy for this use case, carrying massive bios initialization overheads, legacy hardware emulation layers, and high memory footprints.

---

## The Solution: Firecracker MicroVMs and SnapStart

To scale functions in milliseconds, AWS built **Firecracker**, an open-space virtual machine monitor (VMM) written in Rust. Firecracker leverages Linux's Kernel-based Virtual Machine (KVM) to spawn secure, minimalist "MicroVMs" that strip out all legacy PCI devices, virtual floppy drives, and video adapters. A raw Firecracker MicroVM boots in under 5 milliseconds.

To address the heavier JVM initialization bottleneck, AWS introduced **SnapStart**. Instead of running the entire application initialization phase on every cold start, SnapStart executes the initialization phase *during deployment*. It then takes a snapshot of the microVM's memory and disk state, encrypts it, and caches it in a high-speed tiered storage system.

```
SnapStart Deployment & Restore Pipeline (Milliseconds):
[Deployment Time]:
+---------------------+---------------------+
| Run App Init        | Take VM Snapshot    | ---> (Saves cryptographically signed
| (Class Loading etc) | (Memory & CPU State)|       snapshot chunk to tiered cache)
+---------------------+---------------------+
[Execution / Cold Start Time]:
+-------------------------------------------+
| Restore VM Snapshot from Tiered Cache     | ---> Run Handler (No Init delay!)
| (Zero-copy page restoration) ~150-200ms   |
+-------------------------------------------+
```

When a cold start occurs, Lambda bypasses the boot and initialization phases entirely. It restores the MicroVM’s execution state directly from the cached snapshot. This slashes cold-start latency from several seconds down to less than 200 milliseconds.

---

## Crucial Security Warning: The "Snapshot Sandbox" Uniqueness Problem

Because SnapStart restores an identical clone of a memory snapshot, it introduces a severe cryptographic liability. If an application generates pseudo-random numbers (e.g., UUIDs, cryptographic keys, salt values) using a standard random-number generator, **every cloned instance will generate the exact same "random" sequence** unless corrected. 

This is known as a **state-duplication vulnerability**.

---

## Technical Proof: Handling Snapshot Restore Events in Java (CRaC)

To prevent security state-duplication, AWS SnapStart implements the **Coordinated Restore at Single Point (CRaC)** API. Developers can register hooks to run custom logic immediately before a snapshot is taken (to close active DB connections) and immediately after a snapshot is restored (to seed secure random generators).

The following Java class demonstrates how to implement a CRaC Resource to safely re-seed a secure random number generator upon SnapStart execution restore:

```java
package com.corporate.lambda;

import org.crac.Context;
import org.crac.Resource;
import org.crac.Core;
import java.security.SecureRandom;
import java.util.UUID;

public class HardenedHandler implements Resource {

    private static SecureRandom secureRandom;
    private static String runtimeInstanceId;

    static {
        // Run during standard static init phase (included in snapshot)
        secureRandom = new SecureRandom();
        runtimeInstanceId = UUID.randomUUID().toString();
        
        // Register this resource with the CRaC context
        Core.getGlobalContext().register(new HardenedHandler());
    }

    // Triggered automatically by AWS Lambda IMMEDIATELY before taking the snapshot
    @Override
    public void beforeCheckpoint(Context<? extends Resource> context) throws Exception {
        System.out.println("[CRaC] Snapshot checkpoint initiated. Evicting stale state...");
        // Clear sensitive random seeds before commit to snapshot disk
        secureRandom = null;
    }

    // Triggered automatically by AWS Lambda IMMEDIATELY upon microVM snapshot restoration
    @Override
    public void afterRestore(Context<? extends Resource> context) throws Exception {
        System.out.println("[CRaC] MicroVM restored from snapshot. Re-seeding random-number generator...");
        
        // Hardening: Explicitly generate a fresh secure random seed from the host kernel entropy source (/dev/urandom)
        secureRandom = new SecureRandom();
        
        // Rotate the execution VM instance identifier to ensure log tracking unique ID
        runtimeInstanceId = UUID.randomUUID().toString();
    }

    public String handleRequest() {
        if (secureRandom == null) {
            secureRandom = new SecureRandom(); // Fallback safety
        }
        
        // Generate cryptographic token guaranteed to be unique across cloned environments
        byte[] tokenBytes = new byte[32];
        secureRandom.nextBytes(tokenBytes);
        
        return String.format("InstanceID: %s | Secure Token Generated.", runtimeInstanceId);
    }
}
```

---

## Firecracker MicroVM Boot Configuration Details

When Firecracker launches a MicroVM, it reads a minimal JSON configuration block specifying exactly what physical resources are mapped to the virtual wrapper. Below is a sample Firecracker API configuration payload demonstrating how it maps vCPUs, memory, and boots a custom uncompressed Linux kernel with zero legacy driver assets:

```json
{
  "boot-source": {
    "kernel_image_path": "./vmlinux-minimal.bin",
    "boot_args": "console=ttyS0 reboot=k panic=1 pci=off nomodules"
  },
  "drives": [
    {
      "drive_id": "rootfs",
      "path_on_host": "./rootfs.ext4",
      "is_root_device": true,
      "is_read_only": false
    }
  ],
  "machine-config": {
    "vcpu_count": 1,
    "mem_size_mib": 256,
    "smt": false
  }
}
```

By passing `pci=off` and running without a BIOS (the kernel is loaded directly into the VM's memory region), Firecracker bypasses milliseconds of hardware discovery routines, establishing the foundation of fast-scaling cloud execution.
