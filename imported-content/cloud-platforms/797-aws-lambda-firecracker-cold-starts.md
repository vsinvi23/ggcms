# AWS Lambda Internals: Firecracker MicroVMs, Cold Starts, and SnapStart

## The Problem: The Latency Penalty of Serverless Cold Starts

In serverless execution environments, applications scale down to zero when idle to conserve costs. When a new invocation arrives, the platform must provision a new execution environment from scratch. This process is known as a **cold start**.

A standard cold start involves three high-latency execution phases:
1. **Provisioning (VMM):** Downloading the deployment archive (ZIP or container image) and launching the underlying virtual machine.
2. **Initialization (Runtime Init):** Bootstrapping the runtime process (e.g., JVM, Node.js runtime, Python engine) and running the application’s global initialization code (static blocks, database connection pools, class loading).
3. **Application Init (Execution):** Executing the specific lambda handler logic.

For heavy, class-loaded runtimes such as Java, the **Initialization** phase can take up to 10 seconds. This latency penalty is unacceptable for low-latency synchronous APIs or microservices.

---

## The Solution: Firecracker MicroVMs and AWS SnapStart

To make serverless execution safe, fast, and multi-tenant at AWS scale, AWS engineers built **Firecracker** and **AWS SnapStart**.

### 1. Firecracker: High-Density, Fast-Booting MicroVMs
Firecracker is an open-source Virtual Machine Monitor (VMM) written in Rust. It utilizes the Linux Kernel-based Virtual Machine (KVM) to create secure, hardware-isolated microVMs. 

Unlike traditional emulators like QEMU, Firecracker strips out all legacy devices (such as PCI buses, floppy controllers, and ACPI) and only emulates a minimal set of devices: virtio-net, virtio-block, virtio-vsock, and a serial console. As a result, a Firecracker MicroVM can boot in **under 5 milliseconds** and runs with a memory footprint of less than 5 MB, allowing thousands of isolated environments to coexist on a single bare-metal host.

### 2. AWS SnapStart: Coordinated Restore at Checkpoint (CRaC)
While Firecracker solves the virtualization boot bottleneck, it cannot bypass the language runtime initialization penalty (e.g., compiling JVM bytecodes). AWS SnapStart solves this for Java runtimes by leveraging the **Coordinated Restore at Checkpoint (CRaC)** framework.

When you publish a new version of a Lambda function with SnapStart enabled:
* AWS spins up the function inside a Firecracker MicroVM.
* It executes the complete `Init` phase, executing static blocks and warm-up cycles.
* It pauses the VM and takes a **cryptographic snapshot** of the exact memory state and disk state.
* The snapshot is encrypted and cached in a highly optimized cache layer.

Upon a subsequent cold start invocation, instead of going through VM boot, JVM startup, and class loading, AWS restores the MicroVM's memory state directly from the cached snapshot. This drops cold-start latencies from seconds to under 200 milliseconds.

### Standard Cold Start vs. SnapStart Restore

```
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

While SnapStart eliminates cold starts, it introduces a major software engineering hazard: **State Serialization**. 

Because the VM memory is snapshotted once and restored multiple times, unique values (such as cryptographically secure random numbers/UUIDs) or TCP network connections (such as database sockets) can become stale or compromised. Sockets will be closed by the database server due to inactivity, and random number generators will produce identical outputs across distinct resumed VMs.

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
            dbConnection.close(); # Close network sockets to prevent socket leak errors on restore
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
