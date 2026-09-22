# GCP Andromeda SDN: Kernel Bypass and Virtual Switch Packet Processing

## The Problem: The Interrupt Overhead of Legacy Linux Networking

In high-performance cloud environments, virtual machines must communicate across physical networks at extreme line rates (exceeding 100 Gbps). In legacy software-defined networking (SDN) models, virtual switches (such as standard Open vSwitch or Linux bridges) run natively inside the host hypervisor's Linux kernel space. 

This traditional packet processing path is highly inefficient:

1. **CPU Interrupt Storms:** Every incoming packet triggers a hardware interrupt. The host CPU must halt its current execution, perform a context switch to kernel mode, and run an interrupt service routine (ISR). At high packet-per-second (PPS) rates, this saturates the CPU, a phenomenon known as an "interrupt storm."
2. **Double Buffer Copying:** Packets must be copied from physical network interface card (NIC) buffers to kernel memory (sk_buff structures), and then copied *again* across the user-kernel boundary into the guest virtual machine's memory space.
3. **Cache Thrashing:** Frequent context switches between guest VM context, hypervisor kernel context, and interrupt handlers wipe out CPU L1/L2 data caches, crushing CPU efficiency and driving up packet latency and jitter.

---

## The Solution: GCP Andromeda Kernel Bypass

Google Cloud’s **Andromeda** is a proprietary, high-performance software-defined networking (SDN) platform. To achieve microsecond-level latency and near-physical line rate throughput, Andromeda relies on a mechanism called **Kernel Bypass**.

Andromeda bypasses the host's Linux kernel networking stack entirely. It operates a custom virtual switch in **user space** utilizing principles from the **Data Plane Development Kit (DPDK)**. Instead of relying on hardware interrupts, Andromeda employs **Poll Mode Drivers (PMD)**. These drivers occupy dedicated hypervisor CPU cores that continuously poll physical and virtual queue rings, immediately grabbing network frames as they arrive.

Furthermore, Andromeda leverages **Hoverboard**, an out-of-band distributed control plane coprocessor. When a VM attempts to transmit a packet to an unrouted destination, instead of the local host executing complex routing table lookups and security rule evaluations locally, the request is offloaded to a cluster of Hoverboard coprocessors. Hoverboard resolves the path and programs the host's fast-path flow table, allowing subsequent packets to bypass slow-path logic completely.

### Legacy Linux Stack vs. Andromeda Kernel Bypass

```
LEGACY LINUX KERNEL STACK               ANDromeda KERNEL BYPASS (DPDK)
+-------------------------------+       +-------------------------------+
|  Guest VM (User Space App)    |       |  Guest VM (User Space App)    |
+--------------|----------------+       +--------------|----------------+
               | System Call                           | Shared Memory
+--------------v----------------+       +--------------v----------------+
|  Linux Kernel (sk_buff copy)  |       |  VirtIO Shared Rings          |
+--------------|----------------+       +===============================+
               | Inter-process Context Switch          | Zero-Copy Direct Path
+--------------v----------------+       +--------------v----------------+
|  Host Kernel (vSwitch/Bridge) |       |  Andromeda User-Space Switch  |
|   - Multi-Interrupt overhead  |       |   - Poll-Mode Driver (PMD)    |
+--------------|----------------+       |   - Direct Ring Buffer Polling|
               | Hardware Interrupt     +--------------|----------------+
+--------------v----------------+       |  Physical NIC (SR-IOV/Falcon) |
|  Physical NIC (Device Driver) |       +-------------------------------+
+-------------------------------+
```

---

## Technical Architecture: User-Space Ring Buffer Processing

Under the hood, Andromeda manages data movement via lockless ring buffers shared between the physical NIC, the Andromeda virtual switch, and the guest VM. This enables zero-copy packet transmission: the virtual switch reads directly from the memory addresses where the physical NIC has written the incoming frames via DMA (Direct Memory Access).

Below is a production-grade, conceptual Rust implementation demonstrating the core mechanics of a user-space, lockless ring buffer processing loop using Poll Mode Driver (PMD) patterns.

### `andromeda_pmd.rs`

```rust
// andromeda_pmd.rs - Conceptual Poll-Mode Driver for Kernel Bypass
// This bypasses standard OS socket APIs using raw memory-mapped ring buffers.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;

const RING_SIZE: usize = 1024;
const PACKET_MAX_SIZE: usize = 1518; // Ethernet MTU + Frame Overhead

#[derive(Clone, Copy)]
pub struct RawPacket {
    pub length: usize,
    pub payload: [u8; PACKET_MAX_SIZE],
}

pub struct RingBuffer {
    buffer: Vec<RawPacket>,
    head: AtomicUsize,
    tail: AtomicUsize,
}

impl RingBuffer {
    pub fn new() -> Self {
        Self {
            buffer: vec![RawPacket { length: 0, payload: [0; PACKET_MAX_SIZE] }; RING_SIZE],
            head: AtomicUsize::new(0),
            tail: AtomicUsize::new(0),
        }
    }

    // Direct Memory Access (DMA) simulation: Physical NIC writes to the ring
    pub fn write_dma(&mut self, data: &[u8]) -> Result<(), &'static str> {
        let tail = self.tail.load(Ordering::Relaxed);
        let head = self.head.load(Ordering::Acquire);

        if (tail + 1) % RING_SIZE == head {
            return Err("Ring buffer full - Packet dropped at NIC interface");
        }

        let packet = &mut self.buffer[tail];
        packet.length = data.len().min(PACKET_MAX_SIZE);
        packet.payload[..packet.length].copy_from_slice(&data[..packet.length]);

        self.tail.store((tail + 1) % RING_SIZE, Ordering::Release);
        Ok(())
    }

    // Poll Mode Reader: Andromeda Switch fetches packet without sleeping
    pub fn poll_dequeue(&self) -> Option<RawPacket> {
        let head = self.head.load(Ordering::Relaxed);
        let tail = self.tail.load(Ordering::Acquire);

        if head == tail {
            return None; // No packets available, continue polling
        }

        let packet = self.buffer[head];
        self.head.store((head + 1) % RING_SIZE, Ordering::Release);
        Some(packet)
    }
}

// PMD processing core thread loop running in user-space
pub fn run_andromeda_pmd_loop(rx_ring: &RingBuffer) -> ! {
    let mut processed_packets: u64 = 0;
    let mut last_report = Instant::now();

    println!("Andromeda PMD loop started on CPU core 1. Polling mode active...");

    loop {
        // CONTINUOUS ACTIVE POLL: Bypasses standard OS sleep/epoll wait
        if let Some(packet) = rx_ring.poll_dequeue() {
            process_and_route_packet(packet);
            processed_packets += 1;
        }

        // Periodically report performance metrics without interrupting hot path
        if last_report.elapsed().as_secs() >= 5 {
            let pps = processed_packets / 5;
            println!("Andromeda Core Throughput Metrics: {} packets/sec (Zero Interrupts)", pps);
            processed_packets = 0;
            last_report = Instant::now();
        }
    }
}

fn process_and_route_packet(packet: RawPacket) {
    // Perform virtual routing, apply security group policy hashes, and DMA to guest VM
    let _dest_ip = &packet.payload[12..16]; // Conceptual IPv4 header slice
}
```

Through this architecture, Andromeda achieves network latency profiles that approach those of bare metal hardware. It turns virtual network routing from a high-overhead OS context switcher into an ultra-fast memory bus operation, paving the way for high-throughput cloud workloads.
