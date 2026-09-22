# C++ Concurrency from Scratch: std::thread and OS Scheduling

## Problem Statement
Software needs to exploit modern multi-core processors. Single-threaded execution blocks UI threads during heavy IO or wastes processing potential. We need a way to execute multiple sequences of instructions in parallel, sharing the same memory address space so they can easily exchange data.

## Architectural Solution: The 1:1 Threading Model
C++ provides `std::thread` as a user-space wrapper around Operating System Kernel Threads. C++ uses a **1:1 Threading Model**: every `std::thread` you create is directly mapped to a physical Kernel Thread managed by the OS Scheduler.

When a thread is launched, it gets its own physical stack memory and CPU register state, but it shares the Heap, Data segment, and Code segment with the parent process.

### Memory & Execution Architecture

```text
    +-------------------------------------------------+
    |                     PROCESS                     |
    |                                                 |
    |   [ Code Segment ]        [ Heap (Shared) ]     |
    |                                                 |
    +-----------+-----------------------+-------------+
                |                       |
      +---------v---------+   +---------v---------+
      |  Thread 1 (Main)  |   |  Thread 2         |
      | - Instruction Ptr |   | - Instruction Ptr |
      | - Thread Stack 1  |   | - Thread Stack 2  |
      +-------------------+   +-------------------+
                ^                       ^
================|=======================|================ OS BOUNDARY
                v                       v
      +-------------------+   +-------------------+
      |   Kernel Thread   |   |   Kernel Thread   |
      |   (OS Scheduled)  |   |   (OS Scheduled)  |
      +---------+---------+   +---------+---------+
                v                       v
            [ CPU Core 0 ]          [ CPU Core 1 ]
```

## Robust Code Example

Here we launch multiple threads, capture their completion via `join()`, and show how function arguments are safely passed by value to avoid dangling references.

```cpp
#include <iostream>
#include <thread>
#include <vector>

void worker_task(int id, int workload) {
    // Each thread gets its own copy of 'id' and 'workload' on its Stack
    std::cout << "Thread " << id << " processing workload: " << workload << "\n";
    // Simulate work
    std::this_thread::sleep_for(std::chrono::milliseconds(workload));
}

int main() {
    std::vector<std::thread> workers;

    // Launch threads
    for (int i = 0; i < 4; ++i) {
        // OS allocates new stack, maps kernel thread, and begins execution
        workers.emplace_back(worker_task, i, 100 * (i + 1));
    }

    // Await completion. Main thread blocks here until workers finish.
    for (auto& t : workers) {
        if (t.joinable()) {
            t.join();
        }
    }

    std::cout << "All threads completed.\n";
    return 0;
}
```

## Under the Hood: Mechanics

### OS Syscalls (`clone` and `pthread_create`)
Underneath `std::thread`, the C++ runtime makes syscalls. On Linux, this is typically `pthread_create`, which internally calls the `clone()` syscall. `clone()` creates a new process but instructs the OS to share the parent's memory pages rather than copying them (as `fork()` would).

### Scheduling and Context Switching
The OS kernel scheduler operates on interrupts. Thousands of times a second, a timer interrupt halts the CPU. The OS decides which kernel thread runs next. If a thread is swapped out, the CPU registers are saved to memory (Context Switch), and the new thread's state is loaded. This context switch is expensive (cache invalidation, TLB flushes), meaning spawning thousands of `std::thread`s will cripple performance through thrashing.

### `join()` vs `detach()`
*   **`join()`:** Blocks the calling thread until the child kernel thread terminates.
*   **`detach()`:** Severs the link between the `std::thread` object and the OS thread. The kernel thread becomes a daemon. If `main()` exits, the OS forcibly terminates all detached threads.