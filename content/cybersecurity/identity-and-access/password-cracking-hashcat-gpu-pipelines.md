---
title: "Password Cracking Internals: How Hashcat Exploits GPU Pipelines Against MD5/SHA-1"
description: "A deep dive into why GPU-accelerated tools like Hashcat can compute over 100 billion MD5 hashes per second, why memory-hard algorithms neutralize that advantage, and how to reason about cracking speed when choosing a hashing scheme."
categorySlug: "identity-access"
articleType: "DEEP_DIVE"
tags:
  - "password-cracking"
  - "hashcat"
  - "gpu-security"
  - "md5"
  - "sha-1"
  - "memory-hard-functions"
---

# Password Cracking Internals: How Hashcat Exploits GPU Pipelines Against MD5/SHA-1

## The Problem: The Illusion of Hash Security

For decades, developers relied on cryptographic hash functions like MD5 and SHA-1 to store passwords. The logic seemed sound: hash functions are one-way, so you cannot mathematically reverse a hash back to its plaintext.

```text
Plaintext: "password123"
MD5 Hash:  482c811da5d5b4bc6d497ffa98491e38
```

If an attacker steals the hash database, they cannot decrypt the hashes — but they *can* guess them. The attacker takes a large dictionary of common passwords, hashes every one of them with MD5, and compares the results against the stolen database: an offline brute-force or dictionary attack.

Historically, CPUs performed a few million hashes per second, so a complex password might take years to crack. Today, with tools like Hashcat running on consumer GPUs, attackers compute *tens of billions* of hashes per second — enough to make fast, unsalted, memory-light hash functions effectively worthless for password storage.

## The Mental Model: The CPU Generalist vs. the GPU Factory

To understand why MD5 and SHA-1 are fundamentally broken as password hashes, look at the hardware executing the attack:

- **The CPU is a brilliant generalist.** A few very powerful cores (8–16) designed for complex branching logic, context switching, and sequential execution — an executive making complex decisions.
- **The GPU is a massive factory floor.** Thousands of relatively weak cores (an RTX 4090 has over 16,000 CUDA cores) designed to run the exact same simple operation across thousands of pieces of data simultaneously — Single Instruction, Multiple Data (SIMD).

```text
                     CPU ARCHITECTURE                          GPU ARCHITECTURE (SIMD)
              +------------------------+           +-------------------------------------------+
              | Core 1 -> Complex Task |           | Instruction: "Calculate MD5"                |
              |          -> Done       |           |    |--> Core 1     -> word 1     -> Hash 1   |
              | Core 2 -> Complex Task |           |    |--> Core 2     -> word 2     -> Hash 2   |
              |          -> Done       |           |    |--> Core ...16000 -> word N -> Hash N   |
              +------------------------+           +-------------------------------------------+
              A handful of powerful,               Thousands of simple cores executing the
              flexible cores                       same instruction on massive parallel data
```

Password hashing is not complex branching logic — it is pure, repetitive arithmetic. It maps perfectly onto the GPU factory floor.

## Deep Dive: Inside the Hashcat Pipeline

Hashcat is the fastest password recovery tool available because it is explicitly engineered to exploit the GPU's SIMD architecture via OpenCL or CUDA. Three techniques explain why it shatters fast algorithms like MD5 and SHA-1:

### 1. Minimizing Host-to-Device Bottlenecks

The slowest part of GPU computing is transferring data from main RAM across the PCIe bus into the GPU's VRAM. Hashcat avoids this: instead of sending individual password guesses to the GPU, it sends a compact rule set and a base dictionary. Thousands of GPU cores independently generate password mutations (appending digits, flipping case) directly inside VRAM, bypassing the PCIe bottleneck entirely.

### 2. Instruction-Level Parallelism (ILP) and Loop Unrolling

MD5 runs 64 operations across four rounds. Hashcat's GPU kernels are written in low-level, highly optimized code that **unrolls** those 64 steps explicitly instead of using a `for` loop — a loop forces the GPU to spend cycles checking a termination condition on every iteration. Unrolled code feeds the GPU's pipeline continuously with no branching delays.

### 3. Register Optimization

GPUs have a small amount of ultra-fast on-chip memory called registers. If a calculation needs more space than the registers hold, the GPU "spills" data into slower global VRAM, crushing throughput. MD5 and SHA-1 need only a few 32-bit variables of internal state, so Hashcat's kernels keep the entire algorithm state inside registers — no spilling, maximum throughput.

## The Result: Billions of Hashes Per Second

Because MD5 and SHA-1 need no meaningful memory (no VRAM spilling) and consist of simple bitwise operations (AND, OR, XOR, rotations) that GPUs excel at, throughput is staggering: a single modern consumer GPU can compute over **100 billion MD5 hashes per second**. At that rate, an 8-character password mixing upper/lowercase, digits, and symbols (roughly 6 trillion combinations) can be brute-forced in under a minute.

## The Defense: Memory Hardness (Argon2, bcrypt, scrypt)

To defend against a GPU factory line, you need an algorithm that breaks the GPU's core advantage: massive parallelism over tiny, fast memory. Algorithms like **Argon2** and **bcrypt** achieve this through *memory hardness* — they require the hardware to allocate a significant amount of RAM (e.g. 64 MB) and perform random reads/writes to it during hashing.

A GPU has only a few gigabytes of VRAM shared across 16,000+ cores, so it cannot run thousands of Argon2 instances concurrently — it runs out of memory almost immediately. The factory floor shuts down, neutralizing the attacker's hardware advantage and keeping password cracking economically infeasible at scale.

**Practical takeaway**: if you are choosing (or auditing) a password hashing scheme, "how many hashes per second can a single GPU compute against it" is the right question to ask — and for MD5/SHA-1/unsalted-SHA-256 the honest answer is "billions," which is why none of them belong in a password store.
