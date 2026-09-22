# AWS Nitro System: Decoupling Virtualization Overhead onto Dedicated Hardware Cards

## The Problem: The Hypervisor Tax in Legacy Virtualization

In traditional Type-1 hypervisor architectures (such as legacy Xen or standard KVM on x86 servers), the hypervisor does far more than just slice CPU and memory. It is responsible for the entire management plane: network packet processing, local and remote storage encapsulation, security auditing, and system monitoring. 

This model introduces a significant "hypervisor tax." Up to 30% of the physical host's CPU cycles and RAM are consumed by the hypervisor to manage virtual machines (VMs). For compute-heavy or high-throughput network applications, this host-level resource contention leads to:

1. **Jitter & Latency Spikes:** The hypervisor steal-time (the time a virtual CPU waits for real CPU resources) increases as hypervisor management threads compete with guest workloads.
2. **Reduced Workload Density:** Fewer compute resources are available to the actual guest VMs, lowering overall efficiency.
3. **Expanded Attack Surface:** If an attacker compromises the monolithic hypervisor, they gain access to the networks, storage, and keys of all tenant VMs sharing that physical chassis.

---

## The Solution: AWS Nitro Architecture

The AWS Nitro System eliminates the hypervisor tax by decoupling the virtualization plane. It shifts virtually all non-compute tasks—networking, storage, security, and management—off the physical host CPU and onto custom-designed, dedicated PCIe hardware cards (Nitro Cards) equipped with custom ASICs and ARM system-on-chips (SoCs).

As a result, the physical host's CPU and RAM are dedicated almost 100% to customer workloads. The hypervisor itself is stripped down to an extremely lightweight, KVM-based engine (the **Nitro Hypervisor**) that only manages memory allocation and CPU scheduling, with zero involvement in the I/O path.

### Legacy Hypervisor vs. AWS Nitro Architecture

```
LEGACY HYPERVISOR (Xen/KVM)           AWS NITRO ARCHITECTURE
+-----------------------------------+   +-----------------------------------+
| Guest VM  | Guest VM  | Guest VM  |   | Guest VM  | Guest VM  | Guest VM  |
+-----------------------------------+   +-----------------------------------+
| Hypervisor Plane (OS / KVM / Xen) |   | Minimal Nitro Hypervisor (CPU/Mem)|
|  - Network Packet Routing         |   +===================================+
|  - EBS NVMe Virtualization        |             PCIe Bus (SR-IOV)
|  - Cryptographic Encryption       |   +===================================+
|  - System Management & Telemetry  |   | Dedicated Nitro Hardware Cards    |
+-----------------------------------+   |  - Nitro Card for VPC (Network)   |
|          Physical Hardware        |   |  - Nitro Card for EBS (Storage)   |
+-----------------------------------+   |  - Nitro Security Chip (Root)     |
                                        +-----------------------------------+
                                        |          Physical Hardware        |
                                        +-----------------------------------+
```

---

## Under the Hood: Nitro Hardware Components

The Nitro System is composed of several discrete hardware components connected to the main system board via the PCIe bus:

1. **Nitro Card for VPC:** Runs on a custom-designed ASIC that implements AWS's software-defined network (VPC). It handles encapsulation (e.g., Geneve/ENA protocols), routing, security groups, and traffic limiting directly on the card, bypassing the host CPU entirely.
2. **Nitro Card for EBS:** Virtualizes remote Amazon EBS storage blocks as local PCIe NVMe storage controllers. It translates NVMe command queues directly into remote network calls to the EBS SAN, performing hardware-accelerated AES-256 encryption at the wire-rate.
3. **Nitro Card for Instance Storage:** Manages local solid-state drives (SSDs). It virtualizes these drives as NVMe controllers and performs hardware-level encryption with ephemeral keys that are destroyed upon instance termination.
4. **Nitro Security Chip:** A hardware root of trust integrated into the motherboard. It continuously monitors and validates all system firmware (BIOS, BMC, and Nitro Card microcode), preventing write access to flash memory and ensuring a secure boot chain.

### Single-Root I/O Virtualization (SR-IOV)
Rather than standard hypervisors intercepting I/O commands and emulating devices, Nitro utilizes **SR-IOV**. The guest VM sees actual physical PCIe Virtual Functions (VFs) mapped directly to physical Nitro Cards. When the guest VM issues a disk write or network send, the command bypasses the Nitro Hypervisor entirely, executing directly on the Nitro card's silicon at hardware speeds.

---

## Technical Configuration: Configuring Nitro Enclaves

One of Nitro's advanced capabilities is **Nitro Enclaves**, which lets users carve out isolated execution environments from an existing EC2 instance to process sensitive data. There is no external network access, persistent storage, or interactive user login (SSH) inside an Enclave. The only way to communicate with it is via a local virtual socket (`vsock`).

To use Nitro Enclaves on a Linux host, you must configure the Nitro Enclaves allocator service to reserve dedicated CPUs and memory for the enclave.

### `/etc/nitro_enclaves/allocator.yaml`

Below is a production-grade configuration that reserves 2 vCPUs and 2048 MB of RAM from the host EC2 instance for Enclave allocation:

```yaml
# /etc/nitro_enclaves/allocator.yaml
# Production allocator configuration for AWS Nitro Enclaves.
# This configuration isolates resources from the parent EC2 instance.

# Set the memory allocation in MiB.
memory_mib: 2048

# Define the CPUs to be dedicated exclusively to the Enclave.
# These CPUs must be complementary threads of the same physical core 
# to mitigate side-channel exploitation (such as L1 Terminal Fault).
cpu_pool: [2, 3]

# Optional metadata logging configurations
metadata:
  log_level: "info"
  syslog: true
```

After modifying the configuration, reload the system daemon to bind the physical resources to the Nitro driver:

```bash
# Apply allocator settings and restart the enclave manager
sudo systemctl daemon-reload
sudo systemctl restart nitro-enclaves-allocator.service

# Verify the dedicated resources are isolated
nitro-cli describe-enclaves
```

By leveraging this architecture, the Nitro Enclave runs with virtual hardware-level isolation, shielding the runtime memory from even the root user of the parent EC2 host. This represents the pinnacle of hardware-enforced multi-tenant isolation in modern cloud infrastructure.
