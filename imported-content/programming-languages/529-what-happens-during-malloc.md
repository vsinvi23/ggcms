# What Really Happens During malloc()? Free Lists, Allocators, and System Calls

To most developers, calling `malloc(size)` is a black-box operation: you ask for bytes, and a pointer to memory magically returns. But under the hood, `malloc` is not a magic wand—it is a sophisticated user-space memory management library (such as `dlmalloc`, `ptmalloc` in glibc, or `jemalloc`) that sits between your application and the operating system kernel. Its job is to minimize slow system calls and combat heap fragmentation.

---

## The Allocator-to-Kernel Hierarchy

When your program requests dynamic memory, it goes through a multi-tier allocation pipeline:

```
+-------------------------------------------------------------+
|                     Application Code                        |
+-------------------------------------------------------------+
                               |
                               |  1. malloc(128)
                               v
+-------------------------------------------------------------+
|              User-Space Allocator (glibc ptmalloc)           |
|  - Inspects "Free Lists" (fastbins, unsorted bins, etc.)    |
|  - If a free chunk of 128 bytes exists, returns it instantly|
+-------------------------------------------------------------+
                               |
                               |  2. If Free Lists are empty:
                               v  Request memory from Kernel
+-------------------------------------------------------------+
|                      Operating System Kernel                |
|                                                             |
|  [ Small Allocations (<128KB) ]   [ Large Allocations (>128KB)]
|  -> brk() / sbrk() syscall        -> mmap() syscall         |
|  -> Moves program break up        -> Maps anonymous page    |
+-------------------------------------------------------------+
```

---

## Tier 1: The User-Space Allocator (Traffic Control)

Calling the operating system kernel on every single allocation is prohibitively expensive. A system call requires a CPU context switch from User Mode to Kernel Mode, which flushes processor caches and takes hundreds of clock cycles. 

To solve this, the allocator requests large blocks of memory (typically 128KB or more) from the OS kernel in advance, and then manages that memory in user space.

### Chunk Metadata (The Hidden Header)
When you call `ptr = malloc(32)`, the allocator actually reserves more than 32 bytes (typically 40 or 48 bytes). It uses the first 8 or 16 bytes to store **metadata** about the chunk, and then returns a pointer to the memory *immediately following* this metadata.

```
Returned Pointer
      |
      v
+------------------+----------------------------------+
|  Chunk Header    |      Payload (User Space)        |
|  - Size: 40 bytes|                                  |
|  - In-Use Flag   |  Uninitialized data...           |
+------------------+----------------------------------+
|<-  8-16 bytes  ->|<-           32 bytes           ->|
```

The header contains:
* The actual size of the chunk (aligned to 8 or 16 bytes).
* Status flags (whether the chunk is in use or free, and whether it was allocated via `mmap`).

### Free Lists (Bins)
When you call `free(ptr)`, the allocator does **not** return the memory to the OS. Doing so would be inefficient. Instead, it marks the chunk as "free" in its header and adds the chunk to a linked list of free memory, known as a **Bin**.
* **Fastbins:** Singly-linked, LIFO (Last-In, First-Out) lists for very small chunks. Allocations here bypass merging to remain lightning-fast.
* **Unsorted Bins:** A staging ground where freed chunks are temporarily placed before being sorted into appropriately-sized bins.
* **Small/Large Bins:** Doubly-linked lists categorized by size, allowing the allocator to find the best fit for incoming requests.

---

## Tier 2: System Calls (Kernel Interaction)

If the allocator's free lists are empty, it must request more virtual address space from the OS Kernel. It chooses between two primary system calls based on the size of the request:

### 1. `brk()` / `sbrk()` (For Small Chunks)
The system heap is bounded by a boundary marker called the **Program Break**. 
* The `brk` system call moves this break line up or down.
* Moving the break up expands the heap, providing more contiguous address space for the allocator.
* This is incredibly fast, but can lead to severe fragmentation if a single allocated chunk at the top of the heap prevents the break from moving back down, trapping freed chunks below it.

### 2. `mmap()` (For Large Chunks)
For large allocations (typically greater than 128KB or 256KB), the allocator bypasses the standard heap entirely.
* It uses the `mmap` system call to request a completely separate, dedicated block of virtual memory pages from the kernel.
* When you call `free()` on an `mmap`'ed block, the memory is immediately unmapped and returned to the OS via the `munmap` system call, freeing physical resources instantly.

---

## The Virtual Memory Illusion (Lazy Allocation)

A fascinating aspect of `malloc` is that **it does not actually allocate physical RAM**. When `malloc` succeeds, the OS has only updated the process’s virtual memory allocation tables. It has promised you the memory, but has not assigned physical hardware to back it up.

This is known as **Lazy Allocation**:
1. You call `ptr = malloc(1024 * 1024)` (1MB).
2. The allocator returns a virtual address.
3. If you inspect the system's physical RAM usage, it has not changed.
4. When you write to the memory: `ptr[0] = 42;`
5. The CPU attempts to write to a virtual address that has no physical backing.
6. The CPU hardware triggers a **Page Fault** exception and hands control to the OS Kernel.
7. The OS Kernel handles the exception, allocates a physical 4KB frame of RAM, maps it to your virtual address, and seamlessly resumes your program.

---

## Low-Level C Probe: Reading the Hidden Header

The following C program allocates memory and then deliberately performs "pointer subtraction" to read the raw memory bytes immediately preceding the returned pointer, exposing the internal glibc chunk header size metadata.

```c
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>

int main() {
    printf("=== Inspecting glibc Malloc Headers ===\n\n");

    // 1. Allocate 32 bytes on the heap
    size_t requested_size = 32;
    char *ptr = (char*)malloc(requested_size);
    if (ptr == NULL) {
        perror("Allocation failed");
        return 1;
    }

    printf("Requested %zu bytes of memory.\n", requested_size);
    printf("Returned address (User payload starts here): %p\n", (void*)ptr);

    // 2. Back up by one 64-bit word (8 bytes on 64-bit systems)
    // to point directly to the chunk header.
    uint64_t *header_ptr = (uint64_t*)(ptr - 8);
    printf("Metadata Header address (8 bytes before ptr): %p\n", (void*)header_ptr);

    // 3. Read the header value
    uint64_t raw_header = *header_ptr;
    printf("Raw Header Value: 0x%lX (Decimal: %lu)\n\n", raw_header, raw_header);

    // 4. Decode the header fields
    // Under glibc, the last 3 bits of the header are status flags:
    // Bit 0: A_FLAG (NON_MAIN_ARENA - allocated on non-main thread arena)
    // Bit 1: M_FLAG (IS_MMAPPED - allocated via mmap syscall)
    // Bit 2: P_FLAG (PREV_INUSE - physical block immediately preceding this is in use)
    uint64_t chunk_size = raw_header & ~0x07; // Mask out the flag bits to get actual size
    int prev_inuse = raw_header & 0x01;
    int is_mmapped = (raw_header & 0x02) >> 1;

    printf("=== Decoded Metadata ===\n");
    printf("Actual Chunk Size (aligned + overhead): %lu bytes\n", chunk_size);
    printf("Flag [PREV_INUSE]:                      %d\n", prev_inuse);
    printf("Flag [IS_MMAPPED]:                      %d\n", is_mmapped);

    // Free the memory
    free(ptr);
    return 0;
}
```

### Analysis of the Output:
If you compile and run this code on Linux x86_64, you will see that a request for 32 bytes yields an actual chunk size of **48 bytes** (0x30). This is because glibc aligns allocations to 16 bytes and adds 8 bytes for header metadata, plus 8 bytes of padding to maintain alignment. You will also see the `PREV_INUSE` flag set, confirming that the allocator is tracking neighbor state.
