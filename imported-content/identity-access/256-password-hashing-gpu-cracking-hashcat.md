# Password Cracking: How Hashcat Leverages GPU Pipelines to Break MD5 and SHA-1

## The Problem: The Illusion of Hash Security

For decades, developers relied on cryptographic hash functions like MD5 and SHA-1 to store passwords. The logic was straightforward: hash functions are one-way mathematical operations. You cannot reverse a hash back to the plaintext password.

```text
Plaintext: "password123"
MD5 Hash:  482c811da5d5b4bc6d497ffa98491e38
```

If an attacker breaches the database and steals the hashes, they cannot mathematically decrypt them. However, they *can* guess them. 

The attacker takes a massive dictionary of common passwords, hashes every single one of them using MD5, and compares the resulting hashes to the stolen database. This is an offline brute-force or dictionary attack.

Historically, CPUs could perform a few million hashes per second. A complex password might take years to crack. Today, using specialized software like Hashcat running on modern Graphics Processing Units (GPUs), attackers can compute *tens of billions* of hashes per second. 

## The Mental Model: The CPU Generalist vs. The GPU Factory

To understand why MD5 and SHA-1 are fundamentally broken, we must understand the hardware executing the attack.

*   **The CPU (Central Processing Unit) is a brilliant generalist.** It has a few very powerful cores (e.g., 8 to 16). It is designed to handle complex, branching logic, context switching, and executing sequential tasks rapidly. It's an executive making complex decisions.
*   **The GPU (Graphics Processing Unit) is a massive factory floor.** It has thousands of relatively weak cores (e.g., an NVIDIA RTX 4090 has over 16,000 CUDA cores). It is designed to perform the exact same simple mathematical operation on thousands of different pieces of data simultaneously (SIMD - Single Instruction, Multiple Data).

```mermaid
graph TD
    subgraph CPU Architecture
        A[Core 1] -->|Complex Task| B(Done)
        C[Core 2] -->|Complex Task| D(Done)
    end
    
    subgraph GPU Architecture (SIMD)
        E[Instruction: Calculate MD5] --> F[Core 1: word1]
        E --> G[Core 2: word2]
        E --> H[Core ...16000: word16000]
        F --> I[Hash 1]
        G --> J[Hash 2]
        H --> K[Hash 16000]
    end
```

Password hashing is not complex logic; it is pure, repetitive mathematics. It maps perfectly to the GPU factory floor.

## Deep Dive: Inside the Hashcat Pipeline

Hashcat is the world's fastest password recovery tool because it is explicitly engineered to exploit the GPU's SIMD architecture via OpenCL or CUDA. 

Here is how Hashcat shatters fast algorithms like MD5 and SHA-1:

### 1. Minimizing Host-to-Device Bottlenecks

The slowest part of GPU computing is transferring data from the computer's main memory (RAM) across the PCIe bus to the GPU's memory (VRAM). 

Hashcat minimizes this. It doesn't send individual passwords to the GPU. Instead, it sends a set of rules and a base dictionary. The GPU's thousands of cores independently generate the password mutations (appending numbers, flipping cases) directly in VRAM, bypassing the PCIe bottleneck entirely.

### 2. Instruction Level Parallelism (ILP) and Loop Unrolling

MD5 consists of 64 operations grouped into four rounds. Hashcat developers write the kernel code (the code that runs on the GPU) in low-level assembly or highly optimized C. 

They use a technique called "loop unrolling." Instead of using a `for` loop (which requires the GPU to waste cycles checking if the loop is finished), they write out all 64 steps sequentially. This feeds the GPU's pipeline continuously without branching delays.

### 3. Register Optimization

GPUs have a small amount of ultra-fast memory called registers. If a calculation requires more memory than the registers hold, the GPU "spills" the data into slower global VRAM, crushing performance. 

Hashcat's MD5 and SHA-1 implementations are meticulously optimized to keep the entire state of the hashing algorithm within the GPU registers. Because MD5 and SHA-1 have very small memory footprints (MD5 only needs a few 32-bit variables for its internal state), they fit perfectly into these ultra-fast registers.

## The Result: Billions of Hashes Per Second

Because MD5 and SHA-1 require no significant memory (no VRAM spilling) and consist of simple bitwise operations (AND, OR, XOR, rotations) that GPUs excel at, the throughput is staggering.

A single modern consumer GPU can compute over **100 Billion MD5 hashes per second**. At this speed, an 8-character password containing upper case, lower case, numbers, and symbols (approx. 6 trillion combinations) can be brute-forced in *under a minute*.

## The Defense: Memory Hardness (Argon2, bcrypt, scrypt)

To defend against GPU factory lines, security engineers must use algorithms that break the GPU's advantage. 

Modern algorithms like **bcrypt** and **Argon2** achieve this through *memory hardness*. 
They require the hardware to allocate a significant amount of RAM (e.g., 64MB) and perform random reads/writes to that memory while hashing.

Because a GPU only has a few gigabytes of VRAM shared among 16,000 cores, it cannot run thousands of Argon2 instances in parallel. If it tries, it runs out of memory instantly. The factory floor shuts down, neutralizing the attacker's hardware advantage and securing the passwords.