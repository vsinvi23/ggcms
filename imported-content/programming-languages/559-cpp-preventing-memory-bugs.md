# How Modern C++ Prevents Memory Bugs: AddressSanitizer and Smart Pointers

## Problem Statement
C++ requires explicit manual memory management. Without a Garbage Collector, a developer can accidentally read memory after deleting it (Use-After-Free), access indices outside an array (Buffer Overflow), or forget to free memory (Memory Leak). In C++, these are Undefined Behavior (UB), leading to silent data corruption, remote code execution vulnerabilities, or segmentation faults.

## Architectural Solution: RAII and ASan
Modern C++ tackles memory unsafety on two fronts:
1. **Compile-Time Architecture (RAII & Smart Pointers):** Encoding object lifetimes into the type system and the call stack.
2. **Runtime Verification (AddressSanitizer):** Instrumenting the binary at compile time to poison surrounding memory and trap illegal access immediately.

### ASan Shadow Memory Architecture

```text
[ Application Memory (Heap) ]          [ Shadow Memory ] (1 byte for every 8 App bytes)
+-----------------------+              +-----------------+
| Freed Block           |     -------> | Poisoned (0xFD) | -> Trap on access!
+-----------------------+              +-----------------+
| Valid Object          |     -------> | Valid    (0x00) | -> Allow access
+-----------------------+              +-----------------+
| Unallocated / Padding |     -------> | Poisoned (0xFA) | -> Trap on overflow!
+-----------------------+              +-----------------+
```

## Robust Code Example

### 1. Compile-Time Protection: `std::unique_ptr`
Never use raw `new` and `delete`. Use RAII to map Heap allocations to Stack scopes.

```cpp
#include <iostream>
#include <memory>

class NetworkSocket {
public:
    NetworkSocket() { std::cout << "Socket open\n"; }
    ~NetworkSocket() { std::cout << "Socket closed\n"; }
    void send() { std::cout << "Sending data...\n"; }
};

void process_data() {
    // Memory is allocated on the heap, but owned by stack variable 'sock'
    std::unique_ptr<NetworkSocket> sock = std::make_unique<NetworkSocket>();
    
    sock->send();
    // No delete needed. When 'sock' goes out of scope, destructor frees heap.
} 
```

### 2. Runtime Protection: AddressSanitizer
Compile the code with `-fsanitize=address -g`.

```cpp
int main() {
    int* array = new int[10];
    delete[] array;
    
    // AddressSanitizer traps this Use-After-Free instantly at runtime
    // and prints a stack trace pointing to this exact line.
    return array[0]; 
}
```

## Under the Hood: Mechanics

### Smart Pointers: Zero-Cost Ownership
`std::unique_ptr` has zero overhead. Its size is exactly `sizeof(void*)`. The compiler strictly statically enforces that it cannot be copied (preventing double-frees), only moved. When the compiler generates assembly, it automatically injects the `delete` call at the end of the scope block.

### AddressSanitizer (ASan) Translation
ASan maps a shadow region of memory occupying 1/8th of the virtual address space.
When the compiler encounters a memory read `int x = *ptr;`, ASan instruments the AST to emit assembly akin to:

```c
long shadow_address = (long)ptr >> 3 + Offset;
if (*(char*)shadow_address != 0) {
    __asan_report_error(ptr); // Crash immediately!
}
int x = *ptr; // Real read
```

When you allocate memory, ASan wraps it in "Redzones" (poisoned padding). If an array overflow hits a redzone, the shadow byte triggers a crash. When memory is freed, ASan poisons the entire block, catching Use-After-Free. This slows down execution by ~2x but guarantees memory safety during testing.