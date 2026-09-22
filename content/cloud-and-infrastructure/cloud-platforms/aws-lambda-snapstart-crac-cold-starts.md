---
title: "AWS Lambda SnapStart: Eliminating JVM Cold Starts with CRaC Snapshots"
description: "Why Firecracker alone can't fix slow Java cold starts, how AWS SnapStart uses Coordinated Restore at Checkpoint (CRaC) to snapshot a warmed-up microVM, and how to safely handle stale sockets and random seeds across snapshot restores."
categorySlug: "cloud-platforms"
articleType: "DEEP_DIVE"
tags:
  - "aws-lambda"
  - "snapstart"
  - "firecracker"
  - "crac"
  - "cold-start"
  - "java"
---

# AWS Lambda Internals: Firecracker MicroVMs, Cold Starts, and SnapStart

## The Problem: The Latency Penalty of Serverless Cold Starts

In serverless execution environments, applications scale down to zero when idle to conserve costs. When a new invocation arrives, the platform must provision a new execution environment from scratch. This process is known as a **cold start**.

A standard cold start involves three high-latency execution phases:
1. **Provisioning (VMM):** Downloading the deployment archive (ZIP or container image) and launching the underlying virtual machine.
2. **Initialization (Runtime Init):** Bootstrapping the runtime process (e.g., JVM, Node.js runtime, Python engine) and running the application's global initialization code (static blocks, database connection pools, class loading).
3. **Application Init (Execution):** Executing the specific Lambda handler logic.

For heavy, class-loaded runtimes such as Java, the **Initialization** phase can take up to several seconds. This latency penalty is unacceptable for low-latency synchronous APIs or microservices — Firecracker's sub-5-millisecond microVM boot is not the bottleneck here; JVM class loading is.

---

## The Solution: Firecracker MicroVMs and AWS SnapStart

### 1. Firecracker: High-Density, Fast-Booting MicroVMs

Firecracker is an open-source Virtual Machine Monitor (VMM) written in Rust. It utilizes the Linux Kernel-based Virtual Machine (KVM) to create secure, hardware-isolated microVMs.

Unlike traditional emulators like QEMU, Firecracker strips out all legacy devices (such as PCI buses, floppy controllers, and ACPI) and only emulates a minimal set of devices: `virtio-net`, `virtio-block`, `virtio-vsock`, and a serial console. As a result, a Firecracker microVM can boot in **under 5 milliseconds** and runs with a memory footprint of less than 5 MB, allowing thousands of isolated environments to coexist on a single bare-metal host.

### 2. AWS SnapStart: Coordinated Restore at Checkpoint (CRaC)

While Firecracker solves the virtualization boot bottleneck, it cannot bypass the language runtime initialization penalty (e.g., compiling JVM bytecode, loading classes). AWS SnapStart solves this for Java runtimes by leveraging the **Coordinated Restore at Checkpoint (CRaC)** framework.

When you publish a new version of a Lambda function with SnapStart enabled:
* AWS spins up the function inside a Firecracker microVM.
* It executes the complete `Init` phase, running static blocks and warm-up cycles.
* It pauses the VM and takes a **cryptographic snapshot** of the exact memory state and disk state.
* The snapshot is encrypted and cached in a highly optimized cache layer.

Upon a subsequent cold-start invocation, instead of going through VM boot, JVM startup, and class loading, AWS restores the microVM's memory state directly from the cached snapshot. This drops cold-start latencies from seconds to under 200 milliseconds.

### Standard Cold Start vs. SnapStart Restore

```text
TRADITIONAL COLD START (High Latency)
[ VM Boot: 5ms ] ===> [ Download Code: 150ms ] ===> [ JVM Boot & Class Loading: 4-8s ] ===> [ Invoke Handler: 10ms ]

SNAPSTART RESTORE (Ultra-Low Latency)
+--------------------------------------------+
| Cached Encrypted MicroVM Memory Snapshot   |
+---------------------+----------------------+
                      | Direct Memory Restore (DMA)
                      v
[ Resume MicroVM State: 120ms ] ===> [ CRaC afterRestore Hook: 15ms ] ===> [ Invoke Handler: 10ms ]
```

---

## Technical Implementation: Handling Snapshot State in Java (CRaC)

While SnapStart eliminates cold starts, it introduces a major software engineering hazard: **state serialization**.

Because the VM memory is snapshotted once and restored multiple times, unique values (such as cryptographically secure random numbers/UUIDs) or TCP network connections (such as database sockets) can become stale or compromised. Sockets will be closed by the database server due to inactivity, and random number generators will produce identical outputs across distinct resumed VMs unless they are re-seeded.

To mitigate this, you must implement the `org.crac.Resource` interface to close and regenerate state boundaries safely.

### `DbHandlerWithSnapStart.java`

```java
package com.security.lambda;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import org.crac.Core;
import org.crac.Resource;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.UUID;

public class DbHandlerWithSnapStart implements RequestHandler<Object, String>, Resource {

    private Connection dbConnection;
    private SecureRandom secureRandom;

    public DbHandlerWithSnapStart() {
        // Register this class as a CRaC Resource during JVM static initialization
        Core.getGlobalContext().register(this);
        initializeResources();
    }

    private void initializeResources() {
        try {
            // Warm up cryptographic entropy and DB connection
            this.secureRandom = new SecureRandom();
            this.dbConnection = DriverManager.getConnection("jdbc:postgresql://db.corp.internal/main", "user", "pass");
        } catch (Exception e) {
            throw new RuntimeException("Init failed", e);
        }
    }

    @Override
    public String handleRequest(Object input, Context context) {
        // Safe, unique execution across all restored instances
        String executionId = UUID.nameUUIDFromBytes(secureRandom.generateSeed(16)).toString();
        return "Executed safely with ID: " + executionId;
    }

    // CRaC Hook: Triggered IMMEDIATELY BEFORE AWS takes the memory snapshot
    @Override
    public void beforeCheckpoint(org.crac.Context<? extends Resource> context) throws Exception {
        System.out.println("CRaC checkpoint initiated. Terminating open database sockets...");
        if (dbConnection != null && !dbConnection.isClosed()) {
            dbConnection.close(); // Close network sockets to prevent socket leak errors on restore
        }
    }

    // CRaC Hook: Triggered IMMEDIATELY AFTER AWS restores the VM memory state
    @Override
    public void afterRestore(org.crac.Context<? extends Resource> context) throws Exception {
        System.out.println("CRaC VM restored from memory snapshot. Re-establishing connection and re-seeding entropy...");
        // 1. Re-establish db connections
        this.dbConnection = DriverManager.getConnection("jdbc:postgresql://db.corp.internal/main", "user", "pass");
        // 2. Re-seed secure random to prevent identical UUID generation across duplicate VM clones
        this.secureRandom.setSeed(this.secureRandom.generateSeed(16));
    }
}
```

The `beforeCheckpoint` hook fires immediately before the snapshot is taken — this is where you must close anything stateful (sockets, file handles, timers) that would otherwise be frozen in a half-open state. The `afterRestore` hook fires on every single restore from that snapshot, potentially thousands of times across thousands of concurrent execution environments — this is where you re-establish connections and re-seed any randomness so that restored clones don't all produce identical outputs.

---

## Infrastructure Configuration: Enabling SnapStart

To activate SnapStart on your Lambda function via Infrastructure as Code, specify the `snap_start` block inside your resource configuration:

```hcl
# Lambda resource declaration with SnapStart enabled
resource "aws_lambda_function" "snapstart_lambda" {
  filename      = "lambda_function.zip"
  function_name = "DbHandlerWithSnapStart"
  role          = aws_iam_role.lambda_role.arn
  handler       = "com.security.lambda.DbHandlerWithSnapStart::handleRequest"
  runtime       = "java17"

  # SnapStart requires published versions to capture VM snapshots
  publish = true

  snap_start {
    apply_on = "PublishedVersions"
  }
}
```

By coupling Firecracker's raw isolation speed with SnapStart's coordinated memory snapshot restoration, serverless architectures can scale dynamically to handle massive spike loads while maintaining rigid runtime security and single-digit millisecond VM boot times.

---

## Key Takeaways

* **Firecracker solves VM boot latency; SnapStart solves runtime/class-loading latency** — they address two different phases of the cold-start problem, and for Java, both matter.
* **A CRaC snapshot freezes live process memory**, including open sockets and seeded RNGs — anything stateful must be torn down in `beforeCheckpoint` and rebuilt in `afterRestore`.
* **`afterRestore` may run many times from the same snapshot** across many concurrent execution environments, so treat it like a fresh cold-start init, not a one-time hook.
* **SnapStart requires published function versions** (`publish = true`), not the `$LATEST` alias, because the snapshot is tied to an immutable code version.
